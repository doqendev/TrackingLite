import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockQueueAdd = vi.fn().mockResolvedValue({ id: "job-1" });
const mockLookupWorkspaceByApiKey = vi.fn();
const mockEventLogCreate = vi.fn();
const mockStoreSessionContextForIdentifiers = vi.fn();
const mockRedisSet = vi.fn();

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
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  checkPurchaseRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("@/lib/billing", () => ({
  checkOrderLimits: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("@/lib/session-enrichment", () => ({
  storeSessionContextForIdentifiers: (...args: unknown[]) => mockStoreSessionContextForIdentifiers(...args),
}));

vi.mock("@/lib/db", () => ({
  db: {
    eventLog: {
      create: (...args: unknown[]) => mockEventLogCreate(...args),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/redis", () => ({
  getSharedRedis: () => ({
    set: (...args: unknown[]) => mockRedisSet(...args),
  }),
}));

let postIngest: typeof import("@/app/api/events/ingest/route").POST;

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
    const route = await import("@/app/api/events/ingest/route");
    postIngest = route.POST;
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
    mockRedisSet.mockResolvedValue("OK");
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
      })
    );
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
      expect.any(Object)
    );
    expect(mockQueueAdd).toHaveBeenNthCalledWith(
      2,
      "send-tiktok-event",
      expect.any(Object)
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
      expect.objectContaining({ destination: "GA4" })
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
    expect(mockEventLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId: "shopify-purchase:ws_123:987654321",
          orderId: "gid://shopify/Order/987654321",
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
});
