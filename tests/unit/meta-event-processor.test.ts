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
vi.mock("bullmq", () => ({
  Worker: vi.fn(function (this: Record<string, unknown>) {
    this.on = vi.fn();
    this.close = vi.fn();
  }),
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

const mockEventLogUpdate = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    eventLog: { update: (...args: unknown[]) => mockEventLogUpdate(...args) },
  },
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
    mockEventLogUpdate.mockResolvedValue({});
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

    // Verify EventLog updated to SENT
    expect(mockEventLogUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "log-001" },
        data: expect.objectContaining({ status: "SENT" }),
      })
    );

  });

  it("should update EventLog to FAILED and re-throw on Meta CAPI error", async () => {
    const metaError = new MockMetaCapiError("Rate limited", 429, { error: { message: "Too many requests" } });
    mockSendToMetaCapi.mockRejectedValue(metaError);

    const job = createMockJob();
    await expect(processMetaEvent(job)).rejects.toThrow(metaError);

    // Verify EventLog updated to RETRYING (attemptsMade=0, will retry)
    expect(mockEventLogUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "log-001" },
        data: expect.objectContaining({
          status: "RETRYING",
          errorMessage: "Meta CAPI 429: Rate limited",
        }),
      })
    );
  });

  it("should update EventLog to FAILED and re-throw on decrypt failure", async () => {
    mockDecrypt.mockImplementation(() => { throw new Error("Invalid auth tag"); });

    const job = createMockJob();
    await expect(processMetaEvent(job)).rejects.toThrow("Invalid auth tag");

    // Verify EventLog updated to RETRYING (attemptsMade=0, will retry)
    expect(mockEventLogUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "RETRYING",
          errorMessage: "Invalid auth tag",
        }),
      })
    );

    // Meta CAPI never called
    expect(mockSendToMetaCapi).not.toHaveBeenCalled();
  });

  it("should still re-throw original error even if EventLog update fails", async () => {
    const capiError = new Error("Network timeout");
    mockSendToMetaCapi.mockRejectedValue(capiError);
    mockEventLogUpdate.mockRejectedValue(new Error("DB connection lost"));

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
