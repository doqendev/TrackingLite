import { beforeEach, describe, expect, it, vi } from "vitest";

const mockListCandidates = vi.fn();
const mockLoadReplay = vi.fn();
const mockWorkspaceFindUnique = vi.fn();
const mockDecrypt = vi.fn();
const mockPost = vi.fn();
const mockDeferReplayFailure = vi.fn();
const mockGetInboxStatus = vi.fn();

vi.mock("bullmq", () => ({
  Queue: class MockQueue {},
  Worker: class MockWorker {
    on = vi.fn();
  },
}));

vi.mock("ioredis", () => ({
  default: class MockRedis {
    on = vi.fn();
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    workspace: {
      findUnique: (...args: unknown[]) => mockWorkspaceFindUnique(...args),
    },
  },
}));

vi.mock("@/lib/encryption", () => ({
  decrypt: (...args: unknown[]) => mockDecrypt(...args),
}));

vi.mock("@/lib/shopify-webhook-inbox", () => ({
  listShopifyWebhookReplayCandidates: (...args: unknown[]) => mockListCandidates(...args),
  loadShopifyWebhookForReplay: (...args: unknown[]) => mockLoadReplay(...args),
  deferShopifyWebhookReplayFailure: (...args: unknown[]) => mockDeferReplayFailure(...args),
  getShopifyWebhookInboxStatus: (...args: unknown[]) => mockGetInboxStatus(...args),
}));

vi.mock("@/app/api/webhooks/shopify/route", () => ({
  POST: (...args: unknown[]) => mockPost(...args),
}));

import { replayDueShopifyWebhooks } from "@/workers/shopify-webhook-inbox-worker";

describe("Shopify webhook inbox worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListCandidates.mockResolvedValue([{ id: "inbox_1" }]);
    mockLoadReplay.mockResolvedValue({
      id: "inbox_1",
      workspaceId: "workspace_1",
      deliveryId: "shopify:delivery_1",
      topic: "orders/paid",
      shopDomain: "store.myshopify.com",
      rawBody: Buffer.from('{"id":1001}'),
    });
    mockWorkspaceFindUnique.mockResolvedValue({
      shopifyWebhookSecretEncrypted: "encrypted-secret",
      shopifyWebhookSecretIv: "secret-iv",
      shopifyWebhookSecretTag: "secret-tag",
    });
    mockDecrypt.mockReturnValue("shopify-secret");
    mockPost.mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    mockGetInboxStatus.mockResolvedValue("PROCESSED");
    mockDeferReplayFailure.mockResolvedValue(undefined);
  });

  it("replays the encrypted delivery through the normal HMAC-verified route", async () => {
    await expect(replayDueShopifyWebhooks()).resolves.toEqual({
      candidates: 1,
      replayed: 1,
      failed: 0,
    });

    expect(mockDecrypt).toHaveBeenCalledWith(
      "encrypted-secret",
      "secret-iv",
      "secret-tag"
    );
    const request = mockPost.mock.calls[0][0] as Request;
    expect(request.headers.get("x-shopify-topic")).toBe("orders/paid");
    expect(request.headers.get("x-shopify-shop-domain")).toBe("store.myshopify.com");
    expect(request.headers.get("x-trackclear-inbox-replay")).toBe("1");
    expect(request.headers.get("x-trackclear-inbox-workspace")).toBe("workspace_1");
    expect(request.headers.get("x-shopify-hmac-sha256")).toBeTruthy();
    await expect(request.text()).resolves.toBe('{"id":1001}');
  });

  it("reports a replay failure without aborting the rest of the cycle", async () => {
    mockPost.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));

    await expect(replayDueShopifyWebhooks()).resolves.toEqual({
      candidates: 1,
      replayed: 0,
      failed: 1,
    });
    expect(mockDeferReplayFailure).toHaveBeenCalledWith(
      "inbox_1",
      expect.objectContaining({ message: "Shopify webhook replay returned HTTP 503" })
    );
  });

  it("does not report a still-deferred inbox as replayed", async () => {
    mockPost.mockResolvedValueOnce(new Response('{"ok":true,"deferred":true}', {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    await expect(replayDueShopifyWebhooks()).resolves.toEqual({
      candidates: 1,
      replayed: 0,
      failed: 1,
    });
    expect(mockDeferReplayFailure).not.toHaveBeenCalled();
  });

  it("backs off a row when its workspace secret disappeared before route replay", async () => {
    mockWorkspaceFindUnique.mockResolvedValueOnce(null);

    await expect(replayDueShopifyWebhooks()).resolves.toEqual({
      candidates: 1,
      replayed: 0,
      failed: 1,
    });
    expect(mockPost).not.toHaveBeenCalled();
    expect(mockDeferReplayFailure).toHaveBeenCalledWith(
      "inbox_1",
      expect.objectContaining({ message: "Workspace webhook secret is unavailable for replay" })
    );
  });

  it("does not count an ignored 200 response as processed", async () => {
    mockGetInboxStatus.mockResolvedValueOnce("PENDING");

    await expect(replayDueShopifyWebhooks()).resolves.toEqual({
      candidates: 1,
      replayed: 0,
      failed: 1,
    });
    expect(mockDeferReplayFailure).toHaveBeenCalledWith(
      "inbox_1",
      expect.objectContaining({ message: expect.stringContaining("did not process inbox row") })
    );
  });
});
