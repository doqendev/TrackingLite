import { utcTimestamp } from "@/lib/sql-timestamp";
import { Destination, EventName, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getExchangeRate } from "@/lib/currency";
import type { RevenueMetrics, EventBreakdown, CampaignRow } from "@/types/app";

import { logicalEventsSql, reportingScope } from "@/lib/logical-events-sql";
export { logicalEventsSql } from "@/lib/logical-events-sql";

type CommerceGroup = { eventName: EventName; today: boolean; currency: string | null;
  paymentGateway: string | null; source: string | null; status: string; total: number; value: number | null };

export async function queryLogicalCommerce(workspaceId: string, today: Date, yesterday: Date, now: Date,
  displayCurrency: string, allowed?: readonly Destination[]): Promise<{ revenue: RevenueMetrics; eventBreakdown: EventBreakdown }> {
  const rows = await db.$queryRaw<CommerceGroup[]>(Prisma.sql`
    ${logicalEventsSql(workspaceId, yesterday, now, allowed)}
    SELECT "eventName", ("createdAt" >= ${utcTimestamp(today)}) AS today, currency, "paymentGateway", source, status,
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
  const since = new Date(now.getTime() - 30 * 86400000);
  const scope = reportingScope(allowed);
  const rows = await db.$queryRaw<Array<{ utmSource: string; utmCampaign: string | null; currency: string | null; events: number; revenue: number | null }>>(Prisma.sql`
    ${logicalEventsSql(workspaceId, since, now, allowed, scope)}
    SELECT "utmSource", "utmCampaign", currency, COUNT(*)::int AS events,
      SUM(CASE WHEN "eventName" = 'Purchase' THEN COALESCE(value, 0) ELSE 0 END)::float8 AS revenue
    FROM logical WHERE "utmSource" IS NOT NULL GROUP BY "utmSource", "utmCampaign", currency
    UNION ALL
    SELECT r."utmSource", r."utmCampaign", r.currency, SUM(r.events)::int,
      SUM(CASE WHEN r."eventName" = 'Purchase' THEN r.value ELSE 0 END)::float8
    FROM "EventDailySummary" s CROSS JOIN LATERAL jsonb_to_recordset(s.logical)
      AS r("eventName" text, "utmSource" text, "utmCampaign" text, currency text, events int, value float8)
    WHERE s."workspaceId" = ${workspaceId} AND s.scope = ${scope}
      AND s.day >= ${utcTimestamp(since)} AND s.day + interval '1 day' <= ${utcTimestamp(now)} AND r."utmSource" IS NOT NULL
    GROUP BY r."utmSource", r."utmCampaign", r.currency
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
