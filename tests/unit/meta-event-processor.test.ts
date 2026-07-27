import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { Job } from "bullmq";
import type { MetaEventJob } from "@/lib/queue";

// Mock ioredis BEFORE anything imports it
vi.mock("ioredis", () => {
  const MockRedis = vi.fn(function (this: Record<string, unknown>) {
    this.on = vi.fn().mockReturnThis();
  });
  return { default: MockRedis };
});

// Mock bullmq Worker to prevent Redis connection at module level
// Must use a real constructor function (not an arrow) because the processor does `new Worker(...)`
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

// Mock workspace-cache (must be before imports)
const mockGetWorkspaceForDestination = vi.fn();
vi.mock("@/lib/workspace-cache", () => ({
  getWorkspaceForDestination: (...args: unknown[]) => mockGetWorkspaceForDestination(...args),
}));

// Mock dependencies
const mockDecrypt = vi.fn();
vi.mock("@/lib/encryption", () => ({
  decrypt: (...args: unknown[]) => mockDecrypt(...args),
}));

const mockNormalize = vi.fn();
vi.mock("@/lib/event-normalizer", () => ({
  normalizeToMetaCapiEvent: (...args: unknown[]) => mockNormalize(...args),
}));

const mockSendToMetaCapi = vi.fn();
class MockMetaCapiError extends Error {
  statusCode: number;
  response: unknown;
  constructor(message: string, statusCode: number, response: unknown) {
    super(message);
    this.name = "MetaCapiError";
    this.statusCode = statusCode;
    this.response = response;
  }
}
vi.mock("@/lib/meta-capi", () => ({
  sendToMetaCapi: (...args: unknown[]) => mockSendToMetaCapi(...args),
  MetaCapiError: MockMetaCapiError,
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

vi.mock("@/lib/constants", () => ({
  QUEUE_CONFIG: { QUEUE_NAME: "meta-events", MAX_ATTEMPTS: 3, BACKOFF_DELAY_MS: 2000 },
}));

let processMetaEvent: typeof import("@/workers/meta-event-processor").processMetaEvent;

// Test data factory (new format: no credentials in job data; worker looks up from DB)
function createMockJob(overrides?: Partial<MetaEventJob>): Job<MetaEventJob> {
  return {
    id: "test-job-1",
    attemptsMade: 0,
    opts: { attempts: 3 },
    data: {
      workspaceId: "ws-123",
      event: {
        eventName: "PageView",
        eventId: "evt-789",
        timestamp: 1700000000000,
        url: "https://example.com",
        referrer: "",
        fbp: "fb.1.123",
        fbc: null,
        userData: { email: "test@example.com" },
        customData: {},
        clientIp: "1.2.3.4",
        userAgent: "Mozilla/5.0",
      },
      eventLogId: "log-001",
      ...overrides,
    },
  } as unknown as Job<MetaEventJob>;
}

describe("processMetaEvent", () => {
  const mockWorkspace = {
    id: "ws-123",
    isActive: true,
    metaPixelId: "pixel-456",
    metaAccessTokenEncrypted: "encrypted-token",
    metaAccessTokenIv: "test-iv",
    metaAccessTokenTag: "test-tag",
    metaTestEventCode: null,
  };

  beforeAll(async () => {
    // Import after all mocks are registered.
    ({ processMetaEvent } = await import("@/workers/meta-event-processor"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWorkspaceForDestination.mockResolvedValue(mockWorkspace);
    mockDecrypt.mockReturnValue("decrypted-access-token");
    mockNormalize.mockReturnValue({ event_name: "PageView", event_time: 1700000000 });
    mockSendToMetaCapi.mockResolvedValue({ events_received: 1 });
    mockClaimEventDelivery.mockResolvedValue({
      action: "deliver",
      claim: { eventLogId: "log-001", token: "claim-token" },
      event: null,
    });
    mockCompleteEventDeliveryClaim.mockResolvedValue(undefined);
    mockFailEventDeliveryClaim.mockResolvedValue(undefined);
    mockMarkEventDeliveryAccepted.mockResolvedValue(undefined);
  });

  it("should look up workspace, decrypt token, normalize event, send to Meta, and update EventLog to SENT", async () => {
    const job = createMockJob();
    await processMetaEvent(job);

    // Verify workspace lookup
    expect(mockGetWorkspaceForDestination).toHaveBeenCalledWith("ws-123", "META");

    // Verify decrypt called with correct args from workspace
    expect(mockDecrypt).toHaveBeenCalledWith("encrypted-token", "test-iv", "test-tag");

    // Verify normalize called
    expect(mockNormalize).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "PageView", eventId: "evt-789" }),
      "1.2.3.4",
      "Mozilla/5.0"
    );

    // Verify Meta CAPI called
    expect(mockSendToMetaCapi).toHaveBeenCalledWith(
      "pixel-456",
      "decrypted-access-token",
      [{ event_name: "PageView", event_time: 1700000000 }],
      undefined
    );

    expect(mockCompleteEventDeliveryClaim).toHaveBeenCalledWith(
      { eventLogId: "log-001", token: "claim-token" },
      { events_received: 1 }
    );
    expect(mockMarkEventDeliveryAccepted).toHaveBeenCalledWith(
      { eventLogId: "log-001", token: "claim-token" },
      { events_received: 1 }
    );

  });

  it("does not call Meta when the final delivery guard finds a canonical webhook owner", async () => {
    mockClaimEventDelivery.mockResolvedValue({ action: "skip" });

    await processMetaEvent(createMockJob());

    expect(mockClaimEventDelivery).toHaveBeenCalledWith("log-001");
    expect(mockSendToMetaCapi).not.toHaveBeenCalled();
    expect(mockCompleteEventDeliveryClaim).not.toHaveBeenCalled();
  });

  it("should update EventLog to FAILED and re-throw on Meta CAPI error", async () => {
    const metaError = new MockMetaCapiError("Rate limited", 429, { error: { message: "Too many requests" } });
    mockSendToMetaCapi.mockRejectedValue(metaError);

    const job = createMockJob();
    const failure = await processMetaEvent(job).catch((error: unknown) => error);
    expect(failure).toBe(metaError);
    expect(failure).not.toBeInstanceOf(MockUnrecoverableError);

    // Verify EventLog updated to RETRYING (attemptsMade=0, will retry)
    expect(mockFailEventDeliveryClaim).toHaveBeenCalledWith(
      expect.objectContaining({
        eventLogId: "log-001",
        claim: { eventLogId: "log-001", token: "claim-token" },
        outcome: "DELIVERY_AMBIGUOUS",
        status: "RETRYING",
        errorMessage: "Meta CAPI 429: Rate limited",
      })
    );
  });

  it("releases delivery identity when Meta explicitly rejects the request", async () => {
    const metaError = new MockMetaCapiError("Invalid payload", 400, {
      error: { message: "Invalid payload" },
    });
    mockSendToMetaCapi.mockRejectedValue(metaError);

    const failure = await processMetaEvent(createMockJob()).catch(
      (error: unknown) => error
    );

    expect(failure).toBeInstanceOf(MockUnrecoverableError);
    expect(failure).toMatchObject({
      name: "UnrecoverableError",
      message: "Meta CAPI 400: Invalid payload",
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

  it("does not release identity ownership when SENT completion fails after acceptance", async () => {
    mockCompleteEventDeliveryClaim.mockRejectedValue(
      new MockEventDeliveryOwnershipError("Unable to commit delivery completion")
    );

    await expect(processMetaEvent(createMockJob())).rejects.toThrow(
      "Unable to commit delivery completion"
    );

    expect(mockSendToMetaCapi).toHaveBeenCalledTimes(1);
    expect(mockMarkEventDeliveryAccepted).toHaveBeenCalledTimes(1);
    expect(mockFailEventDeliveryClaim).not.toHaveBeenCalled();
  });

  it("should update EventLog to FAILED and re-throw on decrypt failure", async () => {
    mockDecrypt.mockImplementation(() => { throw new Error("Invalid auth tag"); });

    const job = createMockJob();
    await expect(processMetaEvent(job)).rejects.toThrow("Invalid auth tag");

    // Verify EventLog updated to RETRYING (attemptsMade=0, will retry)
    expect(mockFailEventDeliveryClaim).toHaveBeenCalledWith(
      expect.objectContaining({
        eventLogId: "log-001",
        claim: null,
        outcome: "DEFINITELY_NOT_DELIVERED",
        status: "RETRYING",
        errorMessage: "Invalid auth tag",
      })
    );

    // Meta CAPI never called
    expect(mockSendToMetaCapi).not.toHaveBeenCalled();
  });

  it("should still re-throw original error even if EventLog update fails", async () => {
    const capiError = new Error("Network timeout");
    mockSendToMetaCapi.mockRejectedValue(capiError);
    mockFailEventDeliveryClaim.mockRejectedValue(new Error("DB connection lost"));

    const job = createMockJob();
    // The console.error for the DB failure is caught internally,
    // but the original error is still re-thrown
    await expect(processMetaEvent(job)).rejects.toThrow("Network timeout");
  });

  it("should pass testEventCode to Meta CAPI when provided", async () => {
    mockGetWorkspaceForDestination.mockResolvedValue({
      ...mockWorkspace,
      metaTestEventCode: "TEST12345",
    });

    const job = createMockJob();
    await processMetaEvent(job);

    expect(mockSendToMetaCapi).toHaveBeenCalledWith(
      "pixel-456",
      "decrypted-access-token",
      expect.any(Array),
      "TEST12345"
    );
  });
});
