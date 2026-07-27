import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInboxCreate = vi.fn();
const mockInboxFindUnique = vi.fn();
const mockInboxFindMany = vi.fn();
const mockInboxUpdate = vi.fn();
const mockInboxUpdateMany = vi.fn();
const mockInboxDeleteMany = vi.fn();
const mockWorkspaceUpdate = vi.fn();
const mockEncrypt = vi.fn();
const mockDecrypt = vi.fn();
const mockInvalidateApiKeyCache = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    shopifyWebhookInbox: {
      create: (...args: unknown[]) => mockInboxCreate(...args),
      findUnique: (...args: unknown[]) => mockInboxFindUnique(...args),
      findMany: (...args: unknown[]) => mockInboxFindMany(...args),
      update: (...args: unknown[]) => mockInboxUpdate(...args),
      updateMany: (...args: unknown[]) => mockInboxUpdateMany(...args),
      deleteMany: (...args: unknown[]) => mockInboxDeleteMany(...args),
    },
    workspace: {
      update: (...args: unknown[]) => mockWorkspaceUpdate(...args),
    },
  },
}));

vi.mock("@/lib/encryption", () => ({
  encrypt: (...args: unknown[]) => mockEncrypt(...args),
  decrypt: (...args: unknown[]) => mockDecrypt(...args),
}));

vi.mock("@/lib/api-key-cache", () => ({
  invalidateApiKeyCache: (...args: unknown[]) => mockInvalidateApiKeyCache(...args),
}));

import {
  SHOPIFY_WEBHOOK_INBOX_REPLAY_INTERVAL_MS,
  VERIFIED_WEBHOOK_PURCHASE_GRACE_MS,
  buildShopifyWebhookDeliveryId,
  captureVerifiedShopifyWebhook,
  claimShopifyWebhookInbox,
  completeShopifyWebhookInbox,
  deferShopifyWebhookInbox,
  deferShopifyWebhookReplayFailure,
  expireStaleShopifyWebhookInboxes,
  getShopifyWebhookOccurredAt,
  loadShopifyWebhookForReplay,
  sanitizeWebhookProcessingError,
  shopifyWebhookRetryDelayMs,
} from "@/lib/shopify-webhook-inbox";

const capturedRow = {
  id: "inbox_1",
  workspaceId: "workspace_1",
  deliveryId: "shopify:delivery_1",
  topic: "orders/paid",
  shopDomain: "store.myshopify.com",
  occurredAt: new Date("2026-07-27T09:00:00.000Z"),
  status: "PENDING",
};

describe("Shopify webhook durable inbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEncrypt.mockReturnValue({ encrypted: "ciphertext", iv: "iv", tag: "tag" });
    mockDecrypt.mockReturnValue('{"id":1001}');
    mockInboxCreate.mockResolvedValue(capturedRow);
    mockWorkspaceUpdate.mockResolvedValue({ apiKey: "tl_workspace_1" });
    mockInvalidateApiKeyCache.mockResolvedValue(undefined);
    mockInboxUpdate.mockResolvedValue({});
    mockInboxUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("keeps the verified browser fallback behind a full inbox replay interval", () => {
    expect(VERIFIED_WEBHOOK_PURCHASE_GRACE_MS).toBeGreaterThan(
      SHOPIFY_WEBHOOK_INBOX_REPLAY_INTERVAL_MS
    );
    expect(VERIFIED_WEBHOOK_PURCHASE_GRACE_MS).toBe(90_000);
  });

  it("uses Shopify delivery IDs and a stable body hash fallback", () => {
    const rawBody = Buffer.from('{"id":1001}');
    expect(buildShopifyWebhookDeliveryId({
      shopifyWebhookId: "delivery_1",
      topic: "orders/paid",
      shopDomain: "store.myshopify.com",
      rawBody,
    })).toBe("shopify:delivery_1");

    const first = buildShopifyWebhookDeliveryId({
      topic: "orders/paid",
      shopDomain: "store.myshopify.com",
      rawBody,
    });
    const second = buildShopifyWebhookDeliveryId({
      topic: "orders/paid",
      shopDomain: "STORE.MYSHOPIFY.COM",
      rawBody,
    });
    expect(first).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(second).toBe(first);
  });

  it("prefers Shopify processed_at for paid-order event time", () => {
    expect(getShopifyWebhookOccurredAt("orders/paid", {
      processed_at: "2026-07-27T09:15:30.000Z",
      created_at: "2026-07-26T20:00:00.000Z",
    })?.toISOString()).toBe("2026-07-27T09:15:30.000Z");
  });

  it("encrypts and persists the verified payload before recording health", async () => {
    await captureVerifiedShopifyWebhook({
      workspaceIds: ["workspace_1", "workspace_1"],
      deliveryId: capturedRow.deliveryId,
      topic: capturedRow.topic,
      shopDomain: capturedRow.shopDomain,
      rawBody: Buffer.from('{"id":1001,"email":"buyer@example.com"}'),
      occurredAt: capturedRow.occurredAt,
    });

    expect(mockEncrypt).toHaveBeenCalledWith('{"id":1001,"email":"buyer@example.com"}');
    expect(mockInboxCreate).toHaveBeenCalledTimes(1);
    expect(mockInboxCreate.mock.calls[0][0].data).toMatchObject({
      payloadEncrypted: "ciphertext",
      payloadIv: "iv",
      payloadTag: "tag",
    });
    expect(mockInboxCreate.mock.calls[0][0].data).not.toHaveProperty("payload");
    expect(mockWorkspaceUpdate).toHaveBeenCalledTimes(1);
    expect(mockInboxCreate).toHaveBeenCalledBefore(mockWorkspaceUpdate);
    expect(mockInvalidateApiKeyCache).toHaveBeenCalledWith("tl_workspace_1");
  });

  it("does not mark Purchase-path verification from a refund-only receipt", async () => {
    await captureVerifiedShopifyWebhook({
      workspaceIds: ["workspace_1"],
      deliveryId: "shopify:refund-delivery",
      topic: "refunds/create",
      shopDomain: capturedRow.shopDomain,
      rawBody: Buffer.from('{"id":2001,"order_id":1001}'),
      occurredAt: capturedRow.occurredAt,
    });

    expect(mockWorkspaceUpdate.mock.calls[0][0].data).toEqual({
      shopifyWebhookLastReceivedAt: expect.any(Date),
    });
    expect(mockInvalidateApiKeyCache).not.toHaveBeenCalled();
  });

  it("deduplicates a repeated delivery without replacing processed state", async () => {
    mockInboxCreate.mockRejectedValueOnce({ code: "P2002" });
    mockInboxFindUnique.mockResolvedValueOnce({ ...capturedRow, status: "PROCESSED" });

    const rows = await captureVerifiedShopifyWebhook({
      workspaceIds: ["workspace_1"],
      deliveryId: capturedRow.deliveryId,
      topic: capturedRow.topic,
      shopDomain: capturedRow.shopDomain,
      rawBody: Buffer.from('{"id":1001}'),
      occurredAt: capturedRow.occurredAt,
    });

    expect(rows[0].status).toBe("PROCESSED");
    expect(mockWorkspaceUpdate).toHaveBeenCalledTimes(1);
  });

  it("claims due or stale work atomically", async () => {
    const now = new Date("2026-07-27T10:00:00.000Z");
    mockInboxFindUnique.mockResolvedValueOnce({
      id: "inbox_1",
      attempts: 2,
      lockedAt: now,
    });

    await expect(claimShopifyWebhookInbox("inbox_1", now)).resolves.toEqual({
      id: "inbox_1",
      attempts: 2,
      lockedAt: now,
    });
    expect(mockInboxUpdateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "inbox_1", nextAttemptAt: { lte: now } },
      data: { status: "PROCESSING", lockedAt: now, attempts: { increment: 1 } },
    });
  });

  it("clears encrypted PII after successful processing", async () => {
    const claim = {
      id: "inbox_1",
      attempts: 2,
      lockedAt: new Date("2026-07-27T10:00:00.000Z"),
    };
    await completeShopifyWebhookInbox(claim);
    expect(mockInboxUpdateMany.mock.calls[0][0]).toMatchObject({
      where: {
        id: "inbox_1",
        status: "PROCESSING",
        attempts: 2,
        lockedAt: claim.lockedAt,
      },
      data: {
      status: "PROCESSED",
      payloadEncrypted: null,
      payloadIv: null,
      payloadTag: null,
      lastError: null,
      },
    });
  });

  it("defers failures with bounded exponential retry and redacted errors", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T10:00:00.000Z"));
    try {
      await deferShopifyWebhookInbox(
        {
          id: "inbox_1",
          attempts: 1,
          lockedAt: new Date("2026-07-27T09:59:59.000Z"),
        },
        new Error("failed for buyer@example.com and +351 912 345 678")
      );
      expect(mockInboxUpdateMany.mock.calls[0][0].data).toMatchObject({
        status: "PENDING",
        lockedAt: null,
        nextAttemptAt: new Date("2026-07-27T10:00:05.000Z"),
        lastError: "failed for [REDACTED_EMAIL] and [REDACTED_PHONE]",
      });
      expect(shopifyWebhookRetryDelayMs(100)).toBe(15 * 60 * 1000);
      expect(sanitizeWebhookProcessingError("buyer@example.com")).toBe("[REDACTED_EMAIL]");
    } finally {
      vi.useRealTimers();
    }
  });

  it("backs off failures that occur before the replay route can claim the row", async () => {
    const now = new Date("2026-07-27T10:00:00.000Z");
    mockInboxFindUnique.mockResolvedValueOnce({ attempts: 3, status: "PENDING" });

    await deferShopifyWebhookReplayFailure(
      "inbox_1",
      new Error("secret missing for buyer@example.com"),
      now
    );

    expect(mockInboxUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "inbox_1",
        status: { in: ["PENDING", "PROCESSING"] },
        payloadEncrypted: { not: null },
      },
      data: {
        status: "PENDING",
        attempts: 4,
        lockedAt: null,
        nextAttemptAt: new Date("2026-07-27T10:00:40.000Z"),
        lastError: "secret missing for [REDACTED_EMAIL]",
      },
    });
  });

  it("decrypts a retry payload only when replaying", async () => {
    mockInboxFindUnique.mockResolvedValueOnce({
      id: "inbox_1",
      workspaceId: "workspace_1",
      deliveryId: "shopify:delivery_1",
      topic: "orders/paid",
      shopDomain: "store.myshopify.com",
      payloadEncrypted: "ciphertext",
      payloadIv: "iv",
      payloadTag: "tag",
    });

    const replay = await loadShopifyWebhookForReplay("inbox_1");
    expect(mockDecrypt).toHaveBeenCalledWith("ciphertext", "iv", "tag");
    expect(replay.rawBody.toString("utf8")).toBe('{"id":1001}');
  });

  it("erases and terminally marks an unprocessed encrypted payload after 30 days", async () => {
    const before = new Date("2026-06-27T10:00:00.000Z");
    const now = new Date("2026-07-27T10:00:00.000Z");

    await expect(expireStaleShopifyWebhookInboxes(before, now)).resolves.toBe(1);
    expect(mockInboxUpdateMany).toHaveBeenCalledWith({
      where: {
        status: { in: ["PENDING", "PROCESSING"] },
        createdAt: { lt: before },
        payloadEncrypted: { not: null },
      },
      data: {
        status: "EXPIRED",
        processedAt: now,
        lockedAt: null,
        payloadEncrypted: null,
        payloadIv: null,
        payloadTag: null,
        lastError: "Encrypted webhook payload expired after 30 days of recovery attempts",
      },
    });
  });
});
