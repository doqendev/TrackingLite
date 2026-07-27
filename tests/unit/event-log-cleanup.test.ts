import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEventLogUpdateMany = vi.fn();
const mockEventLogDeleteMany = vi.fn();
const mockEventLogCount = vi.fn();
const mockWorkspaceFindMany = vi.fn();
const mockExpireWebhookInboxes = vi.fn();
const mockCleanupWebhookInboxes = vi.fn();

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
    eventLog: {
      updateMany: (...args: unknown[]) => mockEventLogUpdateMany(...args),
      deleteMany: (...args: unknown[]) => mockEventLogDeleteMany(...args),
      count: (...args: unknown[]) => mockEventLogCount(...args),
    },
    workspace: {
      findMany: (...args: unknown[]) => mockWorkspaceFindMany(...args),
    },
  },
}));

vi.mock("@/lib/shopify-webhook-inbox", () => ({
  expireStaleShopifyWebhookInboxes: (...args: unknown[]) =>
    mockExpireWebhookInboxes(...args),
  cleanupTerminalShopifyWebhookInboxes: (...args: unknown[]) =>
    mockCleanupWebhookInboxes(...args),
}));

import { runEventLogCleanup } from "@/workers/event-log-cleanup";

describe("event log cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEventLogUpdateMany
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 3 });
    mockWorkspaceFindMany.mockResolvedValue([]);
    mockEventLogDeleteMany.mockResolvedValue({ count: 0 });
    mockEventLogCount.mockResolvedValue(0);
    mockExpireWebhookInboxes.mockResolvedValue(1);
    mockCleanupWebhookInboxes.mockResolvedValue(4);
  });

  it("clears expired retry PII and old processed webhook receipts", async () => {
    await runEventLogCleanup();

    expect(mockEventLogUpdateMany.mock.calls[0][0]).toEqual({
      where: {
        retryPayloadExpiresAt: { lte: expect.any(Date) },
        retryPayloadEncrypted: { not: null },
      },
      data: {
        retryPayloadEncrypted: null,
        retryPayloadIv: null,
        retryPayloadTag: null,
        retryPayloadExpiresAt: null,
      },
    });
    expect(mockExpireWebhookInboxes).toHaveBeenCalledTimes(1);
    expect(mockCleanupWebhookInboxes).toHaveBeenCalledTimes(1);
    expect(mockEventLogUpdateMany.mock.calls[1][0]).toMatchObject({
      data: { customerIp: null, userAgent: null },
    });
  });

  it("never removes ambiguous Purchase identity owners during plan retention", async () => {
    mockWorkspaceFindMany.mockResolvedValue([
      {
        id: "ws-1",
        userId: "user-1",
        user: { subscription: { plan: "FREE" } },
      },
    ]);
    mockEventLogCount.mockResolvedValue(2);

    await runEventLogCleanup();

    const protectedOwnerFilter = {
      eventName: "Purchase",
      deliveryClaimToken: { not: null },
      deliveryClaimOwner: {
        in: ["WORKER", "WORKER_ATTEMPTING", "WORKER_ACCEPTED"],
      },
    };
    expect(mockEventLogCount).toHaveBeenCalledWith({
      where: expect.objectContaining(protectedOwnerFilter),
    });
    expect(mockEventLogDeleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        workspaceId: { in: ["ws-1"] },
        createdAt: { lt: expect.any(Date) },
        NOT: protectedOwnerFilter,
      }),
    });
  });
});
