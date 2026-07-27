import { describe, expect, it, vi } from "vitest";
import type { Queue } from "bullmq";
import {
  enqueueReplayJob,
  eventReplayJobId,
  type ReplayJobData,
} from "@/lib/event-replay-queue";

function replayData(): ReplayJobData {
  return {
    workspaceId: "ws-1",
    destination: "TIKTOK",
    eventLogId: "log-1",
    event: {
      eventName: "Purchase",
      eventId: "purchase-1",
      timestamp: 1_700_000_000_000,
      url: "https://example.com/checkout",
      referrer: "",
      fbp: "fbp-durable",
      fbc: "fbc-durable",
      ttclid: "ttclid-durable",
      ttp: "ttp-durable",
      gclid: "gclid-durable",
      rdtCid: null,
      epik: null,
      userData: {},
      customData: { value: 25, currency: "EUR" },
      clientIp: "203.0.113.10",
      userAgent: "test-agent",
    },
  };
}

describe("event replay queue", () => {
  it("uses the same deterministic EventLog job id when no retained job exists", async () => {
    const queue = {
      getJob: vi.fn().mockResolvedValue(null),
      add: vi.fn().mockResolvedValue({ id: "event-log-1" }),
    } as unknown as Queue;
    const data = replayData();

    await expect(enqueueReplayJob(queue, "send-tiktok-event", "log-1", data)).resolves.toBe(
      "queued"
    );

    expect(eventReplayJobId("log-1")).toBe("event-log-1");
    expect(queue.add).toHaveBeenCalledWith("send-tiktok-event", data, {
      jobId: "event-log-1",
    });
  });

  it("retries a retained failed job while preserving richer identity data", async () => {
    const updateData = vi.fn().mockResolvedValue(undefined);
    const retry = vi.fn().mockResolvedValue(undefined);
    const existing = {
      data: {
        workspaceId: "ws-1",
        destination: "TIKTOK",
        eventLogId: "log-1",
        event: {
          ...replayData().event,
          gclid: null,
          userData: { email: "buyer@example.com" },
        },
      },
      getState: vi.fn().mockResolvedValue("failed"),
      updateData,
      retry,
    };
    const queue = {
      getJob: vi.fn().mockResolvedValue(existing),
      add: vi.fn(),
    } as unknown as Queue;

    await expect(
      enqueueReplayJob(queue, "send-tiktok-event", "log-1", replayData())
    ).resolves.toBe("queued");

    expect(updateData).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          gclid: "gclid-durable",
          userData: { email: "buyer@example.com" },
        }),
      })
    );
    expect(retry).toHaveBeenCalledWith("failed", {
      resetAttemptsMade: true,
      resetAttemptsStarted: true,
    });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("never duplicates retained completed or active jobs", async () => {
    const getState = vi
      .fn()
      .mockResolvedValueOnce("completed")
      .mockResolvedValueOnce("active");
    const queue = {
      getJob: vi.fn().mockResolvedValue({ getState }),
      add: vi.fn(),
    } as unknown as Queue;

    await expect(
      enqueueReplayJob(queue, "send-tiktok-event", "log-1", replayData())
    ).resolves.toBe("completed");
    await expect(
      enqueueReplayJob(queue, "send-tiktok-event", "log-1", replayData())
    ).resolves.toBe("active");
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("upgrades waiting browser data with useful canonical webhook fields", async () => {
    const updateData = vi.fn().mockResolvedValue(undefined);
    const existing = {
      data: {
        ...replayData(),
        event: {
          ...replayData().event,
          userData: {
            email: "browser@example.com",
            phone: "+351900000000",
          },
          customData: { value: 10, currency: "EUR", browserOnly: "keep" },
        },
      },
      getState: vi.fn().mockResolvedValue("waiting"),
      updateData,
    };
    const queue = {
      getJob: vi.fn().mockResolvedValue(existing),
      add: vi.fn(),
    } as unknown as Queue;
    const canonical = replayData();
    existing.data.event.url = "https://browser.example/checkout";
    existing.data.event.referrer = "https://browser.example/cart";
    existing.data.event.clientIp = "203.0.113.77";
    existing.data.event.userAgent = "RichBrowser/1.0";
    canonical.event.url = "";
    canonical.event.referrer = "";
    canonical.event.clientIp = "";
    canonical.event.userAgent = "";
    canonical.event.userData = { email: "shopify@example.com", phone: null };
    canonical.event.customData = { value: 25, currency: "USD" };

    await expect(
      enqueueReplayJob(queue, "send-tiktok-event", "log-1", canonical, {
        preferReplayData: true,
      })
    ).resolves.toBe("already-queued");

    expect(updateData).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          userData: {
            email: "shopify@example.com",
            phone: "+351900000000",
          },
          customData: {
            value: 25,
            currency: "USD",
            browserOnly: "keep",
          },
          url: "https://browser.example/checkout",
          referrer: "https://browser.example/cart",
          clientIp: "203.0.113.77",
          userAgent: "RichBrowser/1.0",
        }),
      })
    );
  });

  it("reconciles canonical data after a duplicate add race", async () => {
    const updateData = vi.fn().mockResolvedValue(undefined);
    const retained = {
      data: {
        ...replayData(),
        event: {
          ...replayData().event,
          customData: { value: 10, currency: "EUR", browserOnly: true },
        },
      },
      getState: vi.fn().mockResolvedValue("waiting"),
      updateData,
    };
    const queue = {
      getJob: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(retained),
      add: vi.fn().mockResolvedValue({ id: "event-log-1" }),
    } as unknown as Queue;
    const canonical = replayData();
    canonical.event.customData = { value: 25, currency: "USD" };

    await expect(
      enqueueReplayJob(queue, "send-tiktok-event", "log-1", canonical, {
        preferReplayData: true,
      })
    ).resolves.toBe("queued");

    expect(updateData).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          customData: {
            value: 25,
            currency: "USD",
            browserOnly: true,
          },
        }),
      })
    );
  });

  it("reconciles canonical data after an unknown-state re-add race", async () => {
    const replacementUpdate = vi.fn().mockResolvedValue(undefined);
    const unknown = {
      data: replayData(),
      getState: vi.fn().mockResolvedValue("unknown"),
    };
    const replacement = {
      data: replayData(),
      getState: vi.fn().mockResolvedValue("waiting"),
      updateData: replacementUpdate,
    };
    const queue = {
      getJob: vi.fn()
        .mockResolvedValueOnce(unknown)
        .mockResolvedValueOnce(replacement),
      add: vi.fn().mockResolvedValue({ id: "event-log-1" }),
    } as unknown as Queue;

    await expect(
      enqueueReplayJob(queue, "send-tiktok-event", "log-1", replayData(), {
        preferReplayData: true,
      })
    ).resolves.toBe("queued");

    expect(replacementUpdate).toHaveBeenCalledOnce();
  });
});
