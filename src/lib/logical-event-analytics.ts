import { Destination, EventName, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getExchangeRate } from "@/lib/currency";
import type { RevenueMetrics, EventBreakdown, CampaignRow } from "@/types/app";

/** Elect one row per commerce event, independently of which platforms are enabled.
 * Purchase aliases converge browser/webhook IDs. INTERNAL already uses its own
 * privacy-minimized identity and is superseded when external delivery resumes.
 */
export function logicalEventsSql(workspaceId: string, since: Date, until: Date,
  allowed?: readonly Destination[]): Prisma.Sql {
  const destinations = allowed ? Array.from(new Set([...allowed, Destination.INTERNAL])) : Object.values(Destination);
  return Prisma.sql`WITH ranked AS (
    SELECT *, ROW_NUMBER() OVER (
      PARTITION BY "eventName", CASE WHEN "eventName" = 'Purchase' THEN
        COALESCE(NULLIF("orderName", ''), NULLIF("orderId", ''), NULLIF("checkoutToken", ''), NULLIF("cartToken", ''), "eventId")
        ELSE "eventId" END
      ORDER BY CASE WHEN source = 'webhook' THEN 0 ELSE 1 END,
        CASE WHEN status = 'SENT' THEN 0 WHEN status IN ('PENDING', 'RETRYING') THEN 1 ELSE 2 END,
        "createdAt", id
    ) AS rank
    FROM "EventLog"
    WHERE "workspaceId" = ${workspaceId} AND "createdAt" >= ${since} AND "createdAt" <= ${until}
      AND status <> 'SUPERSEDED' AND destination::text IN (${Prisma.join(destinations)})
  ), logical AS (SELECT * FROM ranked WHERE rank = 1)`;
}

type CommerceGroup = { eventName: EventName; today: boolean; currency: string | null;
  paymentGateway: string | null; source: string | null; status: string; total: number; value: number | null };

export async function queryLogicalCommerce(workspaceId: string, today: Date, yesterday: Date, now: Date,
  displayCurrency: string, allowed?: readonly Destination[]): Promise<{ revenue: RevenueMetrics; eventBreakdown: EventBreakdown }> {
  const rows = await db.$queryRaw<CommerceGroup[]>(Prisma.sql`
    ${logicalEventsSql(workspaceId, yesterday, now, allowed)}
    SELECT "eventName", ("createdAt" >= ${today}) AS today, currency, "paymentGateway", source, status,
      COUNT(*)::int AS total, SUM(value)::float8 AS value
    FROM logical GROUP BY "eventName", today, currency, "paymentGateway", source, status
  `);
  const rates = new Map<string, number>([[displayCurrency, 1]]);
  await Promise.all(Array.from(new Set(rows.map(row => row.currency).filter((c): c is string => !!c && c !== displayCurrency)))
    .map(async currency => rates.set(currency, await getExchangeRate(currency, displayCurrency))));
  const revenue: RevenueMetrics = {
    addToCartValue: { today: 0, yesterday: 0, currency: displayCurrency },
    checkoutValue: { today: 0, yesterday: 0, currency: displayCurrency },
    purchaseValue: { today: 0, yesterday: 0, currency: displayCurrency },
    ordersToday: 0, ordersYesterday: 0, webhookBreakdown: [],
  };
  const eventBreakdown = Object.fromEntries(Object.values(EventName).map(name => [name, { today: 0, yesterday: 0 }])) as unknown as EventBreakdown;
  const gateways = new Map<string, number>();
  for (const row of rows) {
    const period = row.today ? "today" : "yesterday";
    eventBreakdown[row.eventName][period] += row.total;
    // A store's sale exists even if one or all downstream APIs reject delivery.
    const metric = row.eventName === "AddToCart" ? revenue.addToCartValue
      : row.eventName === "InitiateCheckout" ? revenue.checkoutValue
      : row.eventName === "Purchase" ? revenue.purchaseValue : null;
    const value = (row.value ?? 0) * (rates.get(row.currency ?? displayCurrency) ?? 0);
    if (metric) metric[period] += value;
    if (row.eventName === "Purchase") {
      if (row.today) revenue.ordersToday += row.total; else revenue.ordersYesterday += row.total;
      if (row.today && row.source === "webhook" && row.paymentGateway) {
        gateways.set(row.paymentGateway, (gateways.get(row.paymentGateway) ?? 0) + value);
      }
    }
  }
  revenue.webhookBreakdown = Array.from(gateways).map(([gateway, value]) => ({ gateway, value })).sort((a, b) => b.value - a.value);
  return { revenue, eventBreakdown };
}

export async function queryLogicalCampaigns(workspaceId: string, currency: string,
  allowed?: readonly Destination[]): Promise<CampaignRow[]> {
  const now = new Date();
  const rows = await db.$queryRaw<Array<{ utmSource: string; utmCampaign: string | null; currency: string | null; events: number; revenue: number | null }>>(Prisma.sql`
    ${logicalEventsSql(workspaceId, new Date(now.getTime() - 30 * 86400000), now, allowed)}
    SELECT "utmSource", "utmCampaign", currency, COUNT(*)::int AS events,
      SUM(CASE WHEN "eventName" = 'Purchase' THEN COALESCE(value, 0) ELSE 0 END)::float8 AS revenue
    FROM logical WHERE "utmSource" IS NOT NULL GROUP BY "utmSource", "utmCampaign", currency
  `);
  const rates = new Map<string, number>([[currency, 1]]);
  await Promise.all(Array.from(new Set(rows.map(row => row.currency).filter((c): c is string => !!c && c !== currency)))
    .map(async c => rates.set(c, await getExchangeRate(c, currency))));
  const campaigns = new Map<string, CampaignRow>();
  for (const row of rows) {
    const key = `${row.utmSource}\0${row.utmCampaign}`;
    const result = campaigns.get(key) ?? { utmSource: row.utmSource, utmCampaign: row.utmCampaign ?? "", events: 0, revenue: 0 };
    result.events += row.events;
    result.revenue += (row.revenue ?? 0) * (rates.get(row.currency ?? currency) ?? 0);
    campaigns.set(key, result);
  }
  return Array.from(campaigns.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 30);
}
