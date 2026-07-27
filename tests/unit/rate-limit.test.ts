import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock ioredis before importing the module under test
const mockIncr = vi.fn();
const mockExpire = vi.fn();
const mockEval = vi.fn();

vi.mock("ioredis", () => {
  const MockRedis = vi.fn(function (this: Record<string, unknown>) {
    this.incr = mockIncr;
    this.expire = mockExpire;
    this.eval = mockEval;
  });
  return { default: MockRedis };
});

// Import after mock is set up
import {
  checkConsentRevocationRateLimit,
  checkRateLimit,
} from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/lib/constants";

const WORKSPACE_ID = "ws_test_123";
const LIMIT = RATE_LIMIT.INGEST_PER_SECOND_PER_WORKSPACE; // 100

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExpire.mockResolvedValue(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("allow request when under limit", () => {
    it("returns allowed: true when count is 1 (first request)", async () => {
      mockIncr.mockResolvedValue(1);

      const result = await checkRateLimit(WORKSPACE_ID);

      expect(result.allowed).toBe(true);
    });

    it("returns allowed: true when count is below the limit", async () => {
      mockIncr.mockResolvedValue(50);

      const result = await checkRateLimit(WORKSPACE_ID);

      expect(result.allowed).toBe(true);
    });

    it("returns allowed: true when count equals the limit exactly", async () => {
      mockIncr.mockResolvedValue(LIMIT);

      const result = await checkRateLimit(WORKSPACE_ID);

      expect(result.allowed).toBe(true);
    });

    it("returns correct remaining count when under limit", async () => {
      mockIncr.mockResolvedValue(30);

      const result = await checkRateLimit(WORKSPACE_ID);

      expect(result.remaining).toBe(LIMIT - 30);
    });

    it("returns remaining of 0 when count equals limit", async () => {
      mockIncr.mockResolvedValue(LIMIT);

      const result = await checkRateLimit(WORKSPACE_ID);

      expect(result.remaining).toBe(0);
    });
  });

  describe("reject request when over limit", () => {
    it("returns allowed: false when count exceeds the limit by 1", async () => {
      mockIncr.mockResolvedValue(LIMIT + 1);

      const result = await checkRateLimit(WORKSPACE_ID);

      expect(result.allowed).toBe(false);
    });

    it("returns allowed: false when count greatly exceeds the limit", async () => {
      mockIncr.mockResolvedValue(LIMIT + 500);

      const result = await checkRateLimit(WORKSPACE_ID);

      expect(result.allowed).toBe(false);
    });

    it("returns remaining of 0 when over limit (never negative)", async () => {
      mockIncr.mockResolvedValue(LIMIT + 50);

      const result = await checkRateLimit(WORKSPACE_ID);

      expect(result.remaining).toBe(0);
    });
  });

  describe("Redis key pattern", () => {
    it("uses a key that contains the workspace ID", async () => {
      mockIncr.mockResolvedValue(1);

      await checkRateLimit(WORKSPACE_ID);

      const calledKey: string = mockIncr.mock.calls[0][0];
      expect(calledKey).toContain(WORKSPACE_ID);
    });

    it("uses the expected key prefix pattern 'ratelimit:ingest'", async () => {
      mockIncr.mockResolvedValue(1);

      await checkRateLimit(WORKSPACE_ID);

      const calledKey: string = mockIncr.mock.calls[0][0];
      expect(calledKey).toMatch(/^ratelimit:ingest:/);
    });

    it("different workspace IDs produce different keys", async () => {
      mockIncr.mockResolvedValue(1);

      await checkRateLimit("ws_aaa");
      await checkRateLimit("ws_bbb");

      const key1: string = mockIncr.mock.calls[0][0];
      const key2: string = mockIncr.mock.calls[1][0];
      expect(key1).not.toBe(key2);
      expect(key1).toContain("ws_aaa");
      expect(key2).toContain("ws_bbb");
    });

    it("key includes a Unix timestamp segment (seconds granularity)", async () => {
      mockIncr.mockResolvedValue(1);

      const before = Math.floor(Date.now() / 1000);
      await checkRateLimit(WORKSPACE_ID);
      const after = Math.floor(Date.now() / 1000);

      const calledKey: string = mockIncr.mock.calls[0][0];
      // Key format: ratelimit:ingest:{workspaceId}:{unixSeconds}
      const parts = calledKey.split(":");
      const timestampPart = parseInt(parts[parts.length - 1], 10);
      expect(timestampPart).toBeGreaterThanOrEqual(before);
      expect(timestampPart).toBeLessThanOrEqual(after);
    });
  });

  describe("TTL / expiry on the counter", () => {
    it("calls expire on the first request (incr returns 1)", async () => {
      mockIncr.mockResolvedValue(1);

      await checkRateLimit(WORKSPACE_ID);

      expect(mockExpire).toHaveBeenCalledTimes(1);
    });

    it("sets TTL of 2 seconds on the key", async () => {
      mockIncr.mockResolvedValue(1);

      await checkRateLimit(WORKSPACE_ID);

      const [, ttl] = mockExpire.mock.calls[0];
      expect(ttl).toBe(2);
    });

    it("expires the same key that was incremented", async () => {
      mockIncr.mockResolvedValue(1);

      await checkRateLimit(WORKSPACE_ID);

      const incrKey: string = mockIncr.mock.calls[0][0];
      const expireKey: string = mockExpire.mock.calls[0][0];
      expect(expireKey).toBe(incrKey);
    });

    it("does not call expire when count is greater than 1 (key already exists)", async () => {
      mockIncr.mockResolvedValue(5);

      await checkRateLimit(WORKSPACE_ID);

      expect(mockExpire).not.toHaveBeenCalled();
    });
  });
});

describe("checkConsentRevocationRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses isolated minute/day budgets and fails closed when Redis is unavailable", async () => {
    mockEval.mockResolvedValueOnce([1, 1]);
    await expect(checkConsentRevocationRateLimit(WORKSPACE_ID)).resolves.toEqual({
      allowed: true,
    });
    expect(mockEval.mock.calls[0][2]).toContain(
      `ratelimit:consent-revocation:minute:${WORKSPACE_ID}:`
    );
    expect(mockEval.mock.calls[0][3]).toContain(
      `ratelimit:consent-revocation:day:${WORKSPACE_ID}:`
    );

    mockEval.mockResolvedValueOnce([
      RATE_LIMIT.CONSENT_REVOCATIONS_PER_MINUTE_PER_WORKSPACE + 1,
      2,
    ]);
    await expect(checkConsentRevocationRateLimit(WORKSPACE_ID)).resolves.toMatchObject({
      allowed: false,
      retryAfter: expect.any(Number),
    });

    mockEval.mockResolvedValueOnce([
      3,
      RATE_LIMIT.CONSENT_REVOCATIONS_PER_DAY_PER_WORKSPACE + 1,
    ]);
    await expect(checkConsentRevocationRateLimit(WORKSPACE_ID)).resolves.toMatchObject({
      allowed: false,
      retryAfter: expect.any(Number),
    });

    mockEval.mockRejectedValueOnce(new Error("redis unavailable"));
    await expect(checkConsentRevocationRateLimit(WORKSPACE_ID)).rejects.toThrow(
      "Consent revocation rate limiter unavailable"
    );
  });
});
