import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import type { DestinationEventJob } from "@/lib/queue";

vi.mock("ioredis", () => {
  const MockRedis = vi.fn(function (this: Record<string, unknown>) {
    this.on = vi.fn().mockReturnThis();
  });
  return { default: MockRedis };
});

class MockUnrecoverableError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "UnrecoverableError";
  }
}
vi.mock("bullmq", () => ({
  Worker: vi.fn(function (this: Record<string, unknown>) {
    this.on = vi.fn();
    this.close = vi.fn();
  }),
  UnrecoverableError: MockUnrecoverableError,
}));

const mockGetWorkspaceForDestination = vi.fn();
vi.mock("@/lib/workspace-cache", () => ({
  getWorkspaceForDestination: (...args: unknown[]) =>
    mockGetWorkspaceForDestination(...args),
}));

const mockDecrypt = vi.fn();
vi.mock("@/lib/encryption", () => ({
  decrypt: (...args: unknown[]) => mockDecrypt(...args),
}));

const mockNormalize = vi.fn();
const mockSendToTikTok = vi.fn();
class MockTikTokApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "TikTokApiError";
    this.statusCode = statusCode;
  }
}
vi.mock("@/lib/destinations/tiktok", () => ({
  normalizeToTikTokEvent: (...args: unknown[]) => mockNormalize(...args),
  sendToTikTok: (...args: unknown[]) => mockSendToTikTok(...args),
  TikTokApiError: MockTikTokApiError,
}));

const mockClaimEventDelivery = vi.fn();
const mockCompleteEventDeliveryClaim = vi.fn();
const mockFailEventDeliveryClaim = vi.fn();
const mockMarkEventDeliveryAccepted = vi.fn();
class MockEventDeliveryOwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventDeliveryOwnershipError";
  }
}
vi.mock("@/lib/event-delivery-guard", () => ({
  isEventDeliverySuperseded: vi.fn().mockResolvedValue(false),
  claimEventDelivery: (...args: unknown[]) => mockClaimEventDelivery(...args),
  completeEventDeliveryClaim: (...args: unknown[]) => mockCompleteEventDeliveryClaim(...args),
  failEventDeliveryClaim: (...args: unknown[]) => mockFailEventDeliveryClaim(...args),
  markEventDeliveryAccepted: (...args: unknown[]) => mockMarkEventDeliveryAccepted(...args),
  EventDeliveryOwnershipError: MockEventDeliveryOwnershipError,
}));

const mockIsCircuitClosed = vi.fn();
const mockRecordSuccess = vi.fn();
const mockRecordFailure = vi.fn();
vi.mock("@/lib/circuit-breaker", () => ({
  isCircuitClosed: (...args: unknown[]) => mockIsCircuitClosed(...args),
  recordSuccess: (...args: unknown[]) => mockRecordSuccess(...args),
  recordFailure: (...args: unknown[]) => mockRecordFailure(...args),
  shouldRecordCircuitFailure: (error: unknown) => error instanceof MockTikTokApiError,
  shouldRetryDeliveryFailure: (error: unknown) =>
    (error instanceof MockTikTokApiError &&
      ([408, 425, 429].includes(error.statusCode) || error.statusCode >= 500)) ||
    (error instanceof Error && error.name === "EventDeliveryOwnershipError"),
  CircuitOpenError: class CircuitOpenError extends Error {},
}));

vi.mock("@/lib/constants", () => ({
  QUEUE_CONFIG: { TIKTOK_QUEUE_NAME: "tiktok-events" },
}));

let processTikTokEvent: typeof import("@/workers/tiktok-event-processor").processTikTokEvent;

function createMockJob(attemptsMade = 0): Job<DestinationEventJob> {
  return {
    id: "tiktok-job-1",
    attemptsMade,
    opts: { attempts: 3 },
    data: {
      workspaceId: "ws-123",
      eventLogId: "log-001",
      event: {
        eventName: "Purchase",
        eventId: "evt-789",
        timestamp: 1_700_000_000_000,
        url: "https://example.com",
        referrer: "",
        userData: { email: "test@example.com" },
        customData: { value: 25, currency: "USD" },
        clientIp: "1.2.3.4",
        userAgent: "Mozilla/5.0",
        ttclid: "click-123",
        ttp: "cookie-123",
      },
    },
  } as unknown as Job<DestinationEventJob>;
}

describe("processTikTokEvent", () => {
  beforeAll(async () => {
    ({ processTikTokEvent } = await import("@/workers/tiktok-event-processor"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWorkspaceForDestination.mockResolvedValue({
      id: "ws-123",
      isActive: true,
      tiktokPixelId: "pixel-456",
      tiktokAccessTokenEncrypted: "encrypted-token",
      tiktokAccessTokenIv: "test-iv",
      tiktokAccessTokenTag: "test-tag",
    });
    mockDecrypt.mockReturnValue("decrypted-access-token");
    mockNormalize.mockReturnValue({ event: "CompletePayment" });
    mockSendToTikTok.mockResolvedValue({ code: 0 });
    mockIsCircuitClosed.mockResolvedValue(true);
    mockRecordSuccess.mockResolvedValue(undefined);
    mockRecordFailure.mockResolvedValue(undefined);
    mockClaimEventDelivery.mockResolvedValue({
      action: "deliver",
      claim: { eventLogId: "log-001", token: "claim-token" },
      event: null,
    });
    mockCompleteEventDeliveryClaim.mockResolvedValue(undefined);
    mockFailEventDeliveryClaim.mockResolvedValue(undefined);
    mockMarkEventDeliveryAccepted.mockResolvedValue(undefined);
  });

  it("marks a successful delivery SENT and clears its retry envelope", async () => {
    await processTikTokEvent(createMockJob());

    expect(mockCompleteEventDeliveryClaim).toHaveBeenCalledWith(
      { eventLogId: "log-001", token: "claim-token" },
      { code: 0 }
    );
    expect(mockMarkEventDeliveryAccepted).toHaveBeenCalledWith(
      { eventLogId: "log-001", token: "claim-token" },
      { code: 0 }
    );
  });

  it("does not call TikTok when the final delivery guard finds a canonical webhook owner", async () => {
    mockClaimEventDelivery.mockResolvedValue({ action: "skip" });

    await processTikTokEvent(createMockJob());

    expect(mockClaimEventDelivery).toHaveBeenCalledWith("log-001");
    expect(mockSendToTikTok).not.toHaveBeenCalled();
    expect(mockCompleteEventDeliveryClaim).not.toHaveBeenCalled();
  });

  it("cannot regress an already-SENT log when a duplicate attempt fails", async () => {
    const apiError = new MockTikTokApiError("Rate limited", 429);
    mockSendToTikTok.mockRejectedValue(apiError);
    const failure = await processTikTokEvent(createMockJob()).catch(
      (error: unknown) => error
    );
    expect(failure).toBe(apiError);
    expect(failure).not.toBeInstanceOf(MockUnrecoverableError);

    expect(mockFailEventDeliveryClaim).toHaveBeenCalledWith(
      expect.objectContaining({
        eventLogId: "log-001",
        claim: { eventLogId: "log-001", token: "claim-token" },
        outcome: "DELIVERY_AMBIGUOUS",
        status: "RETRYING",
        errorMessage: "TikTok 429: Rate limited",
      })
    );
    expect(mockCompleteEventDeliveryClaim).not.toHaveBeenCalled();
  });

  it("releases delivery identity when TikTok explicitly rejects the request", async () => {
    const apiError = new MockTikTokApiError("Invalid payload", 400);
    mockSendToTikTok.mockRejectedValue(apiError);

    const failure = await processTikTokEvent(createMockJob()).catch(
      (error: unknown) => error
    );

    expect(failure).toBeInstanceOf(MockUnrecoverableError);
    expect(failure).toMatchObject({
      name: "UnrecoverableError",
      message: "TikTok 400: Invalid payload",
    });

    expect(mockFailEventDeliveryClaim).toHaveBeenCalledWith(
      expect.objectContaining({
        claim: { eventLogId: "log-001", token: "claim-token" },
        outcome: "DEFINITELY_NOT_DELIVERED",
        status: "FAILED",
        nextRetryAt: null,
      })
    );
  });

  it("keeps the pre-I/O identity owner when the first post-send DB write fails", async () => {
    mockMarkEventDeliveryAccepted.mockRejectedValue(
      new MockEventDeliveryOwnershipError("Unable to preserve accepted delivery ownership")
    );

    await expect(processTikTokEvent(createMockJob())).rejects.toThrow(
      "Unable to preserve accepted delivery ownership"
    );

    expect(mockSendToTikTok).toHaveBeenCalledTimes(1);
    expect(mockCompleteEventDeliveryClaim).not.toHaveBeenCalled();
    expect(mockFailEventDeliveryClaim).not.toHaveBeenCalled();
  });

  it("preserves final-attempt FAILED semantics behind the SENT guard", async () => {
    mockSendToTikTok.mockRejectedValue(new Error("Permanent failure"));

    await expect(processTikTokEvent(createMockJob(2))).rejects.toThrow(
      "Permanent failure"
    );

    expect(mockFailEventDeliveryClaim).toHaveBeenCalledWith(
      expect.objectContaining({
        eventLogId: "log-001",
        claim: { eventLogId: "log-001", token: "claim-token" },
        outcome: "DELIVERY_AMBIGUOUS",
        status: "FAILED",
        nextRetryAt: null,
      })
    );
  });

  it("schedules a final-attempt ownership/DB failure as transient without sending", async () => {
    mockClaimEventDelivery.mockRejectedValue(
      new MockEventDeliveryOwnershipError("Unable to establish durable delivery ownership")
    );

    await expect(processTikTokEvent(createMockJob(2))).rejects.toThrow(
      "Unable to establish durable delivery ownership"
    );

    expect(mockSendToTikTok).not.toHaveBeenCalled();
    expect(mockRecordFailure).not.toHaveBeenCalled();
    expect(mockFailEventDeliveryClaim).toHaveBeenCalledWith(
      expect.objectContaining({
        eventLogId: "log-001",
        claim: null,
        outcome: "DEFINITELY_NOT_DELIVERED",
        status: "FAILED",
        nextRetryAt: expect.any(Date),
      })
    );
  });
});
