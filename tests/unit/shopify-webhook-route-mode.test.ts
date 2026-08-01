import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockWorkspaceFindMany = vi.fn();
const mockEventLogFindFirst = vi.fn();
const mockEventLogFindMany = vi.fn();
const mockEventLogFindUnique = vi.fn();
const mockEventLogCreate = vi.fn();
const mockEventLogUpdate = vi.fn();
const mockEventLogUpdateMany = vi.fn();
const mockDeadLetterCreate = vi.fn();
const mockQueueAdd = vi.fn();
const mockQueueGetJob = vi.fn();
const mockCheckOrderLimits = vi.fn();
const mockRecoverPurchaseBillingReservation = vi.fn();
const mockLookupSessionContext = vi.fn();
const mockRedisEval = vi.fn();
const mockRedisSet = vi.fn();
const mockCaptureWebhook = vi.fn();
const mockClaimWebhook = vi.fn();
const mockCompleteWebhook = vi.fn();
const mockDeferWebhook = vi.fn();
const mockReserveEventDeliveriesForWebhook = vi.fn();
const mockPersistInternalAttributionEvent = vi.fn();
const mockSupersedeInternalAttributionEvent = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    workspace: {
      findMany: (...args: unknown[]) => mockWorkspaceFindMany(...args),
    },
    eventLog: {
      findFirst: (...args: unknown[]) => mockEventLogFindFirst(...args),
      findMany: (...args: unknown[]) => mockEventLogFindMany(...args),
      findUnique: (...args: unknown[]) => mockEventLogFindUnique(...args),
      create: (...args: unknown[]) => mockEventLogCreate(...args),
      update: (...args: unknown[]) => mockEventLogUpdate(...args),
      updateMany: (...args: unknown[]) => mockEventLogUpdateMany(...args),
    },
    webhookDeadLetter: {
      create: (...args: unknown[]) => mockDeadLetterCreate(...args),
    },
  },
}));

vi.mock("@/lib/shopify-webhook", () => ({
  verifyShopifyWebhook: vi.fn(() => true),
}));

vi.mock("@/lib/encryption", () => ({
  decrypt: vi.fn(() => "webhook-secret"),
}));

vi.mock("@/lib/shopify-webhook-inbox", () => ({
  buildShopifyWebhookDeliveryId: vi.fn(() => "sha256:test-delivery"),
  getShopifyWebhookOccurredAt: vi.fn((_topic: string, payload: Record<string, unknown>) =>
    payload.processed_at ? new Date(String(payload.processed_at)) : null
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
    retryPayloadExpiresAt: new Date("2026-07-30T00:00:00.000Z"),
  })),
  clearedEventRetryEnvelope: vi.fn(() => ({
    retryPayloadEncrypted: null,
    retryPayloadIv: null,
    retryPayloadTag: null,
    retryPayloadExpiresAt: null,
  })),
}));

vi.mock("@/lib/event-delivery-guard", () => ({
  reserveEventDeliveriesForWebhook: (...args: unknown[]) =>
    mockReserveEventDeliveriesForWebhook(...args),
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
  recoverPurchaseBillingReservationAfterOutboxFailure: (...args: unknown[]) =>
    mockRecoverPurchaseBillingReservation(...args),
}));

vi.mock("@/lib/session-enrichment", () => ({
  lookupSessionContextByIdentifiers: (...args: unknown[]) => mockLookupSessionContext(...args),
}));

vi.mock("@/lib/redis", () => ({
  getSharedRedis: () => ({
    eval: (...args: unknown[]) => mockRedisEval(...args),
    set: (...args: unknown[]) => mockRedisSet(...args),
  }),
}));

vi.mock("@/lib/internal-attribution", () => ({
  persistInternalAttributionEvent: (...args: unknown[]) =>
    mockPersistInternalAttributionEvent(...args),
  supersedeInternalAttributionEvent: (...args: unknown[]) =>
    mockSupersedeInternalAttributionEvent(...args),
}));

import { POST } from "@/app/api/webhooks/shopify/route";

const baseWorkspace = {
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
  enableReddit: false,
  redditAccessTokenEncrypted: null,
  enablePinterest: false,
  pinterestConversionTokenEncrypted: null,
  enableTikTok: true,
  tiktokPixelId: "C123",
  tiktokAccessTokenEncrypted: "tiktok-token",
  enableGA4: true,
  ga4MeasurementId: "G-ABC123",
  ga4ApiSecretEncrypted: "ga4-token",
  enableKlaviyo: false,
  klaviyoApiKeyEncrypted: null,
  enableGoogleAds: false,
  googleAdsConversionId: null,
  enablePurchase: true,
  consentMode: "LAX",
};

function makeShopifyRequest(
  body: Record<string, unknown>,
  { replay = true }: { replay?: boolean } = {}
) {
  return new NextRequest("http://localhost/api/webhooks/shopify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-shopify-hmac-sha256": "valid-hmac",
      "x-shopify-topic": "orders/paid",
      "x-shopify-shop-domain": "mizoke.myshopify.com",
      ...(replay
        ? {
            "x-trackclear-inbox-replay": "1",
            "x-trackclear-inbox-workspace": "ws_v1",
          }
        : {}),
    },
    body: JSON.stringify(body),
  });
}

function makeOrder(): Record<string, unknown> & { line_items: Array<Record<string, unknown>> } {
  return {
    id: 1001,
    name: "#1001",
    total_price: "42.50",
    currency: "USD",
    email: "buyer@example.com",
    source_name: "web",
    landing_site: "/products/sign?fbclid=CLICK123&utm_source=meta",
    note_attributes: [
      { name: "_trackclear_session_id", value: "tc-session-123" },
      { name: "_fbp", value: "fb.1.1700000000000.1234567890" },
      { name: "_ttp", value: "tt.1.1700000000000.webhook" },
      { name: "_tc_consent_marketing", value: "true" },
      { name: "_tc_consent_timestamp", value: String(Date.now()) },
    ],
    client_details: {
      browser_ip: "203.0.113.10",
      user_agent: "ShopifyBrowser/1.0",
    },
    line_items: [
      {
        variant_id: 111,
        product_id: 222,
        quantity: 2,
        price: "21.25",
      },
    ],
  };
}

describe("Shopify webhook workspace mode allowlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkspaceFindMany.mockResolvedValue([baseWorkspace]);
    mockEventLogFindFirst.mockResolvedValue(null);
    mockEventLogFindMany.mockResolvedValue([]);
    let eventLogId = 0;
    mockEventLogCreate.mockImplementation(async () => ({
      id: `event_log_${++eventLogId}`,
    }));
    mockCheckOrderLimits.mockResolvedValue({ allowed: true });
    mockRecoverPurchaseBillingReservation.mockResolvedValue("released");
    mockEventLogFindUnique.mockResolvedValue(null);
    mockEventLogUpdate.mockResolvedValue({});
    mockEventLogUpdateMany.mockResolvedValue({ count: 1 });
    mockLookupSessionContext.mockResolvedValue(null);
    mockRedisEval.mockResolvedValue(1);
    mockRedisSet.mockResolvedValue("OK");
    mockQueueGetJob.mockResolvedValue(null);
    mockCaptureWebhook.mockImplementation(async (input) => [{
      id: "inbox_1",
      workspaceId: input.workspaceIds[0],
      deliveryId: input.deliveryId,
      topic: input.topic,
      shopDomain: input.shopDomain,
      occurredAt: input.occurredAt,
      status: "PENDING",
    }]);
    mockClaimWebhook.mockResolvedValue({
      id: "inbox_1",
      attempts: 1,
      lockedAt: new Date("2026-07-27T10:00:00.000Z"),
    });
    mockCompleteWebhook.mockResolvedValue(undefined);
    mockDeferWebhook.mockResolvedValue(undefined);
    mockReserveEventDeliveriesForWebhook.mockImplementation(async (ids: string[]) => ({
      token: "webhook-reservation-token",
      eventLogIds: [...ids].sort(),
    }));
    mockPersistInternalAttributionEvent.mockResolvedValue({ id: "internal_event_1" });
    mockSupersedeInternalAttributionEvent.mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("acknowledges a durable live delivery without synchronous processing", async () => {
    const response = await POST(makeShopifyRequest(makeOrder(), { replay: false }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, captured: 1 });
    expect(mockCaptureWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ recordReceipt: true })
    );
    expect(mockClaimWebhook).not.toHaveBeenCalled();
    expect(mockEventLogCreate).not.toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect(mockCompleteWebhook).not.toHaveBeenCalled();
    expect(mockDeferWebhook).not.toHaveBeenCalled();
  });

  it("only sends Meta and TikTok for Shopify V1 workspaces", async () => {
    const response = await POST(makeShopifyRequest(makeOrder()));

    expect(response.status).toBe(200);
    expect(mockCaptureWebhook).toHaveBeenCalledBefore(mockEventLogCreate);
    expect(mockCompleteWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ id: "inbox_1", attempts: 1 })
    );
    expect(mockEventLogCreate).toHaveBeenCalledTimes(2);
    const canonicalUpdates = mockEventLogUpdateMany.mock.calls.filter(
      (call) => call[0]?.data?.retryPayloadEncrypted === "retry-ciphertext"
    );
    expect(canonicalUpdates).toHaveLength(2);
    expect(canonicalUpdates[0][0].data).toMatchObject({
      retryPayloadEncrypted: "retry-ciphertext",
      retryPayloadIv: "retry-iv",
      retryPayloadTag: "retry-tag",
      deliveryClaimToken: null,
    });
    expect(mockEventLogCreate.mock.calls.map((call) => call[0].data.destination)).toEqual([
      "META",
      "TIKTOK",
    ]);
    expect(mockEventLogCreate.mock.calls[0][0].data.eventId).toBe(
      "shopify-purchase:ws_v1:1001"
    );
    expect(mockQueueAdd.mock.calls[0][1].event.eventId).toBe(
      "shopify-purchase:ws_v1:1001"
    );
    expect(mockQueueAdd.mock.calls.map((call) => call[0])).toEqual([
      "send-meta-event",
      "send-tiktok-event",
    ]);
    expect(mockQueueAdd.mock.calls[1][1].event.ttp).toBe(
      "tt.1.1700000000000.webhook"
    );
    expect(mockQueueAdd.mock.calls.map((call) => call[2])).toEqual([
      { jobId: "event-event_log_1" },
      { jobId: "event-event_log_2" },
    ]);
    expect(mockLookupSessionContext).toHaveBeenCalledWith(
      "ws_v1",
      expect.objectContaining({
        email: "buyer@example.com",
        trackclearSessionId: "tc-session-123",
        orderId: "1001",
        orderName: "#1001",
      })
    );
    expect(mockEventLogCreate.mock.calls[0][0].data.payload).toMatchObject({
      attributionSource: "cart_attributes",
      attributionSources: expect.arrayContaining(["cart_attributes"]),
      trackclearSessionIdPresent: true,
      consent: expect.objectContaining({ marketing: true }),
    });
  });

  it("uses Shopify processed_at as the destination event timestamp", async () => {
    const order = makeOrder();
    order.processed_at = "2026-07-27T09:15:30.000Z";

    const response = await POST(makeShopifyRequest(order));

    expect(response.status).toBe(200);
    expect(mockQueueAdd.mock.calls[0][1].event.timestamp).toBe(
      new Date("2026-07-27T09:15:30.000Z").getTime()
    );
  });

  it("uses the captured order time when delayed replay synthesizes landing-site fbc", async () => {
    const order = makeOrder();
    order.processed_at = "2026-07-27T09:15:30.000Z";

    const response = await POST(makeShopifyRequest(order));

    expect(response.status).toBe(200);
    expect(mockQueueAdd.mock.calls[0][1].event.fbc).toBe(
      `fb.1.${new Date("2026-07-27T09:15:30.000Z").getTime()}.CLICK123`
    );
  });

  it("returns 503 and does not process when durable capture fails", async () => {
    mockCaptureWebhook.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await POST(makeShopifyRequest(makeOrder()));

    expect(response.status).toBe(503);
    expect(mockEventLogCreate).not.toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("acknowledges a durable webhook and defers it when downstream processing fails", async () => {
    const reservation = {
      counterKey: "orders:user_123:2026-07",
      seenKeys: ["orders:seen:user_123:2026-07:hash"],
    };
    mockCheckOrderLimits.mockResolvedValueOnce({ allowed: true, reservation });
    mockEventLogCreate.mockRejectedValueOnce(new Error("temporary write failure"));

    const response = await POST(makeShopifyRequest(makeOrder()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, deferred: true });
    expect(mockDeferWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ id: "inbox_1", attempts: 1 }),
      expect.objectContaining({ message: "temporary write failure" })
    );
    expect(mockCompleteWebhook).not.toHaveBeenCalled();
    expect(mockRecoverPurchaseBillingReservation).toHaveBeenCalledWith(
      reservation,
      {
        workspaceId: "ws_v1",
        eventId: "shopify-purchase:ws_v1:1001",
        orderId: "1001",
        orderName: "1001",
        checkoutToken: null,
        cartToken: null,
      }
    );
  });

  it("replays a partial queue failure without double-counting the order", async () => {
    mockQueueAdd
      .mockResolvedValueOnce({ id: "meta-job" })
      .mockRejectedValueOnce(new Error("queue unavailable"));

    const firstResponse = await POST(makeShopifyRequest(makeOrder()));
    expect(firstResponse.status).toBe(200);
    await expect(firstResponse.json()).resolves.toMatchObject({ deferred: true });
    expect(mockCheckOrderLimits).toHaveBeenCalledTimes(1);

    mockClaimWebhook.mockResolvedValueOnce({
      id: "inbox_1",
      attempts: 2,
      lockedAt: new Date("2026-07-27T10:01:00.000Z"),
    });
    mockEventLogFindMany.mockResolvedValueOnce([{
      id: "event_log_1",
      eventId: "shopify-purchase:ws_v1:1001",
      orderId: "1001",
      destination: "META",
      status: "PENDING",
    }]);
    mockEventLogCreate.mockReset();
    mockEventLogCreate.mockRejectedValue({ code: "P2002" });
    mockEventLogFindUnique.mockImplementation(async (args) => ({
      id: args.where.workspaceId_eventId_destination.destination === "META"
        ? "event_log_1"
        : "event_log_2",
      status: "PENDING",
    }));
    mockQueueAdd.mockReset();
    mockQueueAdd.mockResolvedValue({});

    const replayResponse = await POST(makeShopifyRequest(makeOrder()));

    expect(replayResponse.status).toBe(200);
    await expect(replayResponse.json()).resolves.toMatchObject({ deferred: false });
    expect(mockCheckOrderLimits).toHaveBeenCalledTimes(1);
    expect(mockQueueAdd).toHaveBeenCalledTimes(2);
    expect(mockQueueAdd.mock.calls.map((call) => call[2])).toEqual([
      { jobId: "event-event_log_1" },
      { jobId: "event-event_log_2" },
    ]);
    expect(mockCompleteWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ id: "inbox_1", attempts: 2 })
    );
  });

  it("idempotently reserves billing aliases when replay starts before any Purchase row", async () => {
    mockClaimWebhook.mockResolvedValueOnce({
      id: "inbox_1",
      attempts: 2,
      lockedAt: new Date("2026-07-27T10:01:00.000Z"),
    });
    const order = makeOrder();
    order.checkout_token = "checkout-token";
    order.cart_token = "cart-token";

    const response = await POST(makeShopifyRequest(order));

    expect(response.status).toBe(200);
    expect(mockEventLogFindMany).toHaveBeenCalled();
    expect(mockCheckOrderLimits).toHaveBeenCalledWith(
      "user_123",
      "Purchase",
      {
        workspaceId: "ws_v1",
        eventId: "shopify-purchase:ws_v1:1001",
        aliases: [
          "checkout:checkout-token",
          "order:1001",
          "name:1001",
          "cart:cart-token",
        ],
      }
    );
    expect(mockCompleteWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ id: "inbox_1", attempts: 2 })
    );
  });

  it("defers when a dedup lock has no durable EventLog owner", async () => {
    mockRedisSet.mockResolvedValueOnce(null);

    const response = await POST(makeShopifyRequest(makeOrder()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ deferred: true });
    expect(mockEventLogCreate).not.toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect(mockDeferWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ id: "inbox_1", attempts: 1 }),
      expect.objectContaining({
        message: "Purchase dedup lock is held without a durable EventLog owner",
      })
    );
    expect(mockCompleteWebhook).not.toHaveBeenCalled();
  });

  it("does not clear a late same-ID worker claim discovered by P2002", async () => {
    mockEventLogCreate
      .mockRejectedValueOnce({ code: "P2002" })
      .mockResolvedValueOnce({ id: "created_tiktok" });
    mockEventLogFindUnique.mockResolvedValueOnce({
      id: "late_same_id",
      status: "PENDING",
    });
    mockReserveEventDeliveriesForWebhook.mockImplementation(async (ids: string[]) => {
      if (ids.includes("late_same_id")) {
        throw new Error("EventLog late_same_id is owned by an active worker");
      }
      return {
        token: "webhook-reservation-token",
        eventLogIds: [...ids].sort(),
      };
    });

    const response = await POST(makeShopifyRequest(makeOrder()));

    await expect(response.json()).resolves.toMatchObject({ deferred: true });
    expect(mockReserveEventDeliveriesForWebhook).toHaveBeenCalledWith([
      "late_same_id",
    ]);
    expect(
      mockEventLogUpdateMany.mock.calls.some(
        (call) =>
          call[0]?.where?.id === "late_same_id" &&
          call[0]?.data?.retryPayloadEncrypted === "retry-ciphertext"
      )
    ).toBe(false);
    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect(mockCompleteWebhook).not.toHaveBeenCalled();
  });

  it("defers canonical delivery while a different browser event is still in flight", async () => {
    const order = makeOrder();
    order.checkout_token = "checkout-token";
    mockEventLogFindMany.mockResolvedValueOnce([{
      id: "browser_log",
      eventId: "shopify-purchase:ws_v1:checkout-token",
      orderId: null,
      destination: "META",
      status: "RETRYING",
    }]);
    mockReserveEventDeliveriesForWebhook.mockRejectedValueOnce(
      new Error("EventLog browser_log is owned by an active worker")
    );

    const response = await POST(makeShopifyRequest(order));

    await expect(response.json()).resolves.toMatchObject({ deferred: true });
    expect(mockEventLogFindMany.mock.calls[0][0].where.OR).toEqual(
      expect.arrayContaining([
        {
          eventId: {
            in: expect.arrayContaining([
              "shopify-purchase:ws_v1:1001",
              "shopify-purchase:ws_v1:checkout-token",
            ]),
          },
        },
      ])
    );
    expect(mockEventLogCreate).not.toHaveBeenCalled();
    expect(mockCompleteWebhook).not.toHaveBeenCalled();
  });

  it("reconciles an order-ID-only browser Purchase when the webhook also has a name", async () => {
    const order = makeOrder();
    order.id = "gid://shopify/Order/567890";
    order.name = "#1001";
    mockEventLogFindMany.mockResolvedValueOnce([{
      id: "browser_gid_log",
      eventId: "shopify-purchase:ws_v1:567890",
      orderId: "gid://shopify/Order/567890",
      destination: "META",
      status: "RETRYING",
    }]);
    mockReserveEventDeliveriesForWebhook.mockRejectedValueOnce(
      new Error("EventLog browser_gid_log is owned by an active worker")
    );

    const response = await POST(makeShopifyRequest(order));

    await expect(response.json()).resolves.toMatchObject({ deferred: true });
    expect(mockEventLogFindMany.mock.calls[0][0].where.OR).toEqual(
      expect.arrayContaining([{
        eventId: {
          in: expect.arrayContaining([
            "shopify-purchase:ws_v1:1001",
            "shopify-purchase:ws_v1:567890",
          ]),
        },
      }])
    );
    expect(mockEventLogCreate).not.toHaveBeenCalled();
  });

  it("supersedes a delayed different-ID fallback before canonical delivery", async () => {
    const order = makeOrder();
    order.checkout_token = "checkout-token";
    mockEventLogFindMany.mockResolvedValueOnce([{
      id: "delayed_browser_log",
      eventId: "shopify-purchase:ws_v1:checkout-token",
      orderId: null,
      destination: "META",
      status: "PENDING",
      source: "snippet",
    }]);
    mockQueueGetJob
      .mockResolvedValueOnce({ getState: vi.fn().mockResolvedValue("delayed") })
      .mockResolvedValue(null);

    const response = await POST(makeShopifyRequest(order));

    expect(response.status).toBe(200);
    expect(mockEventLogUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "delayed_browser_log",
          status: { in: ["PENDING", "RETRYING", "FAILED"] },
          deliveryClaimToken: "webhook-reservation-token",
        }),
        data: expect.objectContaining({ status: "SUPERSEDED" }),
      })
    );
    expect(mockEventLogCreate).toHaveBeenCalledTimes(2);
    expect(mockCompleteWebhook).toHaveBeenCalled();
  });

  it("lets the canonical webhook replace a failed browser event", async () => {
    mockEventLogFindMany.mockResolvedValueOnce([{
      id: "browser_log",
      eventId: "shopify-purchase:ws_v1:checkout-token",
      orderId: "1001",
      destination: "META",
      status: "FAILED",
    }]);

    const response = await POST(makeShopifyRequest(makeOrder()));

    expect(response.status).toBe(200);
    expect(mockEventLogCreate).toHaveBeenCalledTimes(2);
    expect(mockCheckOrderLimits).not.toHaveBeenCalled();
    expect(mockEventLogUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "browser_log",
          status: { in: ["PENDING", "RETRYING", "FAILED"] },
          deliveryClaimToken: "webhook-reservation-token",
        }),
        data: expect.objectContaining({
          status: "SUPERSEDED",
          retryPayloadEncrypted: null,
        }),
      })
    );
    expect(mockCompleteWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ id: "inbox_1", attempts: 1 })
    );
  });

  it("deduplicates only the destination already sent by a different event ID", async () => {
    mockEventLogFindMany.mockResolvedValueOnce([
      {
        id: "browser_meta_log",
        eventId: "shopify-purchase:ws_v1:checkout-token",
        orderId: "1001",
        destination: "META",
        status: "SENT",
      },
      {
        id: "pending_meta_alias",
        eventId: "shopify-purchase:ws_v1:cart-token",
        orderId: "1001",
        destination: "META",
        status: "PENDING",
      },
    ]);

    const response = await POST(makeShopifyRequest(makeOrder()));

    expect(response.status).toBe(200);
    expect(mockEventLogCreate).toHaveBeenCalledTimes(1);
    expect(mockEventLogCreate.mock.calls[0][0].data.destination).toBe("TIKTOK");
    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
    expect(mockQueueAdd.mock.calls[0][0]).toBe("send-tiktok-event");
    expect(mockEventLogUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "pending_meta_alias",
          deliveryClaimOwner: "SHOPIFY_WEBHOOK",
        }),
        data: expect.objectContaining({ status: "SUPERSEDED" }),
      })
    );
  });

  it("records only privacy-minimized internal attribution after a sale or sharing opt-out", async () => {
    const order = makeOrder();
    order.note_attributes = (order.note_attributes as Array<Record<string, unknown>>)
      .concat(
        { name: "_tc_consent_analytics", value: "true" },
        { name: "_tc_consent_sale_of_data", value: "false" }
      );

    const response = await POST(makeShopifyRequest(order));

    expect(response.status).toBe(200);
    expect(mockEventLogCreate).not.toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect(mockCheckOrderLimits).not.toHaveBeenCalled();
    expect(mockPersistInternalAttributionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws_v1",
        eventName: "Purchase",
        utmSource: "meta",
        value: 42.5,
        currency: "USD",
        numItems: 2,
      })
    );
    expect(mockCompleteWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ id: "inbox_1", attempts: 1 })
    );
  });

  it("stores nothing when analytics and marketing are both denied", async () => {
    const order = makeOrder();
    order.note_attributes = (order.note_attributes as Array<Record<string, unknown>>)
      .map((attribute) =>
        attribute.name === "_tc_consent_marketing"
          ? { ...attribute, value: "false" }
          : attribute
      )
      .concat({ name: "_tc_consent_analytics", value: "false" });

    const response = await POST(makeShopifyRequest(order));

    expect(response.status).toBe(200);
    expect(mockPersistInternalAttributionEvent).not.toHaveBeenCalled();
    expect(mockEventLogCreate).not.toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect(mockCheckOrderLimits).not.toHaveBeenCalled();
  });

  it("does not infer internal analytics consent from LAX webhook defaults", async () => {
    const order = makeOrder();
    order.note_attributes = (order.note_attributes as Array<Record<string, unknown>>)
      .map((attribute) =>
        attribute.name === "_tc_consent_marketing"
          ? { ...attribute, value: "false" }
          : attribute
      );

    const response = await POST(makeShopifyRequest(order));

    expect(response.status).toBe(200);
    expect(mockPersistInternalAttributionEvent).not.toHaveBeenCalled();
    expect(mockEventLogCreate).not.toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect(mockCheckOrderLimits).not.toHaveBeenCalled();
  });

  it("keeps a headless legacy workspace unaffected through LEGACY_WORKSPACE_IDS", async () => {
    vi.stubEnv("LEGACY_WORKSPACE_IDS", "ws_v1");

    const response = await POST(makeShopifyRequest(makeOrder()));

    expect(response.status).toBe(200);
    expect(mockEventLogCreate.mock.calls.map((call) => call[0].data.destination)).toContain("GA4");
  });

  it("applies SKU catalog mode to webhook Purchase content IDs and queue payloads", async () => {
    mockWorkspaceFindMany.mockResolvedValue([
      {
        ...baseWorkspace,
        catalogIdMode: "SKU",
      },
    ]);
    const order = makeOrder();
    order.line_items = [
      {
        variant_id: 111,
        product_id: 222,
        sku: "SKU-111",
        quantity: 2,
        price: "21.25",
      },
    ];

    const response = await POST(makeShopifyRequest(order));

    expect(response.status).toBe(200);
    expect(mockEventLogCreate.mock.calls[0][0].data.payload.customData).toMatchObject({
      content_ids: ["SKU-111"],
      contents: [{ id: "SKU-111", quantity: 2, item_price: 21.25 }],
    });
    expect(mockQueueAdd.mock.calls[0][1].event.customData).toMatchObject({
      content_ids: ["SKU-111"],
      contents: [{ id: "SKU-111", quantity: 2, item_price: 21.25 }],
    });
  });

  it("applies product numeric catalog mode to webhook Purchase content IDs and queue payloads", async () => {
    mockWorkspaceFindMany.mockResolvedValue([
      {
        ...baseWorkspace,
        catalogIdMode: "PRODUCT_NUMERIC_ID",
      },
    ]);

    const response = await POST(makeShopifyRequest(makeOrder()));

    expect(response.status).toBe(200);
    expect(mockEventLogCreate.mock.calls[0][0].data.payload.customData).toMatchObject({
      content_ids: ["222"],
      contents: [{ id: "222", quantity: 2, item_price: 21.25 }],
    });
    expect(mockQueueAdd.mock.calls[0][1].event.customData).toMatchObject({
      content_ids: ["222"],
      contents: [{ id: "222", quantity: 2, item_price: 21.25 }],
    });
  });
});
