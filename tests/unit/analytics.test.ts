import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks ---

const mockCount = vi.fn();
const mockFindFirst = vi.fn();
const mockAggregate = vi.fn();
const mockGroupBy = vi.fn();
const mockFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    eventLog: {
      count: (...args: unknown[]) => mockCount(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      aggregate: (...args: unknown[]) => mockAggregate(...args),
      groupBy: (...args: unknown[]) => mockGroupBy(...args),
    },
    subscription: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

const mockGetOrderCount = vi.fn();
vi.mock("@/lib/billing", () => ({
  getOrderCount: (...args: unknown[]) => mockGetOrderCount(...args),
}));

vi.mock("@/lib/currency", () => ({
  getExchangeRate: vi.fn().mockResolvedValue(1),
}));

vi.mock("@/lib/constants", () => ({
  BILLING_PLANS: {
    FREE: { name: "Free", ordersPerMonth: 50, eventLogRetentionDays: 7 },
    STARTER: { name: "Starter", ordersPerMonth: 500, eventLogRetentionDays: 7 },
    GROWTH: { name: "Growth", ordersPerMonth: 1000, eventLogRetentionDays: 30 },
    SCALE: { name: "Scale", ordersPerMonth: 5000, eventLogRetentionDays: 30 },
  },
}));

import { computeDashboardAnalytics, getHealthStatus } from "@/lib/analytics";

const WORKSPACE_ID = "ws_test_123";
const USER_ID = "user_test_456";

function setupDefaultMocks() {
  // Health: 100 events, 95 sent, 5 failed
  mockCount
    .mockResolvedValueOnce(100)  // total 24h
    .mockResolvedValueOnce(95)   // sent 24h
    .mockResolvedValueOnce(5)    // failed 24h
    .mockResolvedValueOnce(10)   // orders today (Purchase SENT today)
    .mockResolvedValueOnce(8)    // orders yesterday (Purchase SENT yesterday)
    // conversionAccuracy: last7d
    .mockResolvedValueOnce(30)   // total7d
    .mockResolvedValueOnce(29)   // sent7d
    .mockResolvedValueOnce(1)    // failed7d
    // conversionAccuracy: last30d
    .mockResolvedValueOnce(120)  // total30d
    .mockResolvedValueOnce(115)  // sent30d
    .mockResolvedValueOnce(5);   // failed30d

  // getCanonicalDestination fires BEFORE Promise.all, then lastEvent (in queryHealthMetrics)
  mockFindFirst
    .mockResolvedValueOnce({ destination: "META" })               // getCanonicalDestination
    .mockResolvedValueOnce({ createdAt: new Date("2026-02-18T12:00:00Z") }); // lastEvent

  // groupBy call order:
  // 1. enabledDestsQuery (before Promise.all)
  // 2-7. Revenue groupBy x6 (by currency, in queryRevenueMetrics)
  // 8. webhookBreakdown (in queryRevenueMetrics)
  // 9-10. Event breakdown today/yesterday (in queryEventBreakdown)
  // 11. Campaigns (in queryCampaignPerformance)
  // 12. Destination delivery (in queryDestinationDelivery)
  mockGroupBy
    .mockResolvedValueOnce([{ destination: "META", _count: 100 }]) // 1. enabledDestsQuery
    .mockResolvedValueOnce([{ currency: "USD", _sum: { value: 4280.5 } }])   // 2. AddToCart today
    .mockResolvedValueOnce([{ currency: "USD", _sum: { value: 3800.0 } }])   // 3. AddToCart yesterday
    .mockResolvedValueOnce([{ currency: "USD", _sum: { value: 2150.0 } }])   // 4. Checkout today
    .mockResolvedValueOnce([{ currency: "USD", _sum: { value: 2220.0 } }])   // 5. Checkout yesterday
    .mockResolvedValueOnce([{ currency: "USD", _sum: { value: 1890.0 } }])   // 6. Purchase today
    .mockResolvedValueOnce([{ currency: "USD", _sum: { value: 1750.0 } }])   // 7. Purchase yesterday
    .mockResolvedValueOnce([])   // 8. webhookBreakdown
    .mockResolvedValueOnce([     // 9. today event breakdown
      { eventName: "PageView", _count: 1245 },
      { eventName: "ViewContent", _count: 834 },
      { eventName: "AddToCart", _count: 312 },
      { eventName: "InitiateCheckout", _count: 156 },
      { eventName: "Purchase", _count: 89 },
    ])
    .mockResolvedValueOnce([     // 10. yesterday event breakdown
      { eventName: "PageView", _count: 1100 },
      { eventName: "ViewContent", _count: 780 },
      { eventName: "AddToCart", _count: 290 },
      { eventName: "InitiateCheckout", _count: 140 },
      { eventName: "Purchase", _count: 75 },
    ])
    .mockResolvedValueOnce([])   // 11. campaigns
    .mockResolvedValueOnce([{ destination: "META", status: "SENT", _count: 95 }, { destination: "META", status: "FAILED", _count: 5 }]);  // 12. destinationDelivery

  // Subscription
  mockFindUnique.mockResolvedValue({ plan: "STARTER" });

  // Order count from Redis
  mockGetOrderCount.mockResolvedValue(23);
}

/** Sets up 12 empty groupBy mocks for tests where all data is empty/zero */
function setupEmptyGroupByMocks(firstMock?: unknown[]) {
  const chain = mockGroupBy.mockResolvedValueOnce(firstMock ?? []);
  // 6 revenue groupBy + webhookBreakdown + 2 event breakdown + campaigns + destinationDelivery
  for (let i = 0; i < 11; i++) {
    chain.mockResolvedValueOnce([]);
  }
}

describe("getHealthStatus", () => {
  it("returns 'healthy' for 100% success rate", () => {
    expect(getHealthStatus(100, 100)).toBe("healthy");
  });

  it("returns 'healthy' for 95% success rate", () => {
    expect(getHealthStatus(95, 100)).toBe("healthy");
  });

  it("returns 'degraded' for 94% success rate", () => {
    expect(getHealthStatus(94, 100)).toBe("degraded");
  });

  it("returns 'degraded' for 80% success rate", () => {
    expect(getHealthStatus(80, 100)).toBe("degraded");
  });

  it("returns 'down' for 79% success rate", () => {
    expect(getHealthStatus(79, 100)).toBe("down");
  });

  it("returns 'down' for 0% success rate with events", () => {
    expect(getHealthStatus(0, 50)).toBe("down");
  });

  it("returns 'no_data' for 0 events", () => {
    expect(getHealthStatus(0, 0)).toBe("no_data");
  });

  it("returns 'no_data' for 0 events even with 100 rate", () => {
    expect(getHealthStatus(100, 0)).toBe("no_data");
  });
});

describe("computeDashboardAnalytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a complete DashboardAnalytics object", async () => {
    setupDefaultMocks();

    const result = await computeDashboardAnalytics(WORKSPACE_ID, USER_ID);

    expect(result).toHaveProperty("health");
    expect(result).toHaveProperty("revenue");
    expect(result).toHaveProperty("eventBreakdown");
    expect(result).toHaveProperty("billing");
    expect(result).toHaveProperty("retentionDays");
  });

  describe("health metrics", () => {
    it("computes correct success rate and status", async () => {
      setupDefaultMocks();

      const result = await computeDashboardAnalytics(WORKSPACE_ID, USER_ID);

      expect(result.health.totalEvents24h).toBe(100);
      expect(result.health.sentEvents24h).toBe(95);
      expect(result.health.failedEvents24h).toBe(5);
      expect(result.health.successRate).toBe(95);
      expect(result.health.status).toBe("healthy");
    });

    it("returns inactive when no events in 24h", async () => {
      mockCount
        .mockResolvedValueOnce(0)  // total
        .mockResolvedValueOnce(0)  // sent
        .mockResolvedValueOnce(0)  // failed
        .mockResolvedValueOnce(0)  // orders today
        .mockResolvedValueOnce(0)  // orders yesterday
        .mockResolvedValueOnce(0)  // total7d
        .mockResolvedValueOnce(0)  // sent7d
        .mockResolvedValueOnce(0)  // failed7d
        .mockResolvedValueOnce(0)  // total30d
        .mockResolvedValueOnce(0)  // sent30d
        .mockResolvedValueOnce(0); // failed30d

      mockFindFirst
        .mockResolvedValueOnce(null)   // getCanonicalDestination: no destination
        .mockResolvedValueOnce(null);  // lastEvent: no last event

      setupEmptyGroupByMocks();

      mockFindUnique.mockResolvedValue(null);
      mockGetOrderCount.mockResolvedValue(0);

      const result = await computeDashboardAnalytics(WORKSPACE_ID, USER_ID);

      expect(result.health.status).toBe("no_data");
      expect(result.health.successRate).toBe(0);
      expect(result.health.lastEventAt).toBeNull();
    });

    it("returns degraded for 85% success rate", async () => {
      mockCount
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(85)  // sent
        .mockResolvedValueOnce(15)  // failed
        .mockResolvedValueOnce(0)   // orders today
        .mockResolvedValueOnce(0)   // orders yesterday
        .mockResolvedValueOnce(0)   // total7d
        .mockResolvedValueOnce(0)   // sent7d
        .mockResolvedValueOnce(0)   // failed7d
        .mockResolvedValueOnce(0)   // total30d
        .mockResolvedValueOnce(0)   // sent30d
        .mockResolvedValueOnce(0);  // failed30d

      mockFindFirst
        .mockResolvedValueOnce({ destination: "META" })      // getCanonicalDestination
        .mockResolvedValueOnce({ createdAt: new Date() });   // lastEvent

      setupEmptyGroupByMocks([{ destination: "META", _count: 100 }]);

      mockFindUnique.mockResolvedValue(null);
      mockGetOrderCount.mockResolvedValue(0);

      const result = await computeDashboardAnalytics(WORKSPACE_ID, USER_ID);

      expect(result.health.status).toBe("degraded");
      expect(result.health.successRate).toBe(85);
    });

    it("returns down for 50% success rate", async () => {
      mockCount
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(50)  // sent
        .mockResolvedValueOnce(50)  // failed
        .mockResolvedValueOnce(0)   // orders today
        .mockResolvedValueOnce(0)   // orders yesterday
        .mockResolvedValueOnce(0)   // total7d
        .mockResolvedValueOnce(0)   // sent7d
        .mockResolvedValueOnce(0)   // failed7d
        .mockResolvedValueOnce(0)   // total30d
        .mockResolvedValueOnce(0)   // sent30d
        .mockResolvedValueOnce(0);  // failed30d

      mockFindFirst
        .mockResolvedValueOnce({ destination: "META" })      // getCanonicalDestination
        .mockResolvedValueOnce({ createdAt: new Date() });   // lastEvent

      setupEmptyGroupByMocks([{ destination: "META", _count: 100 }]);

      mockFindUnique.mockResolvedValue(null);
      mockGetOrderCount.mockResolvedValue(0);

      const result = await computeDashboardAnalytics(WORKSPACE_ID, USER_ID);

      expect(result.health.status).toBe("down");
      expect(result.health.successRate).toBe(50);
    });
  });

  describe("revenue metrics", () => {
    it("aggregates revenue values correctly", async () => {
      setupDefaultMocks();

      const result = await computeDashboardAnalytics(WORKSPACE_ID, USER_ID);

      expect(result.revenue.addToCartValue.today).toBe(4280.5);
      expect(result.revenue.addToCartValue.yesterday).toBe(3800.0);
      expect(result.revenue.checkoutValue.today).toBe(2150.0);
      expect(result.revenue.purchaseValue.today).toBe(1890.0);
      expect(result.revenue.purchaseValue.yesterday).toBe(1750.0);
    });

    it("uses detected currency", async () => {
      setupDefaultMocks();

      const result = await computeDashboardAnalytics(WORKSPACE_ID, USER_ID);

      expect(result.revenue.addToCartValue.currency).toBe("USD");
      expect(result.revenue.checkoutValue.currency).toBe("USD");
      expect(result.revenue.purchaseValue.currency).toBe("USD");
    });

    it("handles null values (no monetary data)", async () => {
      mockCount
        .mockResolvedValueOnce(10)  // total 24h
        .mockResolvedValueOnce(10)  // sent 24h
        .mockResolvedValueOnce(0)   // failed 24h
        .mockResolvedValueOnce(0)   // orders today
        .mockResolvedValueOnce(0)   // orders yesterday
        .mockResolvedValueOnce(0)   // total7d
        .mockResolvedValueOnce(0)   // sent7d
        .mockResolvedValueOnce(0)   // failed7d
        .mockResolvedValueOnce(0)   // total30d
        .mockResolvedValueOnce(0)   // sent30d
        .mockResolvedValueOnce(0);  // failed30d

      mockFindFirst
        .mockResolvedValueOnce({ destination: "META" })      // getCanonicalDestination
        .mockResolvedValueOnce({ createdAt: new Date() });   // lastEvent

      setupEmptyGroupByMocks([{ destination: "META", _count: 100 }]);

      mockFindUnique.mockResolvedValue(null);
      mockGetOrderCount.mockResolvedValue(0);

      const result = await computeDashboardAnalytics(WORKSPACE_ID, USER_ID);

      expect(result.revenue.addToCartValue.today).toBe(0);
      expect(result.revenue.checkoutValue.today).toBe(0);
      expect(result.revenue.purchaseValue.today).toBe(0);
      expect(result.revenue.addToCartValue.currency).toBe("USD"); // displayCurrency default
    });

    it("counts orders today and yesterday", async () => {
      setupDefaultMocks();

      const result = await computeDashboardAnalytics(WORKSPACE_ID, USER_ID);

      expect(result.revenue.ordersToday).toBe(10);
      expect(result.revenue.ordersYesterday).toBe(8);
    });
  });

  describe("event breakdown", () => {
    it("maps event counts correctly for all 5 types", async () => {
      setupDefaultMocks();

      const result = await computeDashboardAnalytics(WORKSPACE_ID, USER_ID);

      expect(result.eventBreakdown.PageView.today).toBe(1245);
      expect(result.eventBreakdown.ViewContent.today).toBe(834);
      expect(result.eventBreakdown.AddToCart.today).toBe(312);
      expect(result.eventBreakdown.InitiateCheckout.today).toBe(156);
      expect(result.eventBreakdown.Purchase.today).toBe(89);
    });

    it("maps yesterday counts correctly", async () => {
      setupDefaultMocks();

      const result = await computeDashboardAnalytics(WORKSPACE_ID, USER_ID);

      expect(result.eventBreakdown.PageView.yesterday).toBe(1100);
      expect(result.eventBreakdown.Purchase.yesterday).toBe(75);
    });

    it("returns 0 for event types with no events", async () => {
      mockCount
        .mockResolvedValueOnce(5)   // total 24h
        .mockResolvedValueOnce(5)   // sent 24h
        .mockResolvedValueOnce(0)   // failed 24h
        .mockResolvedValueOnce(0)   // orders today
        .mockResolvedValueOnce(0)   // orders yesterday
        .mockResolvedValueOnce(0)   // total7d
        .mockResolvedValueOnce(0)   // sent7d
        .mockResolvedValueOnce(0)   // failed7d
        .mockResolvedValueOnce(0)   // total30d
        .mockResolvedValueOnce(0)   // sent30d
        .mockResolvedValueOnce(0);  // failed30d

      mockFindFirst
        .mockResolvedValueOnce({ destination: "META" })      // getCanonicalDestination
        .mockResolvedValueOnce({ createdAt: new Date() });   // lastEvent

      // Only PageView events today, nothing yesterday
      mockGroupBy
        .mockResolvedValueOnce([{ destination: "META", _count: 100 }]) // enabledDestsQuery
        .mockResolvedValueOnce([])   // AddToCart today
        .mockResolvedValueOnce([])   // AddToCart yesterday
        .mockResolvedValueOnce([])   // Checkout today
        .mockResolvedValueOnce([])   // Checkout yesterday
        .mockResolvedValueOnce([])   // Purchase today
        .mockResolvedValueOnce([])   // Purchase yesterday
        .mockResolvedValueOnce([])   // webhookBreakdown
        .mockResolvedValueOnce([{ eventName: "PageView", _count: 5 }]) // today event breakdown
        .mockResolvedValueOnce([])   // yesterday event breakdown
        .mockResolvedValueOnce([])   // campaigns
        .mockResolvedValueOnce([]);  // destinationDelivery


      mockFindUnique.mockResolvedValue(null);
      mockGetOrderCount.mockResolvedValue(0);

      const result = await computeDashboardAnalytics(WORKSPACE_ID, USER_ID);

      expect(result.eventBreakdown.PageView.today).toBe(5);
      expect(result.eventBreakdown.ViewContent.today).toBe(0);
      expect(result.eventBreakdown.AddToCart.today).toBe(0);
      expect(result.eventBreakdown.InitiateCheckout.today).toBe(0);
      expect(result.eventBreakdown.Purchase.today).toBe(0);
      expect(result.eventBreakdown.PageView.yesterday).toBe(0);
    });
  });

  describe("billing usage", () => {
    it("computes correct percentage for STARTER plan", async () => {
      setupDefaultMocks();

      const result = await computeDashboardAnalytics(WORKSPACE_ID, USER_ID);

      expect(result.billing.plan).toBe("STARTER");
      expect(result.billing.ordersUsed).toBe(23);
      expect(result.billing.ordersLimit).toBe(500);
      expect(result.billing.usagePercent).toBe(5); // 23/500 = 4.6% rounds to 5
    });

    it("defaults to FREE plan when no subscription", async () => {
      mockCount
        .mockResolvedValueOnce(0)  // total 24h
        .mockResolvedValueOnce(0)  // sent 24h
        .mockResolvedValueOnce(0)  // failed 24h
        .mockResolvedValueOnce(0)  // orders today
        .mockResolvedValueOnce(0)  // orders yesterday
        .mockResolvedValueOnce(0)  // total7d
        .mockResolvedValueOnce(0)  // sent7d
        .mockResolvedValueOnce(0)  // failed7d
        .mockResolvedValueOnce(0)  // total30d
        .mockResolvedValueOnce(0)  // sent30d
        .mockResolvedValueOnce(0); // failed30d

      mockFindFirst.mockResolvedValue(null);
      setupEmptyGroupByMocks();

      mockFindUnique.mockResolvedValue(null); // no subscription
      mockGetOrderCount.mockResolvedValue(0);

      const result = await computeDashboardAnalytics(WORKSPACE_ID, USER_ID);

      expect(result.billing.plan).toBe("FREE");
      expect(result.billing.ordersLimit).toBe(50);
      expect(result.billing.usagePercent).toBe(0);
    });

    it("handles 0/50 as 0%", async () => {
      mockCount
        .mockResolvedValueOnce(0)  // total 24h
        .mockResolvedValueOnce(0)  // sent 24h
        .mockResolvedValueOnce(0)  // failed 24h
        .mockResolvedValueOnce(0)  // orders today
        .mockResolvedValueOnce(0)  // orders yesterday
        .mockResolvedValueOnce(0)  // total7d
        .mockResolvedValueOnce(0)  // sent7d
        .mockResolvedValueOnce(0)  // failed7d
        .mockResolvedValueOnce(0)  // total30d
        .mockResolvedValueOnce(0)  // sent30d
        .mockResolvedValueOnce(0); // failed30d

      mockFindFirst.mockResolvedValue(null);
      setupEmptyGroupByMocks();

      mockFindUnique.mockResolvedValue(null);
      mockGetOrderCount.mockResolvedValue(0);

      const result = await computeDashboardAnalytics(WORKSPACE_ID, USER_ID);

      expect(result.billing.usagePercent).toBe(0);
    });

    it("handles 50/50 as 100%", async () => {
      mockCount
        .mockResolvedValueOnce(0)  // total 24h
        .mockResolvedValueOnce(0)  // sent 24h
        .mockResolvedValueOnce(0)  // failed 24h
        .mockResolvedValueOnce(0)  // orders today
        .mockResolvedValueOnce(0)  // orders yesterday
        .mockResolvedValueOnce(0)  // total7d
        .mockResolvedValueOnce(0)  // sent7d
        .mockResolvedValueOnce(0)  // failed7d
        .mockResolvedValueOnce(0)  // total30d
        .mockResolvedValueOnce(0)  // sent30d
        .mockResolvedValueOnce(0); // failed30d

      mockFindFirst.mockResolvedValue(null);
      setupEmptyGroupByMocks();

      mockFindUnique.mockResolvedValue({ plan: "FREE" });
      mockGetOrderCount.mockResolvedValue(50);

      const result = await computeDashboardAnalytics(WORKSPACE_ID, USER_ID);

      expect(result.billing.usagePercent).toBe(100);
    });

    it("caps at 100% for over-limit usage", async () => {
      mockCount
        .mockResolvedValueOnce(0)  // total 24h
        .mockResolvedValueOnce(0)  // sent 24h
        .mockResolvedValueOnce(0)  // failed 24h
        .mockResolvedValueOnce(0)  // orders today
        .mockResolvedValueOnce(0)  // orders yesterday
        .mockResolvedValueOnce(0)  // total7d
        .mockResolvedValueOnce(0)  // sent7d
        .mockResolvedValueOnce(0)  // failed7d
        .mockResolvedValueOnce(0)  // total30d
        .mockResolvedValueOnce(0)  // sent30d
        .mockResolvedValueOnce(0); // failed30d

      mockFindFirst.mockResolvedValue(null);
      setupEmptyGroupByMocks();

      mockFindUnique.mockResolvedValue({ plan: "FREE" });
      mockGetOrderCount.mockResolvedValue(75); // over 50 limit

      const result = await computeDashboardAnalytics(WORKSPACE_ID, USER_ID);

      expect(result.billing.usagePercent).toBe(100);
    });

    it("handles Redis failure gracefully (returns 0 orders)", async () => {
      mockCount
        .mockResolvedValueOnce(0)  // total 24h
        .mockResolvedValueOnce(0)  // sent 24h
        .mockResolvedValueOnce(0)  // failed 24h
        .mockResolvedValueOnce(0)  // orders today
        .mockResolvedValueOnce(0)  // orders yesterday
        .mockResolvedValueOnce(0)  // total7d
        .mockResolvedValueOnce(0)  // sent7d
        .mockResolvedValueOnce(0)  // failed7d
        .mockResolvedValueOnce(0)  // total30d
        .mockResolvedValueOnce(0)  // sent30d
        .mockResolvedValueOnce(0); // failed30d

      mockFindFirst.mockResolvedValue(null);
      setupEmptyGroupByMocks();

      mockFindUnique.mockResolvedValue(null);
      mockGetOrderCount.mockRejectedValue(new Error("Redis connection failed"));

      const result = await computeDashboardAnalytics(WORKSPACE_ID, USER_ID);

      expect(result.billing.ordersUsed).toBe(0);
    });
  });

  describe("retention days", () => {
    it("returns 7 for FREE plan", async () => {
      mockCount
        .mockResolvedValueOnce(0)  // total 24h
        .mockResolvedValueOnce(0)  // sent 24h
        .mockResolvedValueOnce(0)  // failed 24h
        .mockResolvedValueOnce(0)  // orders today
        .mockResolvedValueOnce(0)  // orders yesterday
        .mockResolvedValueOnce(0)  // total7d
        .mockResolvedValueOnce(0)  // sent7d
        .mockResolvedValueOnce(0)  // failed7d
        .mockResolvedValueOnce(0)  // total30d
        .mockResolvedValueOnce(0)  // sent30d
        .mockResolvedValueOnce(0); // failed30d

      mockFindFirst.mockResolvedValue(null);
      setupEmptyGroupByMocks();

      mockFindUnique.mockResolvedValue({ plan: "FREE" });
      mockGetOrderCount.mockResolvedValue(0);

      const result = await computeDashboardAnalytics(WORKSPACE_ID, USER_ID);

      expect(result.retentionDays).toBe(7);
    });

    it("returns 30 for GROWTH plan", async () => {
      mockCount
        .mockResolvedValueOnce(0)  // total 24h
        .mockResolvedValueOnce(0)  // sent 24h
        .mockResolvedValueOnce(0)  // failed 24h
        .mockResolvedValueOnce(0)  // orders today
        .mockResolvedValueOnce(0)  // orders yesterday
        .mockResolvedValueOnce(0)  // total7d
        .mockResolvedValueOnce(0)  // sent7d
        .mockResolvedValueOnce(0)  // failed7d
        .mockResolvedValueOnce(0)  // total30d
        .mockResolvedValueOnce(0)  // sent30d
        .mockResolvedValueOnce(0); // failed30d

      mockFindFirst.mockResolvedValue(null);
      setupEmptyGroupByMocks();

      mockFindUnique.mockResolvedValue({ plan: "GROWTH" });
      mockGetOrderCount.mockResolvedValue(0);

      const result = await computeDashboardAnalytics(WORKSPACE_ID, USER_ID);

      expect(result.retentionDays).toBe(30);
    });
  });
});
