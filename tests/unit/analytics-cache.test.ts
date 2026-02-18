import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockGet = vi.fn();
const mockSetex = vi.fn();

vi.mock("ioredis", () => {
  const MockRedis = vi.fn(function (this: Record<string, unknown>) {
    this.get = mockGet;
    this.setex = mockSetex;
  });
  return { default: MockRedis };
});

import { getCachedAnalytics } from "@/lib/analytics-cache";
import type { DashboardAnalytics } from "@/types/app";

const WORKSPACE_ID = "ws_test_123";

const mockAnalytics: DashboardAnalytics = {
  health: {
    status: "healthy",
    successRate: 98,
    totalEvents24h: 500,
    sentEvents24h: 490,
    failedEvents24h: 10,
    lastEventAt: new Date("2026-02-18T12:00:00Z"),
  },
  revenue: {
    addToCartValue: { today: 1000, yesterday: 900, currency: "USD" },
    checkoutValue: { today: 500, yesterday: 450, currency: "USD" },
    purchaseValue: { today: 300, yesterday: 250, currency: "USD" },
    ordersToday: 10,
    ordersYesterday: 8,
  },
  eventBreakdown: {
    PageView: { today: 200, yesterday: 180 },
    ViewContent: { today: 150, yesterday: 130 },
    AddToCart: { today: 80, yesterday: 70 },
    InitiateCheckout: { today: 40, yesterday: 35 },
    Purchase: { today: 30, yesterday: 25 },
  },
  billing: {
    plan: "STARTER",
    ordersUsed: 23,
    ordersLimit: 500,
    usagePercent: 5,
  },
  retentionDays: 7,
};

describe("getCachedAnalytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns cached data when available", async () => {
    mockGet.mockResolvedValue(JSON.stringify(mockAnalytics));
    const computeFn = vi.fn();

    const result = await getCachedAnalytics(WORKSPACE_ID, computeFn);

    expect(mockGet).toHaveBeenCalledWith(`analytics:${WORKSPACE_ID}`);
    expect(computeFn).not.toHaveBeenCalled();
    expect(result.health.status).toBe("healthy");
    expect(result.billing.plan).toBe("STARTER");
  });

  it("restores Date objects from cached JSON", async () => {
    mockGet.mockResolvedValue(JSON.stringify(mockAnalytics));
    const computeFn = vi.fn();

    const result = await getCachedAnalytics(WORKSPACE_ID, computeFn);

    expect(result.health.lastEventAt).toBeInstanceOf(Date);
  });

  it("calls compute function on cache miss", async () => {
    mockGet.mockResolvedValue(null);
    mockSetex.mockResolvedValue("OK");
    const computeFn = vi.fn().mockResolvedValue(mockAnalytics);

    const result = await getCachedAnalytics(WORKSPACE_ID, computeFn);

    expect(computeFn).toHaveBeenCalledTimes(1);
    expect(result.health.status).toBe("healthy");
  });

  it("writes to cache after computation", async () => {
    mockGet.mockResolvedValue(null);
    mockSetex.mockResolvedValue("OK");
    const computeFn = vi.fn().mockResolvedValue(mockAnalytics);

    await getCachedAnalytics(WORKSPACE_ID, computeFn);

    expect(mockSetex).toHaveBeenCalledTimes(1);
    expect(mockSetex).toHaveBeenCalledWith(
      `analytics:${WORKSPACE_ID}`,
      60,
      expect.any(String)
    );

    // Verify the cached string is valid JSON with expected data
    const cachedString = mockSetex.mock.calls[0][2];
    const parsed = JSON.parse(cachedString);
    expect(parsed.health.status).toBe("healthy");
  });

  it("falls back to computation on Redis get error", async () => {
    mockGet.mockRejectedValue(new Error("Redis connection refused"));
    mockSetex.mockResolvedValue("OK");
    const computeFn = vi.fn().mockResolvedValue(mockAnalytics);

    const result = await getCachedAnalytics(WORKSPACE_ID, computeFn);

    expect(computeFn).toHaveBeenCalledTimes(1);
    expect(result.health.status).toBe("healthy");
  });

  it("does not crash on Redis write error", async () => {
    mockGet.mockResolvedValue(null);
    mockSetex.mockRejectedValue(new Error("Redis write failed"));
    const computeFn = vi.fn().mockResolvedValue(mockAnalytics);

    const result = await getCachedAnalytics(WORKSPACE_ID, computeFn);

    expect(result.health.status).toBe("healthy");
    expect(computeFn).toHaveBeenCalledTimes(1);
  });

  it("handles null lastEventAt in cached data", async () => {
    const analyticsNoEvent = {
      ...mockAnalytics,
      health: { ...mockAnalytics.health, lastEventAt: null },
    };
    mockGet.mockResolvedValue(JSON.stringify(analyticsNoEvent));
    const computeFn = vi.fn();

    const result = await getCachedAnalytics(WORKSPACE_ID, computeFn);

    expect(result.health.lastEventAt).toBeNull();
  });
});
