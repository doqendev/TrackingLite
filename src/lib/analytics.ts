import { queryLogicalCommerce, queryLogicalCampaigns } from "@/lib/logical-event-analytics";
import { db } from "@/lib/db";
import { Destination, EventName, EventStatus, Prisma } from "@prisma/client";
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

type DestinationWhere = Pick<Prisma.EventLogWhereInput, "destination">;

function externalDestFilter(
  destination?: Destination | null,
  allowedDestinations?: readonly Destination[]
): DestinationWhere {
  if (destination && destination !== Destination.INTERNAL) return { destination };
  if (allowedDestinations) {
    return { destination: { in: [...allowedDestinations] } };
  }
  return { destination: { not: Destination.INTERNAL } };
}

async function queryHealthMetrics(
  workspaceId: string,
  since24h: Date,
  df: DestinationWhere
): Promise<HealthMetrics> {
  const [totalEvents24h, sentEvents24h, failedEvents24h, lastEvent] =
    await Promise.all([
      db.eventLog.count({
        where: { workspaceId, status: { not: EventStatus.SUPERSEDED }, createdAt: { gte: since24h }, ...df },
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

async function queryConversionAccuracy(
  workspaceId: string,
  df: DestinationWhere
): Promise<ConversionAccuracy> {
  const now = new Date();
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [total7d, sent7d, failed7d, total30d, sent30d, failed30d] =
    await Promise.all([
      db.eventLog.count({
        where: { workspaceId, eventName: "Purchase", status: { not: EventStatus.SUPERSEDED }, createdAt: { gte: since7d }, ...df },
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
        where: { workspaceId, eventName: "Purchase", status: { not: EventStatus.SUPERSEDED }, createdAt: { gte: since30d }, ...df },
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

async function queryDestinationDelivery(
  workspaceId: string,
  since24h: Date,
  allowedDestinations?: readonly Destination[]
): Promise<DestinationDeliveryRow[]> {
  const groups = await db.eventLog.groupBy({
    by: ["destination", "status"],
    where: {
      workspaceId,
      createdAt: { gte: since24h },
      status: { not: EventStatus.SUPERSEDED },
      destination: allowedDestinations
        ? { in: [...allowedDestinations] }
        : { not: Destination.INTERNAL },
    },
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
  displayCurrency?: string,
  allowedDestinations?: readonly Destination[]
): Promise<DashboardAnalytics> {
  const { now, todayStart, yesterdayStart, since24h } = getTimeWindows();

  // Health measures all configured deliveries; commerce reports deduplicate events.
  const externalDf = externalDestFilter(null, allowedDestinations);

  const targetCurrency = displayCurrency || "USD";

  const defaultRevenue: RevenueMetrics = {
    ...DEFAULT_REVENUE,
    addToCartValue: { ...DEFAULT_REVENUE.addToCartValue, currency: targetCurrency },
    checkoutValue: { ...DEFAULT_REVENUE.checkoutValue, currency: targetCurrency },
    purchaseValue: { ...DEFAULT_REVENUE.purchaseValue, currency: targetCurrency },
  };

  // Run queries in sequential batches to stay within DB connection pool limits.
  // Pool size is 10; each batch keeps peak parallel connections under 8 to leave
  // headroom for layout/auth queries sharing the same pool. This prevents
  // connection pool exhaustion and OOM from 23+ queued queries.

  // Batch 1: Health + event breakdown + delivery + enabled dests (~8 peak connections)
  const [health, commerce, destinationDelivery, enabledDests] =
    await Promise.all([
      safeQuery(() => queryHealthMetrics(workspaceId, since24h, externalDf), DEFAULT_HEALTH),
      safeQuery(() => queryLogicalCommerce(workspaceId, todayStart, yesterdayStart, now, targetCurrency, allowedDestinations), { revenue: defaultRevenue, eventBreakdown: DEFAULT_EVENT_BREAKDOWN }),
      safeQuery(() => queryDestinationDelivery(workspaceId, since24h, allowedDestinations), [] as DestinationDeliveryRow[]),
      db.eventLog.groupBy({
        by: ["destination"],
        where: {
          workspaceId,
          destination: allowedDestinations
            ? { in: [...allowedDestinations] }
            : { not: Destination.INTERNAL },
        },
        _count: true,
      }).catch((error) => {
        console.error("Analytics query failed:", error);
        return [] as Array<{ destination: Destination; _count: number }>;
      }),
    ]);

  const { revenue, eventBreakdown } = commerce;

  // Batch 3: Conversion accuracy alone (~6 peak connections internally)
  const conversionAccuracy = await safeQuery(
    () => queryConversionAccuracy(workspaceId, externalDf),
    DEFAULT_CONVERSION_ACCURACY
  );

  // Batch 4: Lightweight remaining queries (~3 peak connections)
  const [billing, campaigns] = await Promise.all([
    safeQuery(() => queryBillingUsage(userId), DEFAULT_BILLING),
    safeQuery(() => queryLogicalCampaigns(workspaceId, targetCurrency, allowedDestinations), [] as CampaignRow[]),
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
export { getHealthStatus, getTimeWindows };
