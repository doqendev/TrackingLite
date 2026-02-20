import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock ioredis
const mockGet = vi.fn();
const mockIncr = vi.fn();
const mockDecr = vi.fn();
const mockExpire = vi.fn();
const mockPipelineExec = vi.fn();

vi.mock("ioredis", () => {
  const MockRedis = vi.fn(function (this: Record<string, unknown>) {
    this.get = mockGet;
    this.incr = mockIncr;
    this.decr = mockDecr;
    this.expire = mockExpire;
    this.pipeline = () => ({
      incr: mockIncr,
      expire: mockExpire,
      exec: mockPipelineExec,
    });
  });
  return { default: MockRedis };
});

// Mock Prisma
const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    subscription: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

// Mock Stripe
vi.mock("@/lib/stripe", () => ({
  stripe: {
    subscriptions: {
      retrieve: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { checkOrderLimits, incrementOrderCount, getOrderCount } from "@/lib/billing";

const USER_ID = "user_test_123";

describe("checkOrderLimits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: incr returns 1 (well under any limit), decr is a no-op
    mockIncr.mockResolvedValue(1);
    mockDecr.mockResolvedValue(0);
    mockExpire.mockResolvedValue(1);
    mockPipelineExec.mockResolvedValue([[null, 1], [null, 1]]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Non-Purchase events are always free ──

  it("should allow PageView regardless of billing status", async () => {
    mockFindUnique.mockResolvedValue(null); // no subscription
    const result = await checkOrderLimits(USER_ID, "PageView");
    expect(result.allowed).toBe(true);
    expect(mockFindUnique).not.toHaveBeenCalled(); // shouldn't even check DB
  });

  it("should allow ViewContent regardless of billing status", async () => {
    const result = await checkOrderLimits(USER_ID, "ViewContent");
    expect(result.allowed).toBe(true);
  });

  it("should allow AddToCart regardless of billing status", async () => {
    const result = await checkOrderLimits(USER_ID, "AddToCart");
    expect(result.allowed).toBe(true);
  });

  it("should allow InitiateCheckout regardless of billing status", async () => {
    const result = await checkOrderLimits(USER_ID, "InitiateCheckout");
    expect(result.allowed).toBe(true);
  });

  // ── FREE plan (no subscription record) ──

  it("should allow Purchase for FREE user under 50 orders", async () => {
    mockFindUnique.mockResolvedValue(null); // no subscription = FREE
    mockIncr.mockResolvedValue(31); // 31st order, under limit of 50
    const result = await checkOrderLimits(USER_ID, "Purchase");
    expect(result.allowed).toBe(true);
  });

  it("should block Purchase for FREE user at 50 orders", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockIncr.mockResolvedValue(51); // new count is 51 — over the 50 limit
    const result = await checkOrderLimits(USER_ID, "Purchase");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Order limit reached");
    expect(result.limit).toBe(50);
    expect(result.used).toBe(50); // newCount - 1
    // Rollback decr should have been called
    expect(mockDecr).toHaveBeenCalledOnce();
  });

  it("should block Purchase for explicit FREE plan subscription at limit", async () => {
    mockFindUnique.mockResolvedValue({ plan: "FREE", status: "ACTIVE" });
    mockIncr.mockResolvedValue(51); // over the 50 limit
    const result = await checkOrderLimits(USER_ID, "Purchase");
    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(50);
    expect(mockDecr).toHaveBeenCalledOnce();
  });

  // ── STARTER plan ──

  it("should allow Purchase for STARTER user under 500 orders", async () => {
    mockFindUnique.mockResolvedValue({ plan: "STARTER", status: "ACTIVE", stripeSubscriptionId: "sub_123" });
    mockIncr.mockResolvedValue(201); // 201st order, under limit of 500
    const result = await checkOrderLimits(USER_ID, "Purchase");
    expect(result.allowed).toBe(true);
  });

  it("should attempt auto-upgrade for STARTER user at 500 orders", async () => {
    mockFindUnique.mockResolvedValue({
      plan: "STARTER",
      status: "ACTIVE",
      stripeSubscriptionId: "sub_123",
    });
    mockIncr.mockResolvedValue(501); // over the 500 limit

    // Auto-upgrade will fail (no Stripe price configured in test env), but event should still be allowed
    const result = await checkOrderLimits(USER_ID, "Purchase");
    expect(result.allowed).toBe(true); // allowed even if auto-upgrade fails
  });

  // ── GROWTH plan ──

  it("should allow Purchase for GROWTH user under 1000 orders", async () => {
    mockFindUnique.mockResolvedValue({ plan: "GROWTH", status: "ACTIVE", stripeSubscriptionId: "sub_456" });
    mockIncr.mockResolvedValue(801); // 801st order, under limit of 1000
    const result = await checkOrderLimits(USER_ID, "Purchase");
    expect(result.allowed).toBe(true);
  });

  // ── SCALE plan ──

  it("should allow Purchase for SCALE user under 5000 orders", async () => {
    mockFindUnique.mockResolvedValue({ plan: "SCALE", status: "ACTIVE" });
    mockIncr.mockResolvedValue(3001); // under limit of 5000
    const result = await checkOrderLimits(USER_ID, "Purchase");
    expect(result.allowed).toBe(true);
  });

  it("should block Purchase for SCALE user at 5000 orders (no auto-upgrade)", async () => {
    mockFindUnique.mockResolvedValue({ plan: "SCALE", status: "ACTIVE" });
    mockIncr.mockResolvedValue(5001); // over the 5000 limit
    const result = await checkOrderLimits(USER_ID, "Purchase");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Contact us");
    expect(result.limit).toBe(5000);
    expect(mockDecr).toHaveBeenCalledOnce();
  });

  // ── Subscription statuses ──

  it("should block Purchase for CANCELED subscription", async () => {
    mockFindUnique.mockResolvedValue({ plan: "STARTER", status: "CANCELED" });
    const result = await checkOrderLimits(USER_ID, "Purchase");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Subscription inactive");
  });

  it("should block Purchase for UNPAID subscription", async () => {
    mockFindUnique.mockResolvedValue({ plan: "GROWTH", status: "UNPAID" });
    const result = await checkOrderLimits(USER_ID, "Purchase");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Subscription inactive");
  });

  it("should allow Purchase for PAST_DUE subscription (grace period)", async () => {
    mockFindUnique.mockResolvedValue({ plan: "STARTER", status: "PAST_DUE" });
    const result = await checkOrderLimits(USER_ID, "Purchase");
    expect(result.allowed).toBe(true);
  });

  // ── Redis key format ──

  it("should use orders:{userId}:{YYYY-MM} key format for Purchase check", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockIncr.mockResolvedValue(1);
    await checkOrderLimits(USER_ID, "Purchase");
    const expectedKeyPattern = new RegExp(`^orders:${USER_ID}:\\d{4}-\\d{2}$`);
    // The new INCR-first pattern uses r.incr (not r.get) to check the count
    expect(mockIncr).toHaveBeenCalledWith(expect.stringMatching(expectedKeyPattern));
  });
});

describe("incrementOrderCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPipelineExec.mockResolvedValue([[null, 1], [null, 1]]);
  });

  it("should increment Redis counter with orders:{userId}:{YYYY-MM} key", async () => {
    await incrementOrderCount(USER_ID);
    const expectedKeyPattern = new RegExp(`^orders:${USER_ID}:\\d{4}-\\d{2}$`);
    expect(mockIncr).toHaveBeenCalledWith(expect.stringMatching(expectedKeyPattern));
  });

  it("should set 35-day TTL on the key", async () => {
    await incrementOrderCount(USER_ID);
    expect(mockExpire).toHaveBeenCalledWith(
      expect.stringContaining(`orders:${USER_ID}`),
      35 * 24 * 60 * 60
    );
  });

  it("should execute pipeline", async () => {
    await incrementOrderCount(USER_ID);
    expect(mockPipelineExec).toHaveBeenCalledOnce();
  });
});

describe("getOrderCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 0 when no Redis key exists", async () => {
    mockGet.mockResolvedValue(null);
    const count = await getOrderCount(USER_ID);
    expect(count).toBe(0);
  });

  it("should return parsed integer from Redis", async () => {
    mockGet.mockResolvedValue("42");
    const count = await getOrderCount(USER_ID);
    expect(count).toBe(42);
  });

  it("should use orders:{userId}:{YYYY-MM} key format", async () => {
    mockGet.mockResolvedValue("10");
    await getOrderCount(USER_ID);
    const expectedKeyPattern = new RegExp(`^orders:${USER_ID}:\\d{4}-\\d{2}$`);
    expect(mockGet).toHaveBeenCalledWith(expect.stringMatching(expectedKeyPattern));
  });
});
