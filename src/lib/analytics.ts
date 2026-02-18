import { db } from "@/lib/db";
import { EventName, EventStatus } from "@prisma/client";
import { BILLING_PLANS } from "@/lib/constants";
import { getOrderCount } from "@/lib/billing";
import type {
  DashboardAnalytics,
  HealthMetrics,
  RevenueMetrics,
  EventBreakdown,
  BillingUsage,
} from "@/types/app";

const EVENT_NAMES: EventName[] = [
  "PageView",
  "ViewContent",
  "AddToCart",
  "InitiateCheckout",
  "Purchase",
];

function getHealthStatus(
  successRate: number,
  totalEvents: number
): HealthMetrics["status"] {
  if (totalEvents === 0) return "inactive";
  if (successRate >= 95) return "healthy";
  if (successRate >= 80) return "degraded";
  return "down";
}

function getTimeWindows() {
  const now = new Date();
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return { now, todayStart, yesterdayStart, since24h };
}

async function queryHealthMetrics(
  workspaceId: string,
  since24h: Date
): Promise<HealthMetrics> {
  const [totalEvents24h, sentEvents24h, failedEvents24h, lastEvent] =
    await Promise.all([
      db.eventLog.count({
        where: { workspaceId, createdAt: { gte: since24h } },
      }),
      db.eventLog.count({
        where: {
          workspaceId,
          createdAt: { gte: since24h },
          status: EventStatus.SENT,
        },
      }),
      db.eventLog.count({
        where: {
          workspaceId,
          createdAt: { gte: since24h },
          status: EventStatus.FAILED,
        },
      }),
      db.eventLog.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);

  const successRate =
    totalEvents24h > 0
      ? Math.round((sentEvents24h / totalEvents24h) * 100 * 10) / 10
      : 0;

  return {
    status: getHealthStatus(successRate, totalEvents24h),
    successRate,
    totalEvents24h,
    sentEvents24h,
    failedEvents24h,
    lastEventAt: lastEvent?.createdAt ?? null,
  };
}

async function queryRevenueMetrics(
  workspaceId: string,
  todayStart: Date,
  yesterdayStart: Date,
  now: Date
): Promise<RevenueMetrics> {
  const revenueEventTypes: EventName[] = [
    "AddToCart",
    "InitiateCheckout",
    "Purchase",
  ];

  const queries = revenueEventTypes.flatMap((eventName) => [
    // Today sum
    db.eventLog.aggregate({
      where: {
        workspaceId,
        eventName,
        status: EventStatus.SENT,
        createdAt: { gte: todayStart, lte: now },
      },
      _sum: { value: true },
    }),
    // Yesterday sum
    db.eventLog.aggregate({
      where: {
        workspaceId,
        eventName,
        status: EventStatus.SENT,
        createdAt: { gte: yesterdayStart, lt: todayStart },
      },
      _sum: { value: true },
    }),
  ]);

  // Orders today/yesterday
  const orderQueries = [
    db.eventLog.count({
      where: {
        workspaceId,
        eventName: "Purchase",
        status: EventStatus.SENT,
        createdAt: { gte: todayStart, lte: now },
      },
    }),
    db.eventLog.count({
      where: {
        workspaceId,
        eventName: "Purchase",
        status: EventStatus.SENT,
        createdAt: { gte: yesterdayStart, lt: todayStart },
      },
    }),
  ];

  // Dominant currency query
  const currencyQuery = db.eventLog.findFirst({
    where: { workspaceId, currency: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { currency: true },
  });

  const [results, ordersToday, ordersYesterday, currencyEvent] =
    await Promise.all([
      Promise.all(queries),
      orderQueries[0],
      orderQueries[1],
      currencyQuery,
    ]);

  const currency = currencyEvent?.currency ?? "USD";

  return {
    addToCartValue: {
      today: results[0]._sum.value ?? 0,
      yesterday: results[1]._sum.value ?? 0,
      currency,
    },
    checkoutValue: {
      today: results[2]._sum.value ?? 0,
      yesterday: results[3]._sum.value ?? 0,
      currency,
    },
    purchaseValue: {
      today: results[4]._sum.value ?? 0,
      yesterday: results[5]._sum.value ?? 0,
      currency,
    },
    ordersToday,
    ordersYesterday,
  };
}

async function queryEventBreakdown(
  workspaceId: string,
  todayStart: Date,
  yesterdayStart: Date,
  now: Date
): Promise<EventBreakdown> {
  const [todayGroups, yesterdayGroups] = await Promise.all([
    db.eventLog.groupBy({
      by: ["eventName"],
      where: {
        workspaceId,
        createdAt: { gte: todayStart, lte: now },
      },
      _count: true,
    }),
    db.eventLog.groupBy({
      by: ["eventName"],
      where: {
        workspaceId,
        createdAt: { gte: yesterdayStart, lt: todayStart },
      },
      _count: true,
    }),
  ]);

  const todayMap = new Map(
    todayGroups.map((g) => [g.eventName, g._count])
  );
  const yesterdayMap = new Map(
    yesterdayGroups.map((g) => [g.eventName, g._count])
  );

  const breakdown = {} as EventBreakdown;
  for (const name of EVENT_NAMES) {
    breakdown[name] = {
      today: todayMap.get(name) ?? 0,
      yesterday: yesterdayMap.get(name) ?? 0,
    };
  }

  return breakdown;
}

async function queryBillingUsage(userId: string): Promise<BillingUsage> {
  const subscription = await db.subscription.findUnique({
    where: { userId },
    select: { plan: true },
  });

  const plan = subscription?.plan ?? "FREE";
  const planConfig = BILLING_PLANS[plan as keyof typeof BILLING_PLANS];
  const ordersLimit = planConfig?.ordersPerMonth ?? 50;

  let ordersUsed: number;
  try {
    ordersUsed = await getOrderCount(userId);
  } catch {
    ordersUsed = 0;
  }

  return {
    plan,
    ordersUsed,
    ordersLimit,
    usagePercent: Math.min(100, Math.round((ordersUsed / ordersLimit) * 100)),
  };
}

export async function computeDashboardAnalytics(
  workspaceId: string,
  userId: string
): Promise<DashboardAnalytics> {
  const { now, todayStart, yesterdayStart, since24h } = getTimeWindows();

  const [health, revenue, eventBreakdown, billing] = await Promise.all([
    queryHealthMetrics(workspaceId, since24h),
    queryRevenueMetrics(workspaceId, todayStart, yesterdayStart, now),
    queryEventBreakdown(workspaceId, todayStart, yesterdayStart, now),
    queryBillingUsage(userId),
  ]);

  const planConfig =
    BILLING_PLANS[billing.plan as keyof typeof BILLING_PLANS];
  const retentionDays = planConfig?.eventLogRetentionDays ?? 7;

  return {
    health,
    revenue,
    eventBreakdown,
    billing,
    retentionDays,
  };
}

// Export for testing
export { getHealthStatus, getTimeWindows };
