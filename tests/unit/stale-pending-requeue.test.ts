import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  workspaceFindUnique: vi.fn(),
  eventFindMany: vi.fn(),
  eventUpdateMany: vi.fn(),
  reconcilePurchaseBillingState: vi.fn(),
  metaQueue: { getJob: vi.fn(), add: vi.fn() },
}));

vi.mock("ioredis", () => ({
  default: vi.fn(function (this: Record<string, unknown>) {
    this.on = vi.fn().mockReturnThis();
  }),
}));
vi.mock("bullmq", () => ({
  Queue: vi.fn(function (this: Record<string, unknown>) {
    this.getRepeatableJobs = vi.fn().mockResolvedValue([]);
    this.removeRepeatableByKey = vi.fn();
    this.add = vi.fn();
  }),
  Worker: vi.fn(function (this: Record<string, unknown>) {
    this.on = vi.fn();
    this.close = vi.fn();
  }),
}));
vi.mock("@/lib/db", () => ({
  db: {
    workspace: { findUnique: (...args: unknown[]) => mocks.workspaceFindUnique(...args) },
    eventLog: {
      findMany: (...args: unknown[]) => mocks.eventFindMany(...args),
      updateMany: (...args: unknown[]) => mocks.eventUpdateMany(...args),
    },
  },
}));
vi.mock("@/lib/redis", () => ({ getSharedRedis: vi.fn() }));
vi.mock("@/lib/billing", () => ({
  reconcilePurchaseBillingState: (...args: unknown[]) =>
    mocks.reconcilePurchaseBillingState(...args),
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));
vi.mock("@/lib/queue", () => ({
  getEventQueue: () => mocks.metaQueue,
  getTiktokQueue: vi.fn(),
  getGA4Queue: vi.fn(),
  getKlaviyoQueue: vi.fn(),
  getRedditQueue: vi.fn(),
  getPinterestQueue: vi.fn(),
  getGoogleAdsQueue: vi.fn(),
}));

import {
  groupConnectedPurchaseBillingIdentities,
  isRetryableDeliveryFailure,
  reconcileOrderCounts,
  requeueEvents,
} from "@/workers/stale-pending-requeue";

const workspace = {
  id: "ws-1",
  isActive: true,
  productMode: "SHOPIFY_META_TIKTOK_V1",
  installType: "SHOPIFY_CUSTOM_PIXEL",
  enableMeta: true,
  metaAccessTokenEncrypted: "meta-token",
  enableTikTok: false,
  tiktokAccessTokenEncrypted: null,
  enableGA4: false,
  ga4ApiSecretEncrypted: null,
  enableKlaviyo: false,
  klaviyoApiKeyEncrypted: null,
  enableReddit: false,
  redditAccessTokenEncrypted: null,
  enablePinterest: false,
  pinterestConversionTokenEncrypted: null,
  enableGoogleAds: false,
  googleAdsConversionId: null,
};

const event = {
  id: "log-1",
  workspaceId: "ws-1",
  eventName: "Purchase",
  eventId: "purchase-1",
  destination: "META",
  payload: { customData: { value: 25, currency: "EUR" } },
  customerIp: "203.0.113.10",
  userAgent: "test-agent",
  fbp: "fbp-1",
  fbc: "fbc-1",
  ttclid: null,
  gclid: null,
  rdtCid: null,
  epik: null,
  pageUrl: "https://example.com/checkout",
  createdAt: new Date("2026-07-27T10:00:00.000Z"),
  retryCount: 0,
  lastAttemptAt: null,
  nextRetryAt: null,
  retryPayloadEncrypted: null,
  retryPayloadIv: null,
  retryPayloadTag: null,
  retryPayloadExpiresAt: null,
};

describe("automatic stale event requeue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceFindUnique.mockResolvedValue(workspace);
    mocks.eventUpdateMany.mockResolvedValue({ count: 1 });
    mocks.eventFindMany.mockResolvedValue([]);
    mocks.reconcilePurchaseBillingState.mockResolvedValue({
      previousCount: 0,
      reconciledCount: 0,
      markerCount: 0,
    });
    mocks.metaQueue.getJob.mockResolvedValue(null);
    mocks.metaQueue.add.mockResolvedValue({ id: "event-log-1" });
  });

  it("retries upstream/transient failures but not invalid tenant configuration", () => {
    expect(isRetryableDeliveryFailure("Meta CAPI 503: unavailable")).toBe(true);
    expect(isRetryableDeliveryFailure("TikTok 429: rate limited")).toBe(true);
    expect(isRetryableDeliveryFailure("Circuit breaker open for META workspace ws-1")).toBe(true);
    expect(isRetryableDeliveryFailure("fetch failed")).toBe(true);
    expect(isRetryableDeliveryFailure("Meta CAPI 400: invalid payload")).toBe(false);
    expect(isRetryableDeliveryFailure("Invalid auth tag")).toBe(false);
  });

  it("claims PENDING atomically before queueing the deterministic EventLog job", async () => {
    await expect(
      requeueEvents([event], { expectedStatus: "PENDING", logPrefix: "test" })
    ).resolves.toEqual({ requeued: 1, failed: 0 });

    expect(mocks.eventUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "log-1",
          status: "PENDING",
          retryCount: 0,
        }),
        data: expect.objectContaining({
          status: "RETRYING",
          retryCount: 1,
        }),
      })
    );
    expect(mocks.metaQueue.add).toHaveBeenCalledWith(
      "send-meta-event",
      expect.objectContaining({ eventLogId: "log-1" }),
      { jobId: "event-log-1" }
    );
  });

  it("does not queue when another worker already claimed the row", async () => {
    mocks.eventUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      requeueEvents([event], { expectedStatus: "PENDING", logPrefix: "test" })
    ).resolves.toEqual({ requeued: 0, failed: 0 });
    expect(mocks.metaQueue.add).not.toHaveBeenCalled();
  });

  it("backs off a queue failure so an oldest row cannot starve later events", async () => {
    mocks.metaQueue.add.mockRejectedValueOnce(new Error("Redis unavailable"));

    await expect(
      requeueEvents([event], { expectedStatus: "PENDING", logPrefix: "test" })
    ).resolves.toEqual({ requeued: 0, failed: 1 });

    expect(mocks.eventUpdateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: "log-1",
          status: "RETRYING",
          retryCount: 1,
        }),
        data: expect.objectContaining({
          status: "FAILED",
          retryCount: 1,
          errorMessage: "Requeue failed",
          nextRetryAt: expect.any(Date),
        }),
      })
    );
  });
});

describe("Purchase billing reconciliation", () => {
  const row = (
    overrides: Partial<{
      workspaceId: string;
      eventId: string;
      orderId: string | null;
      orderName: string | null;
      checkoutToken: string | null;
      cartToken: string | null;
    }> = {}
  ) => ({
    workspaceId: "ws-1",
    eventId: "event-1",
    orderId: null,
    orderName: null,
    checkoutToken: null,
    cartToken: null,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.eventFindMany.mockResolvedValue([]);
    mocks.reconcilePurchaseBillingState.mockResolvedValue({
      previousCount: 0,
      reconciledCount: 0,
      markerCount: 0,
    });
  });

  it("collapses destination fan-out and transitive browser/webhook aliases", () => {
    const identities = groupConnectedPurchaseBillingIdentities([
      row({ eventId: "browser-event", checkoutToken: "CHECKOUT-1" }),
      row({ eventId: "browser-event", checkoutToken: "CHECKOUT-1" }),
      row({
        eventId: "bridge-event",
        checkoutToken: "CHECKOUT-1",
        orderId: "gid://shopify/Order/1001",
      }),
      row({
        eventId: "webhook-event",
        orderId: "1001",
        orderName: "#5076",
      }),
      row({ eventId: "webhook-event", orderName: "5076" }),
    ]);

    expect(identities).toHaveLength(1);
    expect(identities[0]).toEqual({
      workspaceId: "ws-1",
      eventId: "bridge-event",
      aliases: expect.arrayContaining([
        "browser-event",
        "webhook-event",
        "checkout:checkout-1",
        "order:1001",
        "name:5076",
      ]),
    });
  });

  it("keeps workspaces and unlike alias kinds isolated", () => {
    const identities = groupConnectedPurchaseBillingIdentities([
      row({ workspaceId: "ws-1", eventId: "event-a", orderId: "same-value" }),
      row({ workspaceId: "ws-1", eventId: "event-b", checkoutToken: "same-value" }),
      row({ workspaceId: "ws-2", eventId: "event-c", orderId: "same-value" }),
    ]);

    expect(identities).toHaveLength(3);
    expect(identities.map((identity) => identity.eventId)).toEqual([
      "event-a",
      "event-b",
      "event-c",
    ]);
  });

  it("uses the same raw event and alias equality as live Redis marker hashing", () => {
    const identities = groupConnectedPurchaseBillingIdentities([
      row({ eventId: "browser-event", orderId: "1001" }),
      row({ eventId: "order:1001" }),
    ]);

    expect(identities).toHaveLength(1);
    expect(identities[0].aliases).toEqual(
      expect.arrayContaining(["order:1001"])
    );
  });

  it("rebuilds a single durable order and all markers while excluding superseded rows", async () => {
    const purchaseRows = [
      row({ eventId: "browser-event", checkoutToken: "checkout-1" }),
      row({
        eventId: "webhook-event",
        checkoutToken: "checkout-1",
        orderId: "1001",
      }),
    ];
    // No Subscription mock exists: ordinary FREE users are discovered from
    // their durable Purchase rows and must still be reconciled.
    mocks.eventFindMany.mockResolvedValue(
      purchaseRows.map((purchase) => ({
        ...purchase,
        workspace: { userId: "user-1" },
      }))
    );
    mocks.reconcilePurchaseBillingState.mockResolvedValue({
      previousCount: 0,
      reconciledCount: 1,
      markerCount: 4,
    });

    await reconcileOrderCounts();

    expect(mocks.eventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventName: "Purchase",
          status: { not: "SUPERSEDED" },
          createdAt: { gte: expect.any(Date) },
        }),
        select: {
          workspaceId: true,
          workspace: { select: { userId: true } },
          eventId: true,
          orderId: true,
          orderName: true,
          checkoutToken: true,
          cartToken: true,
        },
      })
    );
    const monthStart = mocks.eventFindMany.mock.calls[0][0].where.createdAt.gte as Date;
    expect(monthStart.getUTCDate()).toBe(1);
    expect(monthStart.getUTCHours()).toBe(0);
    expect(mocks.reconcilePurchaseBillingState).toHaveBeenCalledWith(
      "user-1",
      expect.stringMatching(/^\d{4}-\d{2}$/),
      [
        {
          workspaceId: "ws-1",
          eventId: "browser-event",
          aliases: expect.arrayContaining([
            "webhook-event",
            "checkout:checkout-1",
            "order:1001",
          ]),
        },
      ]
    );
  });
});
