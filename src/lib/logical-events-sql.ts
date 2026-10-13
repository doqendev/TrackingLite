import { utcTimestamp } from "@/lib/sql-timestamp";
import { Destination, Prisma } from "@prisma/client";

/** Stable scope keys let reports reuse summaries without mixing destination filters. */
export function reportingScope(allowed?: readonly Destination[]): string {
  return Array.from(new Set([...(allowed ?? Object.values(Destination)), Destination.INTERNAL])).sort().join(",");
}

/** Elect one row per commerce event, preserving the existing webhook/status ranking. */
export function logicalEventsSql(workspaceId: string, since: Date, until: Date,
  allowed?: readonly Destination[], excludeSummaryScope?: string): Prisma.Sql {
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
    FROM "EventLog" e
    WHERE "workspaceId" = ${workspaceId} AND "createdAt" >= ${utcTimestamp(since)} AND "createdAt" <= ${utcTimestamp(until)}
      AND status <> 'SUPERSEDED' AND destination::text IN (${Prisma.join(destinations)})
  ), logical AS (SELECT * FROM ranked e WHERE rank = 1
      ${excludeSummaryScope ? Prisma.sql`AND NOT EXISTS (
        SELECT 1 FROM "EventDailySummary" s WHERE s."workspaceId" = e."workspaceId"
          AND s.scope = ${excludeSummaryScope} AND s.day <= e."createdAt" AND e."createdAt" < s.day + interval '1 day'
          AND s.day >= ${utcTimestamp(since)} AND s.day + interval '1 day' <= ${utcTimestamp(until)}
      )` : Prisma.empty}
  )`;
}
