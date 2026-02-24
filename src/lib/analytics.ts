import { db } from "@/lib/db";
import { Destination, EventName, EventStatus } from "@prisma/client";
import { BILLING_PLANS } from "@/lib/constants";
import { getOrderCount } from "@/lib/billing";
import type {
  DashboardAnalytics,
  HealthMetrics,
  RevenueMetrics,
  EventBreakdown,
  BillingUsage,
  ConversionAccuracy,
  CampaignRow,
  DestinationDeliveryRow,
} from "@/types/app";

const EVENT_NAMES: EventName[] = [
  "PageView",
  "ViewContent",
  "AddToCart",
  "InitiateCheckout",
  "Purchase",
  "Refund",
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

/**
 * Find the first destination used by a workspace.
 * Used to deduplicate the "All" view: since every event fans out to ALL
 * enabled destinations, filtering by any single one gives correct unique counts.
 */
async function getCanonicalDestination(
  workspaceId: string
): Promise<Destination | null> {
  const first = await db.eventLog.findFirst({
    where: { workspaceId },
    select: { destination: true },
    orderBy: { createdAt: "asc" },
  });
  return first?.destination ?? null;
}

function destFilter(destination?: Destination | null) {
  return destination ? { destination } : {};
}

async function queryHealthMetrics(
  workspaceId: string,
  since24h: Date,
  destination?: Destination | null
): Promise<HealthMetrics> {
  const df = destFilter(destination);
  const [totalEvents24h, sentEvents24h, failedEvents24h, lastEvent] =
    await Promise.all([
      db.eventLog.count({
        where: { workspaceId, createdAt: { gte: since24h }, ...df },
      }),
      db.eventLog.count({
        where: {
          workspaceId,
          createdAt: { gte: since24h },
          status: EventStatus.SENT,
          ...df,
        },
      }),
      db.eventLog.count({
        where: {
          workspaceId,
          createdAt: { gte: since24h },
          status: EventStatus.FAILED,
          ...df,
        },
      }),
      db.eventLog.findFirst({
        where: { workspaceId, ...df },
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
  now: Date,
  destination?: Destination | null
): Promise<RevenueMetrics> {
  const df = destFilter(destination);
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
        ...df,
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
        ...df,
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
        ...df,
      },
    }),
    db.eventLog.count({
      where: {
        workspaceId,
        eventName: "Purchase",
        status: EventStatus.SENT,
        createdAt: { gte: yesterdayStart, lt: todayStart },
        ...df,
      },
    }),
  ];

  // Dominant currency query
  const currencyQuery = db.eventLog.findFirst({
    where: { workspaceId, currency: { not: null }, ...df },
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
  now: Date,
  destination?: Destination | null
): Promise<EventBreakdown> {
  const df = destFilter(destination);
  const [todayGroups, yesterdayGroups] = await Promise.all([
    db.eventLog.groupBy({
      by: ["eventName"],
      where: {
        workspaceId,
        createdAt: { gte: todayStart, lte: now },
        ...df,
      },
      _count: true,
    }),
    db.eventLog.groupBy({
      by: ["eventName"],
      where: {
        workspaceId,
        createdAt: { gte: yesterdayStart, lt: todayStart },
        ...df,
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

async function queryConversionAccuracy(
  workspaceId: string,
  destination?: Destination | null
): Promise<ConversionAccuracy> {
  const df = destFilter(destination);
  const now = new Date();
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [total7d, sent7d, failed7d, total30d, sent30d, failed30d] =
    await Promise.all([
      db.eventLog.count({
        where: { workspaceId, eventName: "Purchase", createdAt: { gte: since7d }, ...df },
      }),
      db.eventLog.count({
        where: {
          workspaceId,
          eventName: "Purchase",
          status: EventStatus.SENT,
          createdAt: { gte: since7d },
          ...df,
        },
      }),
      db.eventLog.count({
        where: {
          workspaceId,
          eventName: "Purchase",
          status: EventStatus.FAILED,
          createdAt: { gte: since7d },
          ...df,
        },
      }),
      db.eventLog.count({
        where: { workspaceId, eventName: "Purchase", createdAt: { gte: since30d }, ...df },
      }),
      db.eventLog.count({
        where: {
          workspaceId,
          eventName: "Purchase",
          status: EventStatus.SENT,
          createdAt: { gte: since30d },
          ...df,
        },
      }),
      db.eventLog.count({
        where: {
          workspaceId,
          eventName: "Purchase",
          status: EventStatus.FAILED,
          createdAt: { gte: since30d },
          ...df,
        },
      }),
    ]);

  return {
    last7d: {
      total: total7d,
      sent: sent7d,
      failed: failed7d,
      accuracy: total7d > 0 ? Math.round((sent7d / total7d) * 1000) / 10 : 0,
    },
    last30d: {
      total: total30d,
      sent: sent30d,
      failed: failed30d,
      accuracy:
        total30d > 0 ? Math.round((sent30d / total30d) * 1000) / 10 : 0,
    },
  };
}

async function queryCampaignPerformance(
  workspaceId: string,
  destination?: Destination | null
): Promise<CampaignRow[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Use provided destination or find canonical to avoid duplicate counting
  const filterDest =
    destination ?? (await getCanonicalDestination(workspaceId));

  const campaigns = await db.eventLog.groupBy({
    by: ["utmSource", "utmCampaign"],
    where: {
      workspaceId,
      createdAt: { gte: thirtyDaysAgo },
      utmSource: { not: null },
      ...(filterDest ? { destination: filterDest } : {}),
    },
    _count: true,
    _sum: { value: true },
    orderBy: { _sum: { value: "desc" } },
    take: 30,
  });

  return campaigns.map((c) => ({
    utmSource: c.utmSource ?? "",
    utmCampaign: c.utmCampaign ?? "",
    events: c._count,
    revenue: c._sum?.value ?? 0,
  }));
}

async function queryDestinationDelivery(
  workspaceId: string,
  since24h: Date
): Promise<DestinationDeliveryRow[]> {
  const groups = await db.eventLog.groupBy({
    by: ["destination", "status"],
    where: { workspaceId, createdAt: { gte: since24h } },
    _count: true,
  });

  const destMap = new Map<string, { sent: number; failed: number; total: number }>();

  for (const g of groups) {
    const existing = destMap.get(g.destination) ?? { sent: 0, failed: 0, total: 0 };
    existing.total += g._count;
    if (g.status === EventStatus.SENT) {
      existing.sent += g._count;
    } else if (g.status === EventStatus.FAILED) {
      existing.failed += g._count;
    }
    destMap.set(g.destination, existing);
  }

  return Array.from(destMap.entries()).map(([destination, stats]) => ({
    destination,
    sent: stats.sent,
    failed: stats.failed,
    total: stats.total,
    successRate:
      stats.total > 0
        ? Math.round((stats.sent / stats.total) * 1000) / 10
        : 0,
  }));
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
  userId: string,
  displayCurrency?: string
): Promise<DashboardAnalytics> {
  const { now, todayStart, yesterdayStart, since24h } = getTimeWindows();

  // Always use canonical destination to deduplicate multi-dest fan-out
  const filterDest = await getCanonicalDestination(workspaceId);

  // Query enabled destinations for display
  const enabledDestsQuery = db.eventLog.groupBy({
    by: ["destination"],
    where: { workspaceId },
    _count: true,
  });

  const [health, revenue, eventBreakdown, billing, conversionAccuracy, campaigns, destinationDelivery, enabledDests] =
    await Promise.all([
      queryHealthMetrics(workspaceId, since24h, filterDest),
      queryRevenueMetrics(workspaceId, todayStart, yesterdayStart, now, filterDest),
      queryEventBreakdown(workspaceId, todayStart, yesterdayStart, now, filterDest),
      queryBillingUsage(userId),
      queryConversionAccuracy(workspaceId, filterDest),
      queryCampaignPerformance(workspaceId, filterDest),
      queryDestinationDelivery(workspaceId, since24h),
      enabledDestsQuery,
    ]);

  const planConfig =
    BILLING_PLANS[billing.plan as keyof typeof BILLING_PLANS];
  const retentionDays = planConfig?.eventLogRetentionDays ?? 7;

  const currency = displayCurrency || revenue.purchaseValue.currency;

  return {
    health,
    revenue,
    eventBreakdown,
    billing,
    retentionDays,
    conversionAccuracy,
    campaigns,
    destinationDelivery,
    currency,
    enabledDestinations: enabledDests.map((d) => d.destination),
  };
}

// Export for testing
export { getHealthStatus, getTimeWindows, getCanonicalDestination };
