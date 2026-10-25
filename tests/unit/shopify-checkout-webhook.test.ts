import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockWorkspaceFindMany = vi.fn();
const mockEventLogFindFirst = vi.fn();
const mockEventLogFindMany = vi.fn();
const mockEventLogFindUnique = vi.fn();
const mockEventLogCreate = vi.fn();
const mockEventLogUpdateMany = vi.fn();
const mockQueueAdd = vi.fn();
const mockQueueGetJob = vi.fn();
const mockCheckOrderLimits = vi.fn();
const mockLookupSessionContext = vi.fn();
const mockStoreSessionContext = vi.fn();
const mockCaptureWebhook = vi.fn();
const mockClaimWebhook = vi.fn();
const mockCompleteWebhook = vi.fn();
const mockDeferWebhook = vi.fn();
const mockPersistInternalAttributionEvent = vi.fn();
const mockSupersedeInternalAttributionEvent = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    workspace: { findMany: (...args: unknown[]) => mockWorkspaceFindMany(...args) },
    eventLog: {
      findFirst: (...args: unknown[]) => mockEventLogFindFirst(...args),
      findMany: (...args: unknown[]) => mockEventLogFindMany(...args),
      findUnique: (...args: unknown[]) => mockEventLogFindUnique(...args),
      create: (...args: unknown[]) => mockEventLogCreate(...args),
      update: vi.fn(),
      updateMany: (...args: unknown[]) => mockEventLogUpdateMany(...args),
    },
    webhookDeadLetter: { create: vi.fn() },
  },
}));

vi.mock("@/lib/shopify-webhook", () => ({ verifyShopifyWebhook: vi.fn(() => true) }));
vi.mock("@/lib/encryption", () => ({ decrypt: vi.fn(() => "webhook-secret") }));

vi.mock("@/lib/shopify-webhook-inbox", () => ({
  buildShopifyWebhookDeliveryId: vi.fn(() => "sha256:test-delivery"),
  getShopifyWebhookOccurredAt: vi.fn((_topic: string, payload: Record<string, unknown>) =>
    payload.created_at ? new Date(String(payload.created_at)) : null
  ),
  sanitizeWebhookProcessingError: vi.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error)
  ),
  captureVerifiedShopifyWebhook: (...args: unknown[]) => mockCaptureWebhook(...args),
  claimShopifyWebhookInbox: (...args: unknown[]) => mockClaimWebhook(...args),
  completeShopifyWebhookInbox: (...args: unknown[]) => mockCompleteWebhook(...args),
  deferShopifyWebhookInbox: (...args: unknown[]) => mockDeferWebhook(...args),
}));

vi.mock("@/lib/event-retry-envelope", () => ({
  encryptEventRetryEnvelope: vi.fn(() => ({
    retryPayloadEncrypted: "retry-ciphertext",
    retryPayloadIv: "retry-iv",
    retryPayloadTag: "retry-tag",
    retryPayloadExpiresAt: new Date("2026-10-28T00:00:00.000Z"),
  })),
  clearedEventRetryEnvelope: vi.fn(() => ({
    retryPayloadEncrypted: null,
    retryPayloadIv: null,
    retryPayloadTag: null,
    retryPayloadExpiresAt: null,
  })),
}));

vi.mock("@/lib/event-delivery-guard", () => ({
  reserveEventDeliveriesForWebhook: vi.fn(async (ids: string[]) => ({
    token: "webhook-reservation-token",
    eventLogIds: [...ids].sort(),
  })),
  clearedEventDeliveryClaim: vi.fn(() => ({
    deliveryClaimToken: null,
    deliveryClaimOwner: null,
    deliveryClaimedAt: null,
    deliveryClaimExpiresAt: null,
  })),
}));

vi.mock("@/lib/queue", () => {
  const queue = () => ({
    add: (...args: unknown[]) => mockQueueAdd(...args),
    getJob: (...args: unknown[]) => mockQueueGetJob(...args),
  });
  return {
    getEventQueue: queue,
    getTiktokQueue: queue,
    getOpenAIQueue: queue,
    getGA4Queue: queue,
    getKlaviyoQueue: queue,
    getRedditQueue: queue,
    getPinterestQueue: queue,
    getGoogleAdsQueue: queue,
  };
});

vi.mock("@/lib/billing", () => ({
  checkOrderLimits: (...args: unknown[]) => mockCheckOrderLimits(...args),
  decrementOrderCount: vi.fn(),
  recoverPurchaseBillingReservationAfterOutboxFailure: vi.fn(),
}));

vi.mock("@/lib/session-enrichment", () => ({
  lookupSessionContextByIdentifiers: (...args: unknown[]) => mockLookupSessionContext(...args),
  storeSessionContextForIdentifiers: (...args: unknown[]) => mockStoreSessionContext(...args),
}));

vi.mock("@/lib/redis", () => ({
  getSharedRedis: () => ({ eval: vi.fn(async () => 1), set: vi.fn(async () => "OK") }),
}));

vi.mock("@/lib/internal-attribution", () => ({
  persistInternalAttributionEvent: (...args: unknown[]) => mockPersistInternalAttributionEvent(...args),
  supersedeInternalAttributionEvent: (...args: unknown[]) => mockSupersedeInternalAttributionEvent(...args),
}));

import { POST } from "@/app/api/webhooks/shopify/route";
import { CHECKOUT_WEBHOOK_HOLD_MS, buildCheckoutEventId } from "@/lib/shopify-checkout-event";

const CHECKOUT_EVENT_ID = "shopify-checkout:ws_v1:chk-token-1";

const workspace = {
  id: "ws_v1",
  userId: "user_123",
  productMode: "SHOPIFY_META_TIKTOK_V1",
  installType: "SHOPIFY_CUSTOM_PIXEL",
  catalogIdMode: "VARIANT_NUMERIC_ID",
  catalogIdPrefix: null,
  catalogIdSuffix: null,
  catalogIdTemplate: null,
  shopifyWebhookSecretEncrypted: "encrypted",
  shopifyWebhookSecretIv: "iv",
  shopifyWebhookSecretTag: "tag",
  enableMeta: true,
  metaPixelId: "123456789",
  metaAccessTokenEncrypted: "meta-token",
  enableTikTok: true,
  tiktokPixelId: "C123",
  tiktokAccessTokenEncrypted: "tiktok-token",
  enableOpenAI: false,
  openaiPixelId: null,
  openaiApiKeyEncrypted: null,
  enableGA4: true,
  ga4MeasurementId: "G-ABC123",
  ga4ApiSecretEncrypted: "ga4-token",
  enablePinterest: false,
  pinterestConversionTokenEncrypted: null,
  enableReddit: false,
  redditAccessTokenEncrypted: null,
  enableKlaviyo: false,
  klaviyoApiKeyEncrypted: null,
  enableGoogleAds: false,
  googleAdsCustomerId: null,
  googleAdsConversionActionId: null,
  enablePurchase: true,
  enableInitiateCheckout: true,
  consentMode: "LAX",
};

function makeCheckout(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    token: "CHK-TOKEN-1",
    cart_token: "cart-token-1",
    email: "buyer@example.com",
    phone: null,
    created_at: "2026-10-25T03:07:30Z",
    updated_at: "2026-10-25T03:07:40Z",
    currency: "EUR",
    total_price: "39.25",
    source_name: "web",
    landing_site: "/products/sign?fbclid=CLICK123&utm_source=fb&utm_medium=paid",
    note_attributes: [
      { name: "_trackclear_session_id", value: "tc-session-123" },
      { name: "_fbp", value: "fb.1.1792900000000.1234567890" },
      { name: "_tc_consent_marketing", value: "true" },
      { name: "_tc_consent_analytics", value: "true" },
      { name: "_tc_consent_timestamp", value: String(Date.now()) },
    ],
    shipping_address: {
      first_name: "Ana",
      last_name: "Silva",
      city: "Austin",
      province_code: "TX",
      zip: "78701",
      country_code: "US",
      phone: "+1 512 555 0101",
    },
    customer: { id: 987654321 },
    line_items: [{ variant_id: 111, product_id: 222, quantity: 1, price: "39.25" }],
    ...overrides,
  };
}

function shopifyRequest(topic: string, body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/webhooks/shopify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-shopify-hmac-sha256": "valid-hmac",
      "x-shopify-topic": topic,
      "x-shopify-shop-domain": "mizoke.myshopify.com",
      "x-trackclear-inbox-replay": "1",
      "x-trackclear-inbox-workspace": "ws_v1",
    },
    body: JSON.stringify(body),
  });
}

const checkoutRows = () =>
  mockEventLogCreate.mock.calls
    .map((call) => call[0].data)
    .filter((data) => data.eventName === "InitiateCheckout");

describe("server-side InitiateCheckout from Shopify webhooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkspaceFindMany.mockResolvedValue([workspace]);
    mockEventLogFindFirst.mockResolvedValue(null);
    mockEventLogFindMany.mockResolvedValue([]);
    mockEventLogFindUnique.mockResolvedValue(null);
    let eventLogId = 0;
    mockEventLogCreate.mockImplementation(async () => ({ id: `event_log_${++eventLogId}` }));
    mockEventLogUpdateMany.mockResolvedValue({ count: 1 });
    mockQueueGetJob.mockResolvedValue(null);
    mockCheckOrderLimits.mockResolvedValue({ allowed: true });
    mockLookupSessionContext.mockResolvedValue(null);
    mockStoreSessionContext.mockResolvedValue(undefined);
    mockCaptureWebhook.mockImplementation(async (input) => [{
      id: "inbox_1",
      workspaceId: input.workspaceIds[0],
      deliveryId: input.deliveryId,
      topic: input.topic,
      shopDomain: input.shopDomain,
      occurredAt: input.occurredAt,
      status: "PENDING",
    }]);
    mockClaimWebhook.mockResolvedValue({ id: "inbox_1", attempts: 1, lockedAt: new Date() });
    mockCompleteWebhook.mockResolvedValue(undefined);
    mockDeferWebhook.mockResolvedValue(undefined);
    mockPersistInternalAttributionEvent.mockResolvedValue({ id: "internal_1" });
    mockSupersedeInternalAttributionEvent.mockResolvedValue({ count: 0 });
  });

  it("derives one event ID from the checkout token, the same way the pixel does", () => {
    expect(buildCheckoutEventId("ws_v1", "CHK-TOKEN-1")).toBe(CHECKOUT_EVENT_ID);
    expect(buildCheckoutEventId("ws_v1", "  ")).toBeNull();
    expect(buildCheckoutEventId("ws_v1", null)).toBeNull();
  });

  it("creates a held InitiateCheckout per destination with identity from the signed checkout", async () => {
    const response = await POST(shopifyRequest("checkouts/create", makeCheckout()));

    expect(response.status).toBe(200);
    expect(mockCompleteWebhook).toHaveBeenCalledWith(expect.objectContaining({ id: "inbox_1" }));
    const rows = checkoutRows();
    // Shopify V1 keeps Meta and TikTok; GA4 is outside its allowlist.
    expect(rows.map((row) => row.destination)).toEqual(["META", "TIKTOK"]);
    expect(rows[0]).toMatchObject({
      eventId: CHECKOUT_EVENT_ID,
      status: "PENDING",
      source: "webhook",
      checkoutToken: "CHK-TOKEN-1",
      cartToken: "cart-token-1",
      occurredAt: new Date("2026-10-25T03:07:30Z"),
      value: 39.25,
      currency: "EUR",
      fbp: "fb.1.1792900000000.1234567890",
      retryPayloadEncrypted: "retry-ciphertext",
    });
    expect(mockQueueAdd.mock.calls.map((call) => call[0])).toEqual(["send-meta-event", "send-tiktok-event"]);
    expect(mockQueueAdd.mock.calls.map((call) => call[2])).toEqual([
      { jobId: "event-event_log_1", delay: CHECKOUT_WEBHOOK_HOLD_MS },
      { jobId: "event-event_log_2", delay: CHECKOUT_WEBHOOK_HOLD_MS },
    ]);
    const metaEvent = mockQueueAdd.mock.calls[0][1].event;
    expect(metaEvent).toMatchObject({
      eventName: "InitiateCheckout",
      eventId: CHECKOUT_EVENT_ID,
      timestamp: Date.parse("2026-10-25T03:07:30Z"),
      trackclearSessionId: "tc-session-123",
      fbp: "fb.1.1792900000000.1234567890",
      fbclid: "CLICK123",
      userData: {
        email: "buyer@example.com",
        phone: "+1 512 555 0101",
        firstName: "Ana",
        lastName: "Silva",
        city: "Austin",
        state: "TX",
        zip: "78701",
        countryCode: "US",
        customerId: "987654321",
      },
      customData: { value: 39.25, currency: "EUR", num_items: 1, checkout_token: "CHK-TOKEN-1" },
    });
    expect(mockLookupSessionContext).toHaveBeenCalledWith("ws_v1", expect.objectContaining({
      email: "buyer@example.com",
      trackclearSessionId: "tc-session-123",
      checkoutToken: "CHK-TOKEN-1",
      cartToken: "cart-token-1",
    }));
    expect(mockStoreSessionContext).toHaveBeenCalledWith(
      "ws_v1",
      expect.objectContaining({ checkoutToken: "CHK-TOKEN-1" }),
      expect.objectContaining({ hashedEmail: expect.stringMatching(/^[a-f0-9]{64}$/) })
    );
  });

  it("enriches the pixel's pending row for the same checkout instead of adding another event", async () => {
    mockEventLogFindMany.mockResolvedValue([
      { id: "pixel_meta", eventId: CHECKOUT_EVENT_ID, destination: "META" },
    ]);

    await POST(shopifyRequest("checkouts/update", makeCheckout()));

    expect(checkoutRows().map((row) => row.destination)).toEqual(["TIKTOK"]);
    expect(mockEventLogUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "pixel_meta", status: "PENDING", deliveryClaimToken: null }),
      data: expect.objectContaining({ checkoutToken: "CHK-TOKEN-1", retryPayloadEncrypted: "retry-ciphertext" }),
    }));
    // The pixel's retained job keeps its own hold; only new rows get the webhook hold.
    expect(mockQueueAdd.mock.calls.map((call) => call[2])).toEqual([
      { jobId: "event-pixel_meta" },
      { jobId: "event-event_log_1", delay: CHECKOUT_WEBHOOK_HOLD_MS },
    ]);
  });

  it("adds nothing when an older pixel already logged this checkout under another event ID", async () => {
    mockEventLogFindMany.mockResolvedValue([
      { id: "old_meta", eventId: "random-uuid", destination: "META" },
      { id: "old_tiktok", eventId: "random-uuid", destination: "TIKTOK" },
    ]);

    await POST(shopifyRequest("checkouts/update", makeCheckout()));

    expect(checkoutRows()).toHaveLength(0);
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("never reopens a row a worker already claimed or sent", async () => {
    mockEventLogFindMany.mockResolvedValue([
      { id: "sent_meta", eventId: CHECKOUT_EVENT_ID, destination: "META" },
      { id: "sent_tiktok", eventId: CHECKOUT_EVENT_ID, destination: "TIKTOK" },
    ]);
    mockEventLogUpdateMany.mockResolvedValue({ count: 0 });

    await POST(shopifyRequest("checkouts/update", makeCheckout()));

    expect(checkoutRows()).toHaveLength(0);
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("keeps a marketing denial from the cart: internal analytics only, no platform rows", async () => {
    const checkout = makeCheckout({
      note_attributes: [
        { name: "_trackclear_session_id", value: "tc-session-123" },
        { name: "_tc_consent_marketing", value: "false" },
        { name: "_tc_consent_analytics", value: "true" },
        { name: "_tc_consent_timestamp", value: String(Date.now()) },
      ],
    });

    await POST(shopifyRequest("checkouts/create", checkout));

    expect(checkoutRows()).toHaveLength(0);
    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect(mockStoreSessionContext).not.toHaveBeenCalled();
    expect(mockPersistInternalAttributionEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventName: "InitiateCheckout",
      eventId: CHECKOUT_EVENT_ID,
      dedupKey: "CHK-TOKEN-1",
    }));
  });

  it("ignores checkouts when InitiateCheckout is turned off or the checkout is not from the storefront", async () => {
    mockWorkspaceFindMany.mockResolvedValue([{ ...workspace, enableInitiateCheckout: false }]);
    await POST(shopifyRequest("checkouts/create", makeCheckout()));
    expect(checkoutRows()).toHaveLength(0);

    mockWorkspaceFindMany.mockResolvedValue([workspace]);
    await POST(shopifyRequest("checkouts/create", makeCheckout({ source_name: "shopify_draft_order" })));
    expect(checkoutRows()).toHaveLength(0);

    await POST(shopifyRequest("checkouts/create", makeCheckout({ token: null })));
    expect(checkoutRows()).toHaveLength(0);
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  describe("fallback from orders/paid", () => {
    const order = () => ({
      ...makeCheckout(),
      id: 1240,
      name: "#1240",
      checkout_token: "CHK-TOKEN-1",
      created_at: "2026-10-25T03:07:59Z",
      processed_at: "2026-10-25T03:07:59Z",
      billing_address: { first_name: "Ana", last_name: "Silva", country_code: "US", phone: "+1 512 555 0101" },
    });

    it("adds InitiateCheckout for a paid order whose checkout never produced one", async () => {
      await POST(shopifyRequest("orders/paid", order()));

      const rows = checkoutRows();
      expect(rows.map((row) => [row.destination, row.eventId])).toEqual([
        ["META", CHECKOUT_EVENT_ID],
        ["TIKTOK", CHECKOUT_EVENT_ID],
      ]);
      expect(rows[0].occurredAt).toEqual(new Date("2026-10-25T03:07:59Z"));
      const checkoutJobs = mockQueueAdd.mock.calls.filter((call) => call[1].event.eventName === "InitiateCheckout");
      expect(checkoutJobs.map((call) => call[2])).toEqual([
        { jobId: "event-event_log_1" },
        { jobId: "event-event_log_2" },
      ]);
      // The canonical Purchase is still created and queued.
      expect(mockEventLogCreate.mock.calls.some((call) => call[0].data.eventName === "Purchase")).toBe(true);
    });

    it("adds nothing when the checkout already has an InitiateCheckout", async () => {
      mockEventLogFindMany.mockImplementation(async (args: { where?: { eventName?: string } }) =>
        args?.where?.eventName === "InitiateCheckout"
          ? [
              { id: "pixel_meta", eventId: CHECKOUT_EVENT_ID, destination: "META" },
              { id: "pixel_tiktok", eventId: "random-uuid", destination: "TIKTOK" },
            ]
          : []
      );

      await POST(shopifyRequest("orders/paid", order()));

      expect(checkoutRows()).toHaveLength(0);
      expect(mockQueueAdd.mock.calls.some((call) => call[1].event.eventName === "InitiateCheckout")).toBe(false);
      expect(mockEventLogCreate.mock.calls.some((call) => call[0].data.eventName === "Purchase")).toBe(true);
    });

    it("never lets a checkout fallback failure block the Purchase", async () => {
      mockEventLogFindMany.mockImplementation(async (args: { where?: { eventName?: string } }) => {
        if (args?.where?.eventName === "InitiateCheckout") throw new Error("database unavailable");
        return [];
      });

      const response = await POST(shopifyRequest("orders/paid", order()));

      expect(response.status).toBe(200);
      expect(mockEventLogCreate.mock.calls.some((call) => call[0].data.eventName === "Purchase")).toBe(true);
      expect(mockDeferWebhook).not.toHaveBeenCalled();
    });
  });
});
