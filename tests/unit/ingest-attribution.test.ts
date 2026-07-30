import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockQueueAdd = vi.fn().mockResolvedValue({ id: "job-1" });
const mockLookupWorkspaceByApiKey = vi.fn();
const mockEventLogCreate = vi.fn();
const mockEventLogFindFirst = vi.fn();
const mockEventLogFindMany = vi.fn();
const mockEventLogUpdateMany = vi.fn();
const mockStoreSessionContextForIdentifiers = vi.fn();
const mockClearSessionContextForIdentifiers = vi.fn();
const mockRedisSet = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockCheckConsentRevocationRateLimit = vi.fn();
const mockCheckOrderLimits = vi.fn();
const mockRecoverPurchaseBillingReservation = vi.fn();
const mockTransaction = vi.fn();
const mockPersistInternalAttributionEvent = vi.fn();
const mockSupersedeInternalAttributionEvent = vi.fn();

vi.mock("@/lib/api-key", () => ({
  isValidApiKeyFormat: () => true,
}));

vi.mock("@/lib/api-key-cache", () => ({
  lookupWorkspaceByApiKey: (...args: unknown[]) => mockLookupWorkspaceByApiKey(...args),
}));

vi.mock("@/lib/queue", () => ({
  getEventQueue: () => ({ add: mockQueueAdd }),
  getTiktokQueue: () => ({ add: mockQueueAdd }),
  getGA4Queue: () => ({ add: mockQueueAdd }),
  getKlaviyoQueue: () => ({ add: mockQueueAdd }),
  getRedditQueue: () => ({ add: mockQueueAdd }),
  getPinterestQueue: () => ({ add: mockQueueAdd }),
  getGoogleAdsQueue: () => ({ add: mockQueueAdd }),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  checkConsentRevocationRateLimit: (...args: unknown[]) =>
    mockCheckConsentRevocationRateLimit(...args),
  checkPurchaseRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("@/lib/billing", () => ({
  checkOrderLimits: (...args: unknown[]) => mockCheckOrderLimits(...args),
  recoverPurchaseBillingReservationAfterOutboxFailure: (...args: unknown[]) =>
    mockRecoverPurchaseBillingReservation(...args),
}));

vi.mock("@/lib/session-enrichment", () => ({
  storeSessionContextForIdentifiers: (...args: unknown[]) => mockStoreSessionContextForIdentifiers(...args),
  clearSessionContextForIdentifiers: (...args: unknown[]) => mockClearSessionContextForIdentifiers(...args),
}));

vi.mock("@/lib/db", () => ({
  db: {
    eventLog: {
      create: (...args: unknown[]) => mockEventLogCreate(...args),
      findFirst: (...args: unknown[]) => mockEventLogFindFirst(...args),
      findMany: (...args: unknown[]) => mockEventLogFindMany(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("@/lib/redis", () => ({
  getSharedRedis: () => ({
    set: (...args: unknown[]) => mockRedisSet(...args),
  }),
}));

vi.mock("@/lib/internal-attribution", () => ({
  persistInternalAttributionEvent: (...args: unknown[]) =>
    mockPersistInternalAttributionEvent(...args),
  supersedeInternalAttributionEvent: (...args: unknown[]) =>
    mockSupersedeInternalAttributionEvent(...args),
}));

let postIngest: typeof import("@/app/api/events/ingest/route").POST;
const previousEncryptionKey = process.env.ENCRYPTION_KEY;

function makeRequest(body: Record<string, unknown>, headers: Record<string, string>) {
  return new NextRequest("http://localhost/api/events/ingest", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("ingest attribution handling", () => {
  beforeAll(async () => {
    process.env.ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const route = await import("@/app/api/events/ingest/route");
    postIngest = route.POST;
  });

  afterAll(() => {
    if (previousEncryptionKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = previousEncryptionKey;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T12:00:00.000Z"));

    mockLookupWorkspaceByApiKey.mockResolvedValue({
      id: "ws_123",
      userId: "user_123",
      isActive: true,
      consentMode: "LAX",
      enablePageView: true,
      enableViewContent: true,
      enableAddToCart: true,
      enableInitiateCheckout: true,
      enablePurchase: true,
      hasMetaCredentials: true,
      hasTikTokCredentials: false,
      hasGA4Credentials: false,
      hasKlaviyoCredentials: false,
      hasRedditCredentials: false,
      hasPinterestCredentials: false,
      hasGoogleAdsCredentials: false,
      hasShopifyWebhookSecret: false,
    });
    mockEventLogCreate.mockResolvedValue({ id: "event_log_123" });
    mockEventLogFindFirst.mockResolvedValue(null);
    mockEventLogFindMany.mockResolvedValue([]);
    mockEventLogUpdateMany.mockResolvedValue({ count: 1 });
    mockRedisSet.mockResolvedValue("OK");
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockCheckConsentRevocationRateLimit.mockResolvedValue({ allowed: true });
    mockCheckOrderLimits.mockResolvedValue({ allowed: true });
    mockRecoverPurchaseBillingReservation.mockResolvedValue("released");
    mockPersistInternalAttributionEvent.mockResolvedValue({ id: "internal_event_1" });
    mockSupersedeInternalAttributionEvent.mockResolvedValue({ count: 0 });
    mockTransaction.mockImplementation(
      (callback: (tx: Record<string, unknown>) => unknown) =>
        callback({
          eventLog: {
            upsert: (args: { create: Record<string, unknown> }) =>
              mockEventLogCreate({ data: args.create }),
            updateMany: (...args: unknown[]) => mockEventLogUpdateMany(...args),
          },
        })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses proxy client headers and synthesized fbc in EventLog, queue, and session context", async () => {
    const payload = {
      eventName: "AddToCart",
      eventId: "evt_123",
      timestamp: Date.now(),
      url: "https://www.mizoke.com/products/test",
      referrer: "",
      fbp: "fb.1.1700000000000.1234567890",
      fbc: null,
      fbclid: "CLICK123",
      consent: { analyticsAllowed: true, marketingAllowed: true },
      userData: { email: "buyer@example.com" },
      customData: { value: 29.99, currency: "EUR" },
    };

    const response = await postIngest(
      makeRequest(payload, {
        "X-TL-API-Key": "tl_test",
        "x-tl-client-ip": "203.0.113.8",
        "x-tl-client-ua": "RealBrowser/1.0",
        "x-forwarded-for": "10.0.0.1",
        "user-agent": "ProxyRuntime/1.0",
      })
    );

    expect(response.status).toBe(200);
    const expectedFbc = "fb.1.1779364800000.CLICK123";

    expect(mockStoreSessionContextForIdentifiers).toHaveBeenCalledWith(
      "ws_123",
      expect.objectContaining({ email: "buyer@example.com" }),
      expect.objectContaining({
        fbc: expectedFbc,
        clientIp: "203.0.113.8",
        userAgent: "RealBrowser/1.0",
      })
    );
    expect(mockEventLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fbc: expectedFbc,
          customerIp: "203.0.113.8",
          userAgent: "RealBrowser/1.0",
          payload: expect.objectContaining({
            eventName: "AddToCart",
            customData: { value: 29.99, currency: "EUR" },
            userDataFlags: expect.objectContaining({ hasEmail: true }),
            clickIdFlags: expect.objectContaining({
              hasFbclid: true,
              hasFbc: true,
              hasFbp: true,
            }),
          }),
        }),
      })
    );
    const eventLogPayload = mockEventLogCreate.mock.calls[0][0].data.payload;
    expect(eventLogPayload).not.toHaveProperty("userData");
    expect(JSON.stringify(eventLogPayload)).not.toContain("buyer@example.com");
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "send-meta-event",
      expect.objectContaining({
        event: expect.objectContaining({
          fbc: expectedFbc,
          clientIp: "203.0.113.8",
          userAgent: "RealBrowser/1.0",
          fbclid: "CLICK123",
          userData: { email: "buyer@example.com" },
        }),
      }),
      expect.objectContaining({ jobId: "event-event_log_123" })
    );
  });

  it("keeps strict analytics-only outbox rows free of marketing identity and PII", async () => {
    mockLookupWorkspaceByApiKey.mockResolvedValue({
      id: "ws_strict",
      userId: "user_123",
      isActive: true,
      consentMode: "STRICT",
      enablePageView: true,
      enableViewContent: true,
      enableAddToCart: true,
      enableInitiateCheckout: true,
      enablePurchase: true,
      hasMetaCredentials: true,
      hasTikTokCredentials: false,
      hasGA4Credentials: true,
      hasKlaviyoCredentials: false,
      hasRedditCredentials: false,
      hasPinterestCredentials: false,
      hasGoogleAdsCredentials: false,
      hasShopifyWebhookSecret: false,
    });

    const response = await postIngest(makeRequest({
      eventName: "AddToCart",
      eventId: "evt_strict_analytics",
      timestamp: Date.now(),
      url: "https://example.com/products/test?fbclid=CLICK123",
      fbp: "fb.1.1700000000000.1234567890",
      fbclid: "CLICK123",
      ttclid: "TT123",
      gaClientId: "123.456",
      consent: { analyticsAllowed: true, marketingAllowed: false },
      userData: { email: "private@example.com", phone: "+351910000000" },
      customData: { value: 10, currency: "EUR" },
    }, { "X-TL-API-Key": "tl_test" }));

    expect(response.status).toBe(200);
    expect(mockClearSessionContextForIdentifiers).toHaveBeenCalledWith(
      "ws_strict",
      expect.any(Object),
      expect.objectContaining({ marketing: true, analytics: false, shared: false })
    );
    expect(mockStoreSessionContextForIdentifiers).toHaveBeenCalledWith(
      "ws_strict",
      expect.any(Object),
      expect.objectContaining({
        fbp: null,
        fbc: null,
        ttclid: null,
        gaClientId: "123.456",
        observedAt: Date.now(),
      })
    );
    expect(mockEventLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        destination: "GA4",
        fbp: null,
        fbc: null,
        ttclid: null,
        payload: expect.objectContaining({
          userDataFlags: expect.objectContaining({ hasEmail: false, hasPhone: false }),
          clickIdFlags: expect.objectContaining({ hasFbclid: false, hasFbp: false }),
        }),
      }),
    }));
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "send-ga4-event",
      expect.objectContaining({
        event: expect.objectContaining({
          fbp: null,
          fbclid: null,
          ttclid: null,
          gaClientId: "123.456",
          userData: {},
        }),
      }),
      expect.any(Object)
    );
  });

  it("records internal attribution without platform delivery when analytics is allowed and marketing is denied", async () => {
    mockLookupWorkspaceByApiKey.mockResolvedValue({
      id: "ws_v1_internal",
      userId: "user_123",
      isActive: true,
      consentMode: "STRICT",
      productMode: "SHOPIFY_META_TIKTOK_V1",
      installType: "SHOPIFY_CUSTOM_PIXEL",
      enablePageView: true,
      enableViewContent: true,
      enableAddToCart: true,
      enableInitiateCheckout: true,
      enablePurchase: true,
      hasMetaCredentials: true,
      hasTikTokCredentials: true,
      hasGA4Credentials: false,
      hasKlaviyoCredentials: false,
      hasRedditCredentials: false,
      hasPinterestCredentials: false,
      hasGoogleAdsCredentials: false,
      hasVerifiedShopifyWebhook: false,
    });

    const response = await postIngest(makeRequest({
      eventName: "Purchase",
      eventId: "raw-purchase-event",
      timestamp: Date.now(),
      url: "https://www.mizoke.com/products/sign?ttclid=SECRET",
      referrer: "https://www.tiktok.com/@creator/video/123",
      ttclid: "SECRET",
      ttp: "ttp-secret",
      trackclearSessionId: "session-secret",
      consent: { analyticsAllowed: true, marketingAllowed: false },
      userData: { email: "buyer@example.com", phone: "+351910000000" },
      utmSource: "tiktok",
      utmMedium: "paid_social",
      utmCampaign: "chopper-sign-us",
      customData: {
        value: 42.5,
        currency: "USD",
        numItems: 1,
        orderId: "1001",
        orderName: "#1001",
      },
    }, { "X-TL-API-Key": "tl_test" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      skipped: true,
      reason: "internal_analytics_only",
      internalAnalytics: true,
      destinations: [],
    });
    expect(mockPersistInternalAttributionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws_v1_internal",
        eventName: "Purchase",
        utmSource: "tiktok",
        utmCampaign: "chopper-sign-us",
        value: 42.5,
        currency: "USD",
        numItems: 1,
      })
    );
    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect(mockEventLogCreate).not.toHaveBeenCalled();
    expect(mockCheckOrderLimits).not.toHaveBeenCalled();
    expect(mockSupersedeInternalAttributionEvent).not.toHaveBeenCalled();
  });

  it("does not infer internal analytics consent from LAX mode", async () => {
    const response = await postIngest(makeRequest({
      eventName: "AddToCart",
      eventId: "evt_lax_marketing_denial_only",
      timestamp: Date.now(),
      consent: { marketingAllowed: false },
      customData: { value: 10, currency: "USD" },
    }, { "X-TL-API-Key": "tl_test" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      skipped: true,
    });
    expect(mockPersistInternalAttributionEvent).not.toHaveBeenCalled();
    expect(mockEventLogCreate).not.toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("writes tombstones only for explicitly false partial consent categories", async () => {
    mockLookupWorkspaceByApiKey.mockResolvedValue({
      id: "ws_partial_consent",
      userId: "user_123",
      isActive: true,
      consentMode: "STRICT",
      enablePageView: true,
      enableViewContent: true,
      enableAddToCart: true,
      enableInitiateCheckout: true,
      enablePurchase: true,
      hasMetaCredentials: true,
      hasTikTokCredentials: false,
      hasGA4Credentials: true,
      hasKlaviyoCredentials: false,
      hasRedditCredentials: false,
      hasPinterestCredentials: false,
      hasGoogleAdsCredentials: false,
      hasShopifyWebhookSecret: false,
    });

    const marketingResponse = await postIngest(makeRequest({
      eventName: "AddToCart",
      eventId: "evt_partial_marketing_denial",
      timestamp: Date.now(),
      trackclearSessionId: "session_123",
      consent: { marketingAllowed: false },
      customData: {},
    }, { "X-TL-API-Key": "tl_test" }));
    const analyticsResponse = await postIngest(makeRequest({
      eventName: "AddToCart",
      eventId: "evt_partial_analytics_denial",
      timestamp: Date.now(),
      trackclearSessionId: "session_123",
      consent: { analyticsAllowed: false },
      customData: {},
    }, { "X-TL-API-Key": "tl_test" }));

    expect(marketingResponse.status).toBe(200);
    expect(analyticsResponse.status).toBe(200);
    expect(mockClearSessionContextForIdentifiers).toHaveBeenCalledTimes(2);
    expect(mockClearSessionContextForIdentifiers).toHaveBeenNthCalledWith(
      1,
      "ws_partial_consent",
      expect.objectContaining({ trackclearSessionId: "session_123" }),
      expect.objectContaining({ marketing: true, analytics: false, shared: false })
    );
    expect(mockClearSessionContextForIdentifiers).toHaveBeenNthCalledWith(
      2,
      "ws_partial_consent",
      expect.objectContaining({ trackclearSessionId: "session_123" }),
      expect.objectContaining({ marketing: false, analytics: true, shared: false })
    );
    // STRICT still fails closed for the omitted category; this change only
    // narrows which durable tombstones are materialized.
    expect(mockEventLogCreate).not.toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("persists explicit denial cleanup even when the event toggle is disabled", async () => {
    mockLookupWorkspaceByApiKey.mockResolvedValue({
      id: "ws_disabled",
      userId: "user_123",
      isActive: true,
      consentMode: "STRICT",
      enablePageView: true,
      enableViewContent: true,
      enableAddToCart: false,
      enableInitiateCheckout: true,
      enablePurchase: true,
      hasMetaCredentials: true,
      hasTikTokCredentials: false,
      hasGA4Credentials: false,
      hasKlaviyoCredentials: false,
      hasRedditCredentials: false,
      hasPinterestCredentials: false,
      hasGoogleAdsCredentials: false,
      hasShopifyWebhookSecret: false,
    });

    const response = await postIngest(makeRequest({
      eventName: "AddToCart",
      eventId: "evt_denial_cleanup",
      timestamp: Date.now(),
      trackclearSessionId: "session_123",
      consent: { analyticsAllowed: false, marketingAllowed: false },
      customData: {},
    }, { "X-TL-API-Key": "tl_test" }));

    expect(response.status).toBe(200);
    expect(mockClearSessionContextForIdentifiers).toHaveBeenCalledWith(
      "ws_disabled",
      expect.objectContaining({ trackclearSessionId: "session_123" }),
      expect.objectContaining({ marketing: true, analytics: true, shared: true })
    );
    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect(mockEventLogCreate).not.toHaveBeenCalled();
  });

  it("persists minimized revocations before inactive, credential, and rate-limit delivery gates", async () => {
    const baseWorkspace = {
      id: "ws_revocation_gate",
      userId: "user_123",
      isActive: true,
      consentMode: "STRICT",
      enablePageView: true,
      enableViewContent: true,
      enableAddToCart: true,
      enableInitiateCheckout: true,
      enablePurchase: true,
      hasMetaCredentials: true,
      hasTikTokCredentials: false,
      hasGA4Credentials: false,
      hasKlaviyoCredentials: false,
      hasRedditCredentials: false,
      hasPinterestCredentials: false,
      hasGoogleAdsCredentials: false,
      hasShopifyWebhookSecret: false,
    };
    const scenarios = [
      { name: "inactive", workspace: { ...baseWorkspace, isActive: false } },
      {
        name: "no-credentials",
        workspace: { ...baseWorkspace, hasMetaCredentials: false },
      },
      { name: "rate-limited", workspace: baseWorkspace },
    ];
    mockCheckRateLimit.mockResolvedValue({ allowed: false });

    for (const scenario of scenarios) {
      mockLookupWorkspaceByApiKey.mockResolvedValueOnce(scenario.workspace);
      const response = await postIngest(makeRequest({
        eventName: "AddToCart",
        eventId: `evt_revocation_${scenario.name}`,
        timestamp: Date.now(),
        url: "",
        referrer: "",
        trackclearSessionId: `session_${scenario.name}`,
        consent: { analyticsAllowed: false, marketingAllowed: false },
        userData: {},
        customData: { cartToken: `cart_${scenario.name}` },
        onlyDestinations: [],
      }, { "X-TL-API-Key": "tl_test" }));

      expect(response.status, scenario.name).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        success: true,
        skipped: true,
        reason: "consent_revocation_recorded",
        destinations: [],
      });
      expect(mockClearSessionContextForIdentifiers).toHaveBeenCalledWith(
        "ws_revocation_gate",
        { trackclearSessionId: `session_${scenario.name}` },
        expect.objectContaining({ marketing: true, analytics: true, shared: true })
      );

      mockClearSessionContextForIdentifiers.mockClear();
    }

    expect(mockCheckRateLimit).not.toHaveBeenCalled();
    expect(mockCheckConsentRevocationRateLimit).toHaveBeenCalledTimes(3);
    expect(mockStoreSessionContextForIdentifiers).not.toHaveBeenCalled();
    expect(mockEventLogCreate).not.toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect(mockCheckOrderLimits).not.toHaveBeenCalled();
  });

  it("keeps non-minimized denials behind ordinary delivery gates", async () => {
    mockLookupWorkspaceByApiKey.mockResolvedValue({
      id: "ws_inactive_non_minimized",
      isActive: false,
      consentMode: "STRICT",
      hasMetaCredentials: true,
    });

    const response = await postIngest(makeRequest({
      eventName: "AddToCart",
      eventId: "evt_non_minimized_denial",
      timestamp: Date.now(),
      url: "https://example.com/products/private",
      trackclearSessionId: "session_non_minimized",
      consent: { analyticsAllowed: false, marketingAllowed: false },
      customData: {},
      onlyDestinations: [],
    }, { "X-TL-API-Key": "tl_test" }));

    expect(response.status).toBe(403);
    expect(mockClearSessionContextForIdentifiers).not.toHaveBeenCalled();
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
    expect(mockEventLogCreate).not.toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("retains minimized revocations when their dedicated budget is exhausted", async () => {
    mockCheckConsentRevocationRateLimit.mockResolvedValue({
      allowed: false,
      retryAfter: 37,
    });

    const response = await postIngest(makeRequest({
      eventName: "PageView",
      eventId: "evt_revocation_rate_limited",
      timestamp: Date.now(),
      url: "",
      referrer: "",
      trackclearSessionId: "session_rate_limited",
      consent: { marketingAllowed: false },
      userData: {},
      customData: {},
      onlyDestinations: [],
    }, { "X-TL-API-Key": "tl_test" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("37");
    expect(mockClearSessionContextForIdentifiers).not.toHaveBeenCalled();
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
    expect(mockEventLogCreate).not.toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("rejects consent denial acknowledgements without an opaque identity anchor", async () => {
    const response = await postIngest(makeRequest({
      eventName: "PageView",
      eventId: "evt_revocation_without_anchor",
      timestamp: Date.now(),
      url: "",
      referrer: "",
      consent: { marketingAllowed: false },
      userData: {},
      customData: { orderName: "#1001" },
      onlyDestinations: [],
    }, { "X-TL-API-Key": "tl_test" }));

    expect(response.status).toBe(422);
    expect(mockCheckConsentRevocationRateLimit).not.toHaveBeenCalled();
    expect(mockClearSessionContextForIdentifiers).not.toHaveBeenCalled();
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
    expect(mockEventLogCreate).not.toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("does not acknowledge explicit denial when revocation persistence fails", async () => {
    mockLookupWorkspaceByApiKey.mockResolvedValue({
      id: "ws_denial_failure",
      userId: "user_123",
      isActive: true,
      consentMode: "LAX",
      enablePageView: true,
      enableViewContent: true,
      enableAddToCart: true,
      enableInitiateCheckout: true,
      enablePurchase: true,
      hasMetaCredentials: true,
      hasTikTokCredentials: false,
      hasGA4Credentials: false,
      hasKlaviyoCredentials: false,
      hasRedditCredentials: false,
      hasPinterestCredentials: false,
      hasGoogleAdsCredentials: false,
      hasShopifyWebhookSecret: false,
    });
    mockClearSessionContextForIdentifiers.mockRejectedValueOnce(
      new Error("redis unavailable")
    );

    const response = await postIngest(makeRequest({
      eventName: "AddToCart",
      eventId: "evt_denial_failure",
      timestamp: Date.now(),
      trackclearSessionId: "session_123",
      consent: { analyticsAllowed: false, marketingAllowed: false },
      customData: {},
    }, { "X-TL-API-Key": "tl_test" }));

    expect(response.status).toBe(500);
    expect(mockStoreSessionContextForIdentifiers).not.toHaveBeenCalled();
    expect(mockEventLogCreate).not.toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("filters hidden destinations for Shopify Meta TikTok V1 workspaces", async () => {
    mockLookupWorkspaceByApiKey.mockResolvedValue({
      id: "ws_v1",
      userId: "user_123",
      isActive: true,
      productMode: "SHOPIFY_META_TIKTOK_V1",
      installType: "SHOPIFY_CUSTOM_PIXEL",
      consentMode: "LAX",
      enablePageView: true,
      enableViewContent: true,
      enableAddToCart: true,
      enableInitiateCheckout: true,
      enablePurchase: true,
      hasMetaCredentials: true,
      hasTikTokCredentials: true,
      hasGA4Credentials: true,
      hasKlaviyoCredentials: false,
      hasRedditCredentials: true,
      hasPinterestCredentials: false,
      hasGoogleAdsCredentials: true,
      hasShopifyWebhookSecret: false,
    });

    const response = await postIngest(
      makeRequest(
        {
          eventName: "AddToCart",
          eventId: "evt_v1",
          timestamp: Date.now(),
          consent: { analyticsAllowed: true, marketingAllowed: true },
          customData: { value: 10, currency: "USD" },
        },
        { "X-TL-API-Key": "tl_test" }
      )
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.destinations).toEqual(["META", "TIKTOK"]);
    expect(mockQueueAdd).toHaveBeenCalledTimes(2);
    expect(mockQueueAdd).toHaveBeenNthCalledWith(
      1,
      "send-meta-event",
      expect.any(Object),
      expect.objectContaining({ jobId: "event-event_log_123" })
    );
    expect(mockQueueAdd).toHaveBeenNthCalledWith(
      2,
      "send-tiktok-event",
      expect.any(Object),
      expect.objectContaining({ jobId: "event-event_log_123" })
    );
    expect(mockEventLogCreate).toHaveBeenCalledTimes(2);
    expect(
      mockEventLogCreate.mock.calls.map((call) => call[0].data.destination)
    ).toEqual(["META", "TIKTOK"]);
  });

  it("preserves onlyDestinations for null-mode legacy workspaces", async () => {
    mockLookupWorkspaceByApiKey.mockResolvedValue({
      id: "ws_legacy",
      userId: "user_123",
      isActive: true,
      productMode: null,
      installType: null,
      consentMode: "LAX",
      enablePageView: true,
      enableViewContent: true,
      enableAddToCart: true,
      enableInitiateCheckout: true,
      enablePurchase: true,
      hasMetaCredentials: true,
      hasTikTokCredentials: false,
      hasGA4Credentials: true,
      hasKlaviyoCredentials: false,
      hasRedditCredentials: false,
      hasPinterestCredentials: false,
      hasGoogleAdsCredentials: false,
      hasShopifyWebhookSecret: false,
    });

    const response = await postIngest(
      makeRequest(
        {
          eventName: "AddToCart",
          eventId: "evt_legacy",
          timestamp: Date.now(),
          onlyDestinations: ["GA4"],
          consent: { analyticsAllowed: true, marketingAllowed: true },
          customData: { value: 10, currency: "USD" },
        },
        { "X-TL-API-Key": "tl_test" }
      )
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.destinations).toEqual(["GA4"]);
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "send-ga4-event",
      expect.objectContaining({ destination: "GA4" }),
      expect.objectContaining({ jobId: "event-event_log_123" })
    );
    expect(mockEventLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ destination: "GA4" }),
      })
    );
  });

  it("normalizes Purchase event IDs and Shopify content IDs before logging and queueing", async () => {
    const response = await postIngest(
      makeRequest(
        {
          eventName: "Purchase",
          eventId: "random-browser-id",
          timestamp: Date.now(),
          consent: { analyticsAllowed: true, marketingAllowed: true },
          customData: {
            orderId: "gid://shopify/Order/987654321",
            orderName: "#987654321",
            checkoutToken: "checkout-token-987",
            cartToken: "cart-token-987",
            value: 99,
            currency: "USD",
            contentIds: ["gid://shopify/ProductVariant/111"],
            contents: [{ id: "gid://shopify/ProductVariant/111", quantity: 2, itemPrice: 49.5 }],
          },
        },
        { "X-TL-API-Key": "tl_test" }
      )
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.eventId).toBe("shopify-purchase:ws_123:987654321");
    expect(mockCheckOrderLimits).toHaveBeenCalledWith(
      "user_123",
      "Purchase",
      {
        workspaceId: "ws_123",
        eventId: "shopify-purchase:ws_123:987654321",
        aliases: [
          "checkout:checkout-token-987",
          "order:987654321",
          "name:987654321",
          "cart:cart-token-987",
        ],
      }
    );
    expect(mockEventLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId: "shopify-purchase:ws_123:987654321",
          orderId: "987654321",
          payload: expect.objectContaining({
            customData: expect.objectContaining({
              contentIds: ["111"],
              content_ids: ["111"],
              contents: [
                { id: "111", content_id: "111", quantity: 2, itemPrice: 49.5 },
              ],
            }),
          }),
        }),
      })
    );
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "send-meta-event",
      expect.objectContaining({
        event: expect.objectContaining({
          eventId: "shopify-purchase:ws_123:987654321",
          customData: expect.objectContaining({
            contentIds: ["111"],
            content_ids: ["111"],
          }),
        }),
      }),
      expect.objectContaining({ jobId: "event-event_log_123" })
    );
  });

  it("releases a Purchase usage reservation only after an outbox write rolls back", async () => {
    const reservation = {
      counterKey: "orders:user_123:2026-05",
      seenKeys: ["orders:seen:user_123:2026-05:hash"],
    };
    mockCheckOrderLimits.mockResolvedValue({ allowed: true, reservation });
    mockTransaction.mockRejectedValueOnce(new Error("database transaction failed"));

    const response = await postIngest(
      makeRequest(
        {
          eventName: "Purchase",
          eventId: "browser-purchase",
          timestamp: Date.now(),
          consent: { analyticsAllowed: true, marketingAllowed: true },
          customData: {
            orderName: "#1001",
            checkoutToken: "checkout-1001",
            cartToken: "cart-1001",
            value: 42,
            currency: "EUR",
          },
        },
        { "X-TL-API-Key": "tl_test" }
      )
    );

    expect(response.status).toBe(500);
    expect(mockRecoverPurchaseBillingReservation).toHaveBeenCalledWith(
      reservation,
      {
        workspaceId: "ws_123",
        eventId: "shopify-purchase:ws_123:1001",
        orderId: null,
        orderName: "1001",
        checkoutToken: "checkout-1001",
        cartToken: "cart-1001",
      }
    );
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("keeps the server-side snippet Purchase fallback after webhook verification", async () => {
    mockLookupWorkspaceByApiKey.mockResolvedValue({
      id: "ws_123",
      userId: "user_123",
      isActive: true,
      consentMode: "LAX",
      enablePageView: true,
      enableViewContent: true,
      enableAddToCart: true,
      enableInitiateCheckout: true,
      enablePurchase: true,
      hasMetaCredentials: true,
      hasTikTokCredentials: false,
      hasGA4Credentials: false,
      hasKlaviyoCredentials: false,
      hasRedditCredentials: false,
      hasPinterestCredentials: false,
      hasGoogleAdsCredentials: false,
      hasShopifyWebhookSecret: true,
      hasVerifiedShopifyWebhook: true,
    });

    const response = await postIngest(
      makeRequest(
        {
          eventName: "Purchase",
          eventId: "browser-purchase",
          timestamp: Date.now(),
          trackclearSessionId: "session-1",
          fbp: "fb.1.1700000000000.123",
          consent: { analyticsAllowed: true, marketingAllowed: true },
          customData: { orderId: "1001", value: 49, currency: "EUR" },
        },
        { "X-TL-API-Key": "tl_test" }
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      eventId: "shopify-purchase:ws_123:1001",
      destinations: ["META"],
    });
    expect(mockStoreSessionContextForIdentifiers).toHaveBeenCalledOnce();
    expect(mockEventLogCreate).toHaveBeenCalledOnce();
    expect(mockQueueAdd).toHaveBeenCalledOnce();
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "send-meta-event",
      expect.objectContaining({ eventLogId: "event_log_123" }),
      { jobId: "event-event_log_123", delay: 90_000 }
    );
  });

  it("does not deliver an alias-free browser Purchase for a verified Shopify V1 webhook", async () => {
    mockLookupWorkspaceByApiKey.mockResolvedValue({
      id: "ws_v1",
      userId: "user_123",
      isActive: true,
      productMode: "SHOPIFY_META_TIKTOK_V1",
      installType: "SHOPIFY_CUSTOM_PIXEL",
      consentMode: "LAX",
      enablePurchase: true,
      hasMetaCredentials: true,
      hasTikTokCredentials: true,
      hasGA4Credentials: false,
      hasKlaviyoCredentials: false,
      hasRedditCredentials: false,
      hasPinterestCredentials: false,
      hasGoogleAdsCredentials: false,
      hasShopifyWebhookSecret: true,
      hasVerifiedShopifyWebhook: true,
    });

    const response = await postIngest(
      makeRequest(
        {
          eventName: "Purchase",
          eventId: "unreconciled-browser-purchase",
          timestamp: Date.now(),
          consent: { marketingAllowed: true },
          customData: { value: 49, currency: "EUR" },
        },
        { "X-TL-API-Key": "tl_test" }
      )
    );

    await expect(response.json()).resolves.toMatchObject({
      success: true,
      eventId: "unreconciled-browser-purchase",
      skipped: true,
      reason: "missing_shopify_purchase_identity",
    });
    expect(mockEventLogFindMany).not.toHaveBeenCalled();
    expect(mockEventLogCreate).not.toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect(mockCheckOrderLimits).not.toHaveBeenCalled();
  });

  it("does not drop Purchase when the Redis dedup lock lacks a durable owner", async () => {
    mockRedisSet.mockResolvedValueOnce(null);

    const response = await postIngest(
      makeRequest(
        {
          eventName: "Purchase",
          eventId: "browser-purchase",
          timestamp: Date.now(),
          consent: { marketingAllowed: true },
          customData: { orderId: "gid://shopify/Order/1001", value: 49, currency: "EUR" },
        },
        { "X-TL-API-Key": "tl_test" }
      )
    );

    await expect(response.json()).resolves.toMatchObject({
      success: true,
      eventId: "shopify-purchase:ws_123:1001",
      destinations: ["META"],
    });
    expect(mockEventLogFindMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { eventId: "shopify-purchase:ws_123:1001" },
        ]),
      }),
      select: { destination: true },
    });
    expect(mockEventLogCreate).toHaveBeenCalledOnce();
    expect(mockQueueAdd).toHaveBeenCalledOnce();
  });

  it("repairs only the missing Purchase destination without double-counting billing", async () => {
    mockLookupWorkspaceByApiKey.mockResolvedValue({
      id: "ws_123",
      userId: "user_123",
      isActive: true,
      consentMode: "LAX",
      enablePurchase: true,
      hasMetaCredentials: true,
      hasTikTokCredentials: true,
      hasGA4Credentials: false,
      hasKlaviyoCredentials: false,
      hasRedditCredentials: false,
      hasPinterestCredentials: false,
      hasGoogleAdsCredentials: false,
      hasShopifyWebhookSecret: false,
    });
    mockEventLogFindMany.mockResolvedValueOnce([{ destination: "META" }]);

    const response = await postIngest(
      makeRequest(
        {
          eventName: "Purchase",
          eventId: "browser-purchase",
          timestamp: Date.now(),
          consent: { marketingAllowed: true },
          customData: { orderId: "1001", value: 49, currency: "EUR" },
        },
        { "X-TL-API-Key": "tl_test" }
      )
    );

    await expect(response.json()).resolves.toMatchObject({
      success: true,
      destinations: ["TIKTOK"],
    });
    expect(mockEventLogCreate).toHaveBeenCalledOnce();
    expect(mockEventLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ destination: "TIKTOK" }),
    });
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "send-tiktok-event",
      expect.objectContaining({ destination: "TIKTOK" }),
      expect.objectContaining({ jobId: "event-event_log_123" })
    );
    expect(mockCheckOrderLimits).not.toHaveBeenCalled();
  });

  it("deduplicates a webhook-first Purchase against a later checkout-token fallback", async () => {
    mockEventLogFindMany.mockResolvedValueOnce([{ destination: "META" }]);

    const response = await postIngest(
      makeRequest(
        {
          eventName: "Purchase",
          eventId: "browser-purchase",
          timestamp: Date.now(),
          checkoutToken: "checkout-token-123",
          consent: { marketingAllowed: true },
          customData: {
            checkoutToken: "checkout-token-123",
            value: 49,
            currency: "EUR",
          },
        },
        { "X-TL-API-Key": "tl_test" }
      )
    );

    await expect(response.json()).resolves.toMatchObject({
      success: true,
      deduplicated: true,
      destinations: [],
    });
    expect(mockEventLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ checkoutToken: "checkout-token-123" }]),
        }),
      })
    );
    expect(mockEventLogCreate).not.toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect(mockCheckOrderLimits).not.toHaveBeenCalled();
  });

  it("deduplicates a webhook-first Purchase against a later order-GID fallback", async () => {
    mockEventLogFindMany.mockResolvedValueOnce([{ destination: "META" }]);

    const response = await postIngest(
      makeRequest(
        {
          eventName: "Purchase",
          eventId: "browser-purchase",
          timestamp: Date.now(),
          consent: { marketingAllowed: true },
          customData: {
            orderId: "gid://shopify/Order/567890",
            value: 49,
            currency: "EUR",
          },
        },
        { "X-TL-API-Key": "tl_test" }
      )
    );

    await expect(response.json()).resolves.toMatchObject({
      success: true,
      deduplicated: true,
      destinations: [],
    });
    expect(mockEventLogFindMany.mock.calls[0][0].where.OR).toEqual(
      expect.arrayContaining([{
        orderId: {
          in: expect.arrayContaining([
            "gid://shopify/Order/567890",
            "567890",
          ]),
        },
      }])
    );
    expect(mockEventLogCreate).not.toHaveBeenCalled();
    expect(mockCheckOrderLimits).not.toHaveBeenCalled();
  });

  it("reserves a failed canonical destination so a fallback cannot double-send it", async () => {
    mockLookupWorkspaceByApiKey.mockResolvedValue({
      id: "ws_123",
      userId: "user_123",
      isActive: true,
      consentMode: "LAX",
      enablePurchase: true,
      hasMetaCredentials: true,
      hasTikTokCredentials: true,
      hasGA4Credentials: false,
      hasKlaviyoCredentials: false,
      hasRedditCredentials: false,
      hasPinterestCredentials: false,
      hasGoogleAdsCredentials: false,
      hasShopifyWebhookSecret: true,
      hasVerifiedShopifyWebhook: true,
    });
    // Represents canonical META=SENT and TIKTOK=FAILED. Both destinations are
    // durable aliases and the failed canonical row owns TikTok's future retry.
    mockEventLogFindMany.mockResolvedValueOnce([
      { destination: "META" },
      { destination: "TIKTOK" },
    ]);

    const response = await postIngest(
      makeRequest(
        {
          eventName: "Purchase",
          eventId: "browser-purchase",
          timestamp: Date.now(),
          checkoutToken: "checkout-token-123",
          consent: { marketingAllowed: true },
          customData: {
            checkoutToken: "checkout-token-123",
            value: 49,
            currency: "EUR",
          },
        },
        { "X-TL-API-Key": "tl_test" }
      )
    );

    await expect(response.json()).resolves.toMatchObject({
      deduplicated: true,
      destinations: [],
    });
    expect(mockEventLogFindMany.mock.calls[0][0].where.status).toEqual({
      in: ["SENT", "PENDING", "RETRYING", "FAILED"],
    });
    expect(mockEventLogCreate).not.toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("applies workspace catalog ID affixes during ingest normalization", async () => {
    mockLookupWorkspaceByApiKey.mockResolvedValue({
      id: "ws_123",
      userId: "user_123",
      isActive: true,
      catalogIdMode: "VARIANT_NUMERIC_ID",
      catalogIdPrefix: "shopify_US_",
      catalogIdSuffix: "_online",
      catalogIdTemplate: null,
      consentMode: "LAX",
      enablePageView: true,
      enableViewContent: true,
      enableAddToCart: true,
      enableInitiateCheckout: true,
      enablePurchase: true,
      hasMetaCredentials: true,
      hasTikTokCredentials: false,
      hasGA4Credentials: false,
      hasKlaviyoCredentials: false,
      hasRedditCredentials: false,
      hasPinterestCredentials: false,
      hasGoogleAdsCredentials: false,
      hasShopifyWebhookSecret: false,
    });

    const response = await postIngest(
      makeRequest(
        {
          eventName: "AddToCart",
          eventId: "evt_catalog",
          timestamp: Date.now(),
          consent: { analyticsAllowed: true, marketingAllowed: true },
          customData: {
            value: 25,
            currency: "USD",
            contentIds: ["gid://shopify/ProductVariant/111"],
            contents: [{ id: "gid://shopify/ProductVariant/111", quantity: 1 }],
          },
        },
        { "X-TL-API-Key": "tl_test" }
      )
    );

    expect(response.status).toBe(200);
    expect(mockEventLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: expect.objectContaining({
            customData: expect.objectContaining({
              contentIds: ["shopify_US_111_online"],
              content_ids: ["shopify_US_111_online"],
              contents: [
                {
                  id: "shopify_US_111_online",
                  content_id: "shopify_US_111_online",
                  quantity: 1,
                },
              ],
            }),
          }),
        }),
      })
    );
  });

  it("applies workspace SKU catalog mode during direct ingest normalization", async () => {
    mockLookupWorkspaceByApiKey.mockResolvedValue({
      id: "ws_123",
      userId: "user_123",
      isActive: true,
      catalogIdMode: "SKU",
      catalogIdPrefix: null,
      catalogIdSuffix: null,
      catalogIdTemplate: null,
      consentMode: "LAX",
      enablePageView: true,
      enableViewContent: true,
      enableAddToCart: true,
      enableInitiateCheckout: true,
      enablePurchase: true,
      hasMetaCredentials: true,
      hasTikTokCredentials: false,
      hasGA4Credentials: false,
      hasKlaviyoCredentials: false,
      hasRedditCredentials: false,
      hasPinterestCredentials: false,
      hasGoogleAdsCredentials: false,
      hasShopifyWebhookSecret: false,
    });

    const response = await postIngest(
      makeRequest(
        {
          eventName: "AddToCart",
          eventId: "evt_sku_catalog",
          timestamp: Date.now(),
          consent: { analyticsAllowed: true, marketingAllowed: true },
          customData: {
            value: 25,
            currency: "USD",
            contentIds: ["gid://shopify/ProductVariant/111"],
            contents: [
              {
                id: "gid://shopify/ProductVariant/111",
                productId: "gid://shopify/Product/222",
                sku: "SKU-111",
                quantity: 1,
              },
            ],
          },
        },
        { "X-TL-API-Key": "tl_test" }
      )
    );

    expect(response.status).toBe(200);
    expect(mockEventLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: expect.objectContaining({
            customData: expect.objectContaining({
              contentIds: ["SKU-111"],
              content_ids: ["SKU-111"],
              contents: [
                expect.objectContaining({
                  id: "SKU-111",
                  content_id: "SKU-111",
                  sku: "SKU-111",
                }),
              ],
            }),
          }),
        }),
      })
    );
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "send-meta-event",
      expect.objectContaining({
        event: expect.objectContaining({
          customData: expect.objectContaining({
            contentIds: ["SKU-111"],
            content_ids: ["SKU-111"],
          }),
        }),
      }),
      expect.objectContaining({ jobId: "event-event_log_123" })
    );
  });

  it("applies workspace custom catalog templates during direct ingest normalization", async () => {
    mockLookupWorkspaceByApiKey.mockResolvedValue({
      id: "ws_123",
      userId: "user_123",
      isActive: true,
      catalogIdMode: "CUSTOM",
      catalogIdPrefix: "catalog:",
      catalogIdSuffix: ":online",
      catalogIdTemplate: "{{product_id}}-{{variant_id}}-{{sku}}",
      consentMode: "LAX",
      enablePageView: true,
      enableViewContent: true,
      enableAddToCart: true,
      enableInitiateCheckout: true,
      enablePurchase: true,
      hasMetaCredentials: true,
      hasTikTokCredentials: false,
      hasGA4Credentials: false,
      hasKlaviyoCredentials: false,
      hasRedditCredentials: false,
      hasPinterestCredentials: false,
      hasGoogleAdsCredentials: false,
      hasShopifyWebhookSecret: false,
    });

    const response = await postIngest(
      makeRequest(
        {
          eventName: "AddToCart",
          eventId: "evt_custom_catalog",
          timestamp: Date.now(),
          consent: { analyticsAllowed: true, marketingAllowed: true },
          customData: {
            value: 25,
            currency: "USD",
            contentIds: ["gid://shopify/ProductVariant/111"],
            contents: [{ variantId: 111, productId: 222, sku: "SKU-111", quantity: 1 }],
          },
        },
        { "X-TL-API-Key": "tl_test" }
      )
    );

    expect(response.status).toBe(200);
    expect(mockEventLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: expect.objectContaining({
            customData: expect.objectContaining({
              contentIds: ["catalog:222-111-SKU-111:online"],
              content_ids: ["catalog:222-111-SKU-111:online"],
              contents: [
                expect.objectContaining({
                  id: "catalog:222-111-SKU-111:online",
                  content_id: "catalog:222-111-SKU-111:online",
                }),
              ],
            }),
          }),
        }),
      })
    );
  });

  it("stores session enrichment by TrackClear session and checkout identifiers without email", async () => {
    const response = await postIngest(
      makeRequest(
        {
          eventName: "InitiateCheckout",
          eventId: "checkout-event",
          timestamp: Date.now(),
          trackclearSessionId: "tc-session-123",
          checkoutToken: "checkout-token-123",
          cartToken: "cart-token-123",
          fbp: "fb.1.1700000000000.1234567890",
          gbraid: "GBRAID123",
          wbraid: "WBRAID123",
          consent: { analyticsAllowed: true, marketingAllowed: true },
          customData: {
            checkoutToken: "checkout-token-123",
            cartToken: "cart-token-123",
            value: 99,
            currency: "USD",
          },
        },
        { "X-TL-API-Key": "tl_test" }
      )
    );

    expect(response.status).toBe(200);
    expect(mockStoreSessionContextForIdentifiers).toHaveBeenCalledWith(
      "ws_123",
      expect.objectContaining({
        trackclearSessionId: "tc-session-123",
        checkoutToken: "checkout-token-123",
        cartToken: "cart-token-123",
      }),
      expect.objectContaining({
        fbp: "fb.1.1700000000000.1234567890",
        gbraid: "GBRAID123",
        wbraid: "WBRAID123",
      })
    );
  });

  it("delays the initial Meta InitiateCheckout fallback for contact enrichment", async () => {
    const response = await postIngest(
      makeRequest(
        {
          eventName: "InitiateCheckout",
          eventId: "checkout-enrichment-event",
          timestamp: Date.now(),
          checkoutToken: "checkout-token-123",
          consent: { marketingAllowed: true },
          customData: {
            checkoutToken: "checkout-token-123",
            value: 99,
            currency: "USD",
          },
          excludeDestinations: ["KLAVIYO"],
        },
        { "X-TL-API-Key": "tl_test" }
      )
    );

    expect(response.status).toBe(200);
    expect(mockEventLogUpdateMany).not.toHaveBeenCalled();
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "send-meta-event",
      expect.objectContaining({ eventLogId: "event_log_123" }),
      { jobId: "event-event_log_123", delay: 5_000 }
    );
  });

  it("refreshes one unclaimed Meta checkout row and reuses its deterministic job", async () => {
    const initialPayload = {
      eventName: "InitiateCheckout",
      eventId: "checkout-enrichment-event",
      timestamp: Date.now(),
      checkoutToken: "checkout-token-123",
      consent: { marketingAllowed: true },
      customData: {
        checkoutToken: "checkout-token-123",
        value: 99,
        currency: "USD",
      },
      excludeDestinations: ["KLAVIYO"],
    };
    await postIngest(
      makeRequest(initialPayload, { "X-TL-API-Key": "tl_test" })
    );

    const response = await postIngest(
      makeRequest(
        {
          ...initialPayload,
          excludeDestinations: undefined,
          onlyDestinations: ["META"],
          userData: { email: "buyer@example.com", phone: "+351912345678" },
        },
        { "X-TL-API-Key": "tl_test" }
      )
    );

    expect(response.status).toBe(200);
    expect(mockEventLogUpdateMany).toHaveBeenCalledOnce();
    expect(mockEventLogUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "event_log_123",
        status: "PENDING",
        deliveryClaimToken: null,
        deliveryClaimOwner: null,
        deliveryClaimedAt: null,
        deliveryClaimExpiresAt: null,
      },
      data: expect.objectContaining({
        payload: expect.objectContaining({
          userDataFlags: expect.objectContaining({
            hasEmail: true,
            hasPhone: true,
          }),
        }),
        retryPayloadEncrypted: expect.any(String),
        retryPayloadExpiresAt: expect.any(Date),
      }),
    });
    expect(JSON.stringify(mockEventLogUpdateMany.mock.calls[0][0].data.payload))
      .not.toContain("buyer@example.com");
    expect(mockQueueAdd).toHaveBeenCalledTimes(2);
    expect(mockQueueAdd.mock.calls.map((call) => call[2]?.jobId)).toEqual([
      "event-event_log_123",
      "event-event_log_123",
    ]);
    expect(mockQueueAdd.mock.calls[0][2]).toEqual({
      jobId: "event-event_log_123",
      delay: 5_000,
    });
    expect(mockQueueAdd.mock.calls[1][2]).toEqual({
      jobId: "event-event_log_123",
    });
  });

  it("does not refresh or enqueue a claimed or terminal Meta checkout row", async () => {
    mockEventLogUpdateMany.mockResolvedValueOnce({ count: 0 });

    const response = await postIngest(
      makeRequest(
        {
          eventName: "InitiateCheckout",
          eventId: "claimed-checkout-event",
          timestamp: Date.now(),
          checkoutToken: "checkout-token-claimed",
          consent: { marketingAllowed: true },
          userData: { email: "buyer@example.com" },
          customData: {
            checkoutToken: "checkout-token-claimed",
            value: 99,
            currency: "USD",
          },
          onlyDestinations: ["META"],
        },
        { "X-TL-API-Key": "tl_test" }
      )
    );

    await expect(response.json()).resolves.toMatchObject({
      success: true,
      deduplicated: true,
    });
    expect(mockEventLogUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PENDING",
          deliveryClaimToken: null,
          deliveryClaimOwner: null,
        }),
      })
    );
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("persists top-funnel delivery and propagates TikTok browser identity", async () => {
    mockLookupWorkspaceByApiKey.mockResolvedValue({
      id: "ws_tiktok",
      userId: "user_123",
      isActive: true,
      productMode: "SHOPIFY_META_TIKTOK_V1",
      installType: "SHOPIFY_CUSTOM_PIXEL",
      consentMode: "LAX",
      enablePageView: true,
      enableViewContent: true,
      enableAddToCart: true,
      enableInitiateCheckout: true,
      enablePurchase: true,
      hasMetaCredentials: false,
      hasTikTokCredentials: true,
      hasGA4Credentials: false,
      hasKlaviyoCredentials: false,
      hasRedditCredentials: false,
      hasPinterestCredentials: false,
      hasGoogleAdsCredentials: false,
      hasShopifyWebhookSecret: true,
      hasVerifiedShopifyWebhook: true,
    });

    const response = await postIngest(
      makeRequest(
        {
          eventName: "PageView",
          eventId: "page-view-1",
          timestamp: Date.now(),
          ttclid: "TT-CLICK",
          ttp: "tt.1.1700000000000.browser",
          consent: { analyticsAllowed: true, marketingAllowed: true },
        },
        { "X-TL-API-Key": "tl_test" }
      )
    );

    expect(response.status).toBe(200);
    expect(mockEventLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventName: "PageView",
          destination: "TIKTOK",
          status: "PENDING",
          retryPayloadEncrypted: expect.any(String),
          retryPayloadExpiresAt: expect.any(Date),
        }),
      })
    );
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "send-tiktok-event",
      expect.objectContaining({
        eventLogId: "event_log_123",
        event: expect.objectContaining({
          ttclid: "TT-CLICK",
          ttp: "tt.1.1700000000000.browser",
        }),
      }),
      { jobId: "event-event_log_123" }
    );
  });
});
