import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEventLogUpdateMany = vi.fn();
const mockSummaries = vi.fn();
const mockCompact = vi.fn();
const mockPrune = vi.fn();
vi.mock("@/lib/event-retention", () => ({
  refreshEventSummaries: (...args: unknown[]) => mockSummaries(...args),
  compactEventDetails: (...args: unknown[]) => mockCompact(...args),
  pruneExpiredDeliveryIdentities: (...args: unknown[]) => mockPrune(...args),
}));
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
    mockSummaries.mockResolvedValue(undefined);
    mockCompact.mockResolvedValue(0);
    mockPrune.mockResolvedValue(0);
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

  it("requires durable reporting before compaction or identity expiry", async () => {
    mockSummaries.mockRejectedValueOnce(new Error("summary failed"));
    await expect(runEventLogCleanup()).rejects.toThrow("summary failed");
    expect(mockCompact).not.toHaveBeenCalled();
    expect(mockPrune).not.toHaveBeenCalled();
  });
  it("summarizes, compacts, then expires identities in that order", async () => {
    await runEventLogCleanup();
    expect(mockSummaries.mock.invocationCallOrder[0]).toBeLessThan(mockCompact.mock.invocationCallOrder[0]);
    expect(mockCompact.mock.invocationCallOrder[0]).toBeLessThan(mockPrune.mock.invocationCallOrder[0]);
  });
});
