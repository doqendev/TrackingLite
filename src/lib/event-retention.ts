import { utcTimestamp } from "@/lib/sql-timestamp";
import { Destination, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logicalEventsSql, reportingScope } from "@/lib/logical-events-sql";
import { getAllowedDestinationsForWorkspace } from "@/lib/workspace-mode";
import { DAY_MS, DELIVERY_IDENTITY_RETENTION_DAYS, REPORTING_RETENTION_DAYS, detailedEventCutoff, utcDay } from "@/lib/event-retention-policy";

/** One atomic replacement per workspace: failed aggregation never erases history.
 * Receipts remain available to reconcile late webhook changes and rebuild summaries.
 */
export async function refreshEventSummaries(now = new Date()): Promise<void> {
  const since = new Date(utcDay(now).getTime() - (REPORTING_RETENTION_DAYS - 1) * DAY_MS);
  const until = utcDay(detailedEventCutoff(now));
  const workspaces = await db.workspace.findMany({ select: { id: true, productMode: true, installType: true } });
  for (const workspace of workspaces) {
    const allowed = getAllowedDestinationsForWorkspace(workspace);
    const scopes = new Map([
      [reportingScope(), undefined],
      [reportingScope(allowed), allowed],
    ]);
    await db.$transaction(async tx => {
      // Also serialize manual cleanup with the scheduled worker.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"event-summary:" + workspace.id}, 0))`;
      await tx.eventDailySummary.deleteMany({ where: { workspaceId: workspace.id } });
      for (const [scope, destinations] of Array.from(scopes)) {
        await tx.$executeRaw(Prisma.sql`
          ${logicalEventsSql(workspace.id, since, now, destinations)}
          , commerce AS (
            SELECT date_trunc('day', "createdAt")::date AS day, "eventName", currency,
              "utmSource", "utmCampaign", source, "paymentGateway", COUNT(*)::int AS events,
              SUM(COALESCE(value, 0))::float8 AS value
            FROM logical WHERE "createdAt" < ${utcTimestamp(until)}
            GROUP BY day, "eventName", currency, "utmSource", "utmCampaign", source, "paymentGateway"
          ), delivery AS (
            SELECT date_trunc('day', "createdAt")::date AS day, "eventName", destination, status, COUNT(*)::int AS events
            FROM "EventLog" WHERE "workspaceId" = ${workspace.id} AND "createdAt" >= ${utcTimestamp(since)} AND "createdAt" < ${utcTimestamp(until)}
              AND status <> 'SUPERSEDED' AND destination::text IN (${Prisma.join(destinations ?? Object.values(Destination))})
            GROUP BY day, "eventName", destination, status
          ), days AS (SELECT day FROM commerce UNION SELECT day FROM delivery)
          INSERT INTO "EventDailySummary" ("workspaceId", day, scope, logical, deliveries, "updatedAt")
          SELECT ${workspace.id}, days.day, ${scope},
            COALESCE((SELECT jsonb_agg(to_jsonb(c) - 'day') FROM commerce c WHERE c.day = days.day), '[]'::jsonb),
            COALESCE((SELECT jsonb_agg(to_jsonb(d) - 'day') FROM delivery d WHERE d.day = days.day), '[]'::jsonb), ${utcTimestamp(now)}
          FROM days
        `);
      }
    }, { timeout: 30_000, isolationLevel: "RepeatableRead" });
  }
}

/** Keep all identifiers/aliases, target binding, claims, billing and report fields.
 * In-flight/ambiguous/recoverable rows are never compacted or deleted.
 */
export async function compactEventDetails(now = new Date()): Promise<number> {
  let total = 0;
  for (;;) {
    const count = await db.$executeRaw(Prisma.sql`
      WITH batch AS (
        SELECT id FROM "EventLog" WHERE "createdAt" < ${utcTimestamp(detailedEventCutoff(now))}
          AND status IN ('SENT', 'SUPERSEDED', 'FAILED')
          AND "deliveryClaimToken" IS NULL AND "deliveryClaimOwner" IS NULL
          AND "nextRetryAt" IS NULL AND "retryPayloadEncrypted" IS NULL
          AND ("detailsCompactedAt" IS NULL OR payload IS NOT NULL OR "metaResponse" IS NOT NULL
            OR "pageUrl" IS NOT NULL OR fbp IS NOT NULL OR fbc IS NOT NULL)
        ORDER BY "createdAt", id LIMIT 500 FOR UPDATE SKIP LOCKED
      )
      UPDATE "EventLog" e SET payload = NULL, "metaResponse" = NULL, "customerIp" = NULL,
        "userAgent" = NULL, fbp = NULL, fbc = NULL, "pageUrl" = NULL,
        gclid = NULL, ttclid = NULL, "rdtCid" = NULL, epik = NULL,
        "utmMedium" = NULL, "utmContent" = NULL, "utmTerm" = NULL,
        "detailsCompactedAt" = ${utcTimestamp(now)}
      FROM batch WHERE e.id = batch.id
    `);
    total += count;
    if (count < 500) return total;
  }
}

export async function pruneExpiredDeliveryIdentities(now = new Date()): Promise<number> {
  let total = 0;
  for (;;) {
    const count = await db.$executeRaw(Prisma.sql`
      WITH batch AS (
        SELECT id FROM "EventLog" WHERE "createdAt" < ${utcTimestamp(new Date(now.getTime() - DELIVERY_IDENTITY_RETENTION_DAYS * DAY_MS))}
          AND "detailsCompactedAt" IS NOT NULL AND status IN ('SENT', 'SUPERSEDED', 'FAILED')
          AND "deliveryClaimToken" IS NULL AND "deliveryClaimOwner" IS NULL
          AND "nextRetryAt" IS NULL AND "retryPayloadEncrypted" IS NULL
        ORDER BY "createdAt", id LIMIT 500 FOR UPDATE SKIP LOCKED
      ) DELETE FROM "EventLog" e USING batch WHERE e.id = batch.id
    `);
    total += count;
    if (count < 500) return total;
  }
}
