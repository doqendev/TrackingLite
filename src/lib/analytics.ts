import { db } from "@/lib/db";
import { Destination, EventName, EventStatus } from "@prisma/client";
import { BILLING_PLANS } from "@/lib/constants";
import { getOrderCount } from "@/lib/billing";
import { getExchangeRate } from "@/lib/currency";
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
  if (totalEvents === 0) return "no_data";
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

/**
 * Collect exchange rates for all unique currencies in a set of grouped results.
 * Returns a Map from currency code → rate (relative to targetCurrency).
 */
async function collectExchangeRates(
  groups: Array<{ currency: string | null }>,
  targetCurrency: string
): Promise<Map<string, number>> {
  const currencies = new Set<string>();
  for (const g of groups) {
    if (g.currency && g.currency !== targetCurrency) currencies.add(g.currency);
  }

  const rates = new Map<string, number>();
  rates.set(targetCurrency, 1);

  if (currencies.size > 0) {
    await Promise.all(
      Array.from(currencies).map(async (c) => {
        rates.set(c, await getExchangeRate(c, targetCurrency));
      })
    );
  }

  return rates;
}

async function queryRevenueMetrics(
  workspaceId: string,
  todayStart: Date,
  yesterdayStart: Date,
  now: Date,
  displayCurrency: string,
  destination?: Destination | null
): Promise<RevenueMetrics> {
  const df = destFilter(destination);
  const revenueEventTypes: EventName[] = [
    "AddToCart",
    "InitiateCheckout",
    "Purchase",
  ];

  const revenueStatuses = { in: [EventStatus.SENT, EventStatus.PENDING, EventStatus.RETRYING] };

  // Group by currency so mixed-currency events are converted before summing
  const queries = revenueEventTypes.flatMap((eventName) => [
    db.eventLog.groupBy({
      by: ["currency"],
      where: {
        workspaceId,
        eventName,
        status: revenueStatuses,
        createdAt: { gte: todayStart, lte: now },
        ...df,
      },
      _sum: { value: true },
    }),
    db.eventLog.groupBy({
      by: ["currency"],
      where: {
        workspaceId,
        eventName,
        status: revenueStatuses,
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
        status: revenueStatuses,
        createdAt: { gte: todayStart, lte: now },
        ...df,
      },
    }),
    db.eventLog.count({
      where: {
        workspaceId,
        eventName: "Purchase",
        status: revenueStatuses,
        createdAt: { gte: yesterdayStart, lt: todayStart },
        ...df,
      },
    }),
  ];

  // Webhook Purchase revenue grouped by payment gateway + currency
  const webhookBreakdownQuery = db.eventLog.groupBy({
    by: ["paymentGateway", "currency"],
    where: {
      workspaceId,
      eventName: "Purchase",
      source: "webhook",
      status: { in: [EventStatus.SENT, EventStatus.PENDING, EventStatus.RETRYING] },
      createdAt: { gte: todayStart, lte: now },
      ...df,
    },
    _sum: { value: true },
  });

  const [results, ordersToday, ordersYesterday, webhookGroups] =
    await Promise.all([
      Promise.all(queries),
      orderQueries[0],
      orderQueries[1],
      webhookBreakdownQuery,
    ]);

  // Fetch exchange rates for all unique currencies → displayCurrency
  const rates = await collectExchangeRates(
    [...results.flat(), ...webhookGroups],
    displayCurrency
  );

  function sumConverted(
    groups: Array<{ currency: string | null; _sum: { value: number | null } }>
  ): number {
    return groups.reduce((sum, g) => {
      const val = g._sum.value ?? 0;
      if (val === 0) return sum;
      const rate = rates.get(g.currency ?? displayCurrency) ?? 0;
      if (rate === 0) return sum; // unsupported currency — skip
      return sum + val * rate;
    }, 0);
  }

  // Aggregate webhook breakdown by gateway with currency conversion
  const gatewayMap = new Map<string, number>();
  for (const g of webhookGroups) {
    if (!g.paymentGateway) continue;
    const val = g._sum.value ?? 0;
    if (val === 0) continue;
    const rate = rates.get(g.currency ?? displayCurrency) ?? 0;
    if (rate === 0) continue; // unsupported currency — skip
    gatewayMap.set(
      g.paymentGateway,
      (gatewayMap.get(g.paymentGateway) ?? 0) + val * rate
    );
  }
  const webhookBreakdown = Array.from(gatewayMap.entries())
    .map(([gateway, value]) => ({ gateway, value }))
    .filter((g) => g.value > 0)
    .sort((a, b) => b.value - a.value);

  return {
    addToCartValue: {
      today: sumConverted(results[0]),
      yesterday: sumConverted(results[1]),
      currency: displayCurrency,
    },
    checkoutValue: {
      today: sumConverted(results[2]),
      yesterday: sumConverted(results[3]),
      currency: displayCurrency,
    },
    purchaseValue: {
      today: sumConverted(results[4]),
      yesterday: sumConverted(results[5]),
      currency: displayCurrency,
    },
    ordersToday,
    ordersYesterday,
    webhookBreakdown,
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
  displayCurrency: string,
  destination?: Destination | null
): Promise<CampaignRow[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Use provided destination or find canonical to avoid duplicate counting
  const filterDest =
    destination ?? (await getCanonicalDestination(workspaceId));

  const rows = await db.eventLog.groupBy({
    by: ["utmSource", "utmCampaign", "currency"],
    where: {
      workspaceId,
      createdAt: { gte: thirtyDaysAgo },
      utmSource: { not: null },
      ...(filterDest ? { destination: filterDest } : {}),
    },
    _count: true,
    _sum: { value: true },
  });

  const rates = await collectExchangeRates(rows, displayCurrency);

  // Aggregate by (utmSource, utmCampaign) with currency conversion
  const campMap = new Map<string, { utmSource: string; utmCampaign: string; events: number; revenue: number }>();
  for (const c of rows) {
    const key = `${c.utmSource}\0${c.utmCampaign}`;
    const existing = campMap.get(key) ?? {
      utmSource: c.utmSource ?? "",
      utmCampaign: c.utmCampaign ?? "",
      events: 0,
      revenue: 0,
    };
    const rate = rates.get(c.currency ?? displayCurrency) ?? 0;
    existing.events += c._count;
    existing.revenue += rate === 0 ? 0 : (c._sum?.value ?? 0) * rate;
    campMap.set(key, existing);
  }

  return Array.from(campMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 30);
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

async function safeQuery<T>(fn: () => Promise<T>, defaultValue: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error("Analytics query failed:", error);
    return defaultValue;
  }
}

const DEFAULT_HEALTH: HealthMetrics = {
  status: "no_data",
  successRate: 0,
  totalEvents24h: 0,
  sentEvents24h: 0,
  failedEvents24h: 0,
  lastEventAt: null,
};

const DEFAULT_REVENUE: RevenueMetrics = {
  addToCartValue: { today: 0, yesterday: 0, currency: "USD" },
  checkoutValue: { today: 0, yesterday: 0, currency: "USD" },
  purchaseValue: { today: 0, yesterday: 0, currency: "USD" },
  ordersToday: 0,
  ordersYesterday: 0,
  webhookBreakdown: [],
};

const DEFAULT_EVENT_BREAKDOWN: EventBreakdown = {
  PageView: { today: 0, yesterday: 0 },
  ViewContent: { today: 0, yesterday: 0 },
  AddToCart: { today: 0, yesterday: 0 },
  InitiateCheckout: { today: 0, yesterday: 0 },
  Purchase: { today: 0, yesterday: 0 },
  Refund: { today: 0, yesterday: 0 },
};

const DEFAULT_BILLING: BillingUsage = {
  plan: "FREE",
  ordersUsed: 0,
  ordersLimit: 50,
  usagePercent: 0,
};

const DEFAULT_CONVERSION_ACCURACY: ConversionAccuracy = {
  last7d: { total: 0, sent: 0, failed: 0, accuracy: 0 },
  last30d: { total: 0, sent: 0, failed: 0, accuracy: 0 },
};

export async function computeDashboardAnalytics(
  workspaceId: string,
  userId: string,
  displayCurrency?: string
): Promise<DashboardAnalytics> {
  const { now, todayStart, yesterdayStart, since24h } = getTimeWindows();

  // Always use canonical destination to deduplicate multi-dest fan-out
  const filterDest = await safeQuery(
    () => getCanonicalDestination(workspaceId),
    null
  );

  const targetCurrency = displayCurrency || "USD";

  const defaultRevenue: RevenueMetrics = {
    ...DEFAULT_REVENUE,
    addToCartValue: { ...DEFAULT_REVENUE.addToCartValue, currency: targetCurrency },
    checkoutValue: { ...DEFAULT_REVENUE.checkoutValue, currency: targetCurrency },
    purchaseValue: { ...DEFAULT_REVENUE.purchaseValue, currency: targetCurrency },
  };

  // Start enabledDestsQuery before Promise.all to maintain execution order
  const enabledDestsQuery = db.eventLog.groupBy({
    by: ["destination"],
    where: { workspaceId },
    _count: true,
  }).catch((error) => {
    console.error("Analytics query failed:", error);
    return [] as Array<{ destination: Destination; _count: number }>;
  });

  const [health, revenue, eventBreakdown, billing, conversionAccuracy, campaigns, destinationDelivery, enabledDests] =
    await Promise.all([
      safeQuery(() => queryHealthMetrics(workspaceId, since24h, filterDest), DEFAULT_HEALTH),
      safeQuery(() => queryRevenueMetrics(workspaceId, todayStart, yesterdayStart, now, targetCurrency, filterDest), defaultRevenue),
      safeQuery(() => queryEventBreakdown(workspaceId, todayStart, yesterdayStart, now, filterDest), DEFAULT_EVENT_BREAKDOWN),
      safeQuery(() => queryBillingUsage(userId), DEFAULT_BILLING),
      safeQuery(() => queryConversionAccuracy(workspaceId, filterDest), DEFAULT_CONVERSION_ACCURACY),
      safeQuery(() => queryCampaignPerformance(workspaceId, targetCurrency, filterDest), [] as CampaignRow[]),
      safeQuery(() => queryDestinationDelivery(workspaceId, since24h), [] as DestinationDeliveryRow[]),
      enabledDestsQuery,
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
    conversionAccuracy,
    campaigns,
    destinationDelivery,
    currency: targetCurrency,
    enabledDestinations: enabledDests.map((d) => d.destination),
  };
}

// Export for testing
export { getHealthStatus, getTimeWindows, getCanonicalDestination };
