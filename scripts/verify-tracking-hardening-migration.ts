import { PrismaClient } from "@prisma/client";

type IndexAuditRow = {
  indexName: string;
  schemaName: string;
  tableName: string;
  isValid: boolean;
  isReady: boolean;
  isUnique: boolean;
  columns: string[];
};

type RehearsalCountsRow = {
  userCount: number;
  workspaceCount: number;
  eventCount: number;
  purchaseCount: number;
  failedCount: number;
  webhookPurchaseCount: number;
  inboxCount: number;
};

type RehearsalBackfillRow = {
  orderNameCount: number;
  checkoutTokenCount: number;
  cartTokenCount: number;
  orderNameMismatches: number;
  checkoutTokenMismatches: number;
  cartTokenMismatches: number;
  nonPurchaseAliases: number;
  failedRowsScheduled: number;
};

type RehearsalWorkspaceRow = {
  id: string;
  webhookVerified: boolean;
  verificationMatchesLatestWebhook: boolean;
  lastReceivedMatchesLatestWebhook: boolean;
  metaBrowserTrackingEnabled: boolean;
  tiktokBrowserTrackingEnabled: boolean;
};

const expected = new Map<
  string,
  { tableName: string; columns: string[]; isUnique: boolean }
>([
  ["EventLog_status_nextRetryAt_idx", { tableName: "EventLog", columns: ["status", "nextRetryAt"], isUnique: false }],
  ["EventLog_status_lastAttemptAt_idx", { tableName: "EventLog", columns: ["status", "lastAttemptAt"], isUnique: false }],
  ["EventLog_workspaceId_orderId_idx", { tableName: "EventLog", columns: ["workspaceId", "orderId"], isUnique: false }],
  ["EventLog_workspaceId_orderName_idx", { tableName: "EventLog", columns: ["workspaceId", "orderName"], isUnique: false }],
  ["EventLog_workspaceId_checkoutToken_idx", { tableName: "EventLog", columns: ["workspaceId", "checkoutToken"], isUnique: false }],
  ["EventLog_workspaceId_cartToken_idx", { tableName: "EventLog", columns: ["workspaceId", "cartToken"], isUnique: false }],
  ["EventLog_deliveryClaimToken_idx", { tableName: "EventLog", columns: ["deliveryClaimToken"], isUnique: false }],
  ["EventLog_workspaceId_refundId_idx", { tableName: "EventLog", columns: ["workspaceId", "refundId"], isUnique: false }],
  ["ShopifyWebhookInbox_workspaceId_deliveryId_key", { tableName: "ShopifyWebhookInbox", columns: ["workspaceId", "deliveryId"], isUnique: true }],
  ["ShopifyWebhookInbox_status_nextAttemptAt_idx", { tableName: "ShopifyWebhookInbox", columns: ["status", "nextAttemptAt"], isUnique: false }],
  ["ShopifyWebhookInbox_workspaceId_createdAt_idx", { tableName: "ShopifyWebhookInbox", columns: ["workspaceId", "createdAt"], isUnique: false }],
]);

const prisma = new PrismaClient();

function expectCount(
  errors: string[],
  label: string,
  actual: number,
  expectedCount: number
): void {
  if (actual !== expectedCount) {
    errors.push(`${label}: expected ${expectedCount}, found ${actual}`);
  }
}

async function verifyPopulatedRehearsal(errors: string[]): Promise<void> {
  const [counts] = await prisma.$queryRaw<RehearsalCountsRow[]>`
    SELECT
      (SELECT COUNT(*)::integer FROM "User") AS "userCount",
      (SELECT COUNT(*)::integer FROM "Workspace") AS "workspaceCount",
      (SELECT COUNT(*)::integer FROM "EventLog") AS "eventCount",
      (
        SELECT COUNT(*)::integer
        FROM "EventLog"
        WHERE "eventName" = 'Purchase'
      ) AS "purchaseCount",
      (
        SELECT COUNT(*)::integer
        FROM "EventLog"
        WHERE "status" = 'FAILED'
      ) AS "failedCount",
      (
        SELECT COUNT(*)::integer
        FROM "EventLog"
        WHERE "eventName" = 'Purchase' AND "source" = 'webhook'
      ) AS "webhookPurchaseCount",
      (SELECT COUNT(*)::integer FROM "ShopifyWebhookInbox") AS "inboxCount"
  `;

  if (!counts) {
    errors.push("populated rehearsal counts: no result returned");
  } else {
    expectCount(errors, "users preserved", counts.userCount, 1);
    expectCount(errors, "workspaces preserved", counts.workspaceCount, 1);
    expectCount(errors, "EventLogs preserved", counts.eventCount, 20_000);
    expectCount(errors, "Purchases preserved", counts.purchaseCount, 5_000);
    expectCount(errors, "historical FAILED rows preserved", counts.failedCount, 200);
    expectCount(
      errors,
      "webhook Purchases preserved",
      counts.webhookPurchaseCount,
      100
    );
    expectCount(errors, "new inbox starts empty", counts.inboxCount, 0);
  }

  const [backfills] = await prisma.$queryRaw<RehearsalBackfillRow[]>`
    SELECT
      COUNT(*) FILTER (
        WHERE "eventName" = 'Purchase' AND "orderName" IS NOT NULL
      )::integer AS "orderNameCount",
      COUNT(*) FILTER (
        WHERE "eventName" = 'Purchase' AND "checkoutToken" IS NOT NULL
      )::integer AS "checkoutTokenCount",
      COUNT(*) FILTER (
        WHERE "eventName" = 'Purchase' AND "cartToken" IS NOT NULL
      )::integer AS "cartTokenCount",
      COUNT(*) FILTER (
        WHERE "eventName" = 'Purchase'
          AND "orderName" IS DISTINCT FROM COALESCE(
            "payload"->'customData'->>'orderName',
            "payload"->'customData'->>'order_name'
          )
      )::integer AS "orderNameMismatches",
      COUNT(*) FILTER (
        WHERE "eventName" = 'Purchase'
          AND "checkoutToken" IS DISTINCT FROM COALESCE(
            "payload"->'customData'->>'checkoutToken',
            "payload"->'customData'->>'checkout_token'
          )
      )::integer AS "checkoutTokenMismatches",
      COUNT(*) FILTER (
        WHERE "eventName" = 'Purchase'
          AND "cartToken" IS DISTINCT FROM COALESCE(
            "payload"->'customData'->>'cartToken',
            "payload"->'customData'->>'cart_token'
          )
      )::integer AS "cartTokenMismatches",
      COUNT(*) FILTER (
        WHERE "eventName" <> 'Purchase'
          AND ("orderName" IS NOT NULL OR "checkoutToken" IS NOT NULL OR "cartToken" IS NOT NULL)
      )::integer AS "nonPurchaseAliases",
      COUNT(*) FILTER (
        WHERE "status" = 'FAILED' AND "nextRetryAt" IS NOT NULL
      )::integer AS "failedRowsScheduled"
    FROM "EventLog"
  `;

  if (!backfills) {
    errors.push("populated rehearsal backfills: no result returned");
  } else {
    expectCount(errors, "orderName aliases backfilled", backfills.orderNameCount, 4_500);
    expectCount(
      errors,
      "checkoutToken aliases backfilled",
      backfills.checkoutTokenCount,
      4_500
    );
    expectCount(errors, "cartToken aliases backfilled", backfills.cartTokenCount, 4_500);
    expectCount(errors, "orderName backfill mismatches", backfills.orderNameMismatches, 0);
    expectCount(
      errors,
      "checkoutToken backfill mismatches",
      backfills.checkoutTokenMismatches,
      0
    );
    expectCount(errors, "cartToken backfill mismatches", backfills.cartTokenMismatches, 0);
    expectCount(errors, "non-Purchase aliases populated", backfills.nonPurchaseAliases, 0);
    expectCount(
      errors,
      "historical FAILED rows with nextRetryAt",
      backfills.failedRowsScheduled,
      0
    );
  }

  const [workspace] = await prisma.$queryRaw<RehearsalWorkspaceRow[]>`
    SELECT
      workspace."id",
      workspace."shopifyWebhookVerifiedAt" IS NOT NULL AS "webhookVerified",
      workspace."shopifyWebhookVerifiedAt" = latest."receivedAt"
        AS "verificationMatchesLatestWebhook",
      workspace."shopifyWebhookLastReceivedAt" = latest."receivedAt"
        AS "lastReceivedMatchesLatestWebhook",
      workspace."metaBrowserTrackingEnabled",
      workspace."tiktokBrowserTrackingEnabled"
    FROM "Workspace" AS workspace
    LEFT JOIN LATERAL (
      SELECT MAX("createdAt") AS "receivedAt"
      FROM "EventLog"
      WHERE "workspaceId" = workspace."id"
        AND "source" = 'webhook'
        AND "eventName" = 'Purchase'
    ) AS latest ON true
    WHERE workspace."id" = 'tracking-hardening-rehearsal-workspace'
  `;

  if (!workspace) {
    errors.push("rehearsal workspace: missing after migration");
  } else {
    if (!workspace.webhookVerified) {
      errors.push("rehearsal workspace: webhook was not marked verified");
    }
    if (!workspace.verificationMatchesLatestWebhook) {
      errors.push("rehearsal workspace: verifiedAt does not match latest webhook Purchase");
    }
    if (!workspace.lastReceivedMatchesLatestWebhook) {
      errors.push("rehearsal workspace: lastReceivedAt does not match latest webhook Purchase");
    }
    if (workspace.metaBrowserTrackingEnabled) {
      errors.push("rehearsal workspace: Meta browser tracking defaulted to true");
    }
    if (workspace.tiktokBrowserTrackingEnabled) {
      errors.push("rehearsal workspace: TikTok browser tracking defaulted to true");
    }
  }
}

async function main() {
  const rows = await prisma.$queryRaw<IndexAuditRow[]>`
    SELECT
      index_class.relname AS "indexName",
      namespace.nspname AS "schemaName",
      table_class.relname AS "tableName",
      index_state.indisvalid AS "isValid",
      index_state.indisready AS "isReady",
      index_state.indisunique AS "isUnique",
      array_agg(attribute.attname ORDER BY key_position.ordinality)::text[] AS "columns"
    FROM pg_index AS index_state
    JOIN pg_class AS index_class
      ON index_class.oid = index_state.indexrelid
    JOIN pg_class AS table_class
      ON table_class.oid = index_state.indrelid
    JOIN pg_namespace AS namespace
      ON namespace.oid = table_class.relnamespace
    CROSS JOIN LATERAL unnest(index_state.indkey)
      WITH ORDINALITY AS key_position(attnum, ordinality)
    JOIN pg_attribute AS attribute
      ON attribute.attrelid = table_class.oid
      AND attribute.attnum = key_position.attnum
    WHERE namespace.nspname = current_schema()
      AND index_class.relname = ANY(ARRAY[
        'EventLog_status_nextRetryAt_idx',
        'EventLog_status_lastAttemptAt_idx',
        'EventLog_workspaceId_orderId_idx',
        'EventLog_workspaceId_orderName_idx',
        'EventLog_workspaceId_checkoutToken_idx',
        'EventLog_workspaceId_cartToken_idx',
        'EventLog_deliveryClaimToken_idx',
        'EventLog_workspaceId_refundId_idx',
        'ShopifyWebhookInbox_workspaceId_deliveryId_key',
        'ShopifyWebhookInbox_status_nextAttemptAt_idx',
        'ShopifyWebhookInbox_workspaceId_createdAt_idx'
      ]::text[])
    GROUP BY
      index_class.relname,
      namespace.nspname,
      table_class.relname,
      index_state.indisvalid,
      index_state.indisready,
      index_state.indisunique
    ORDER BY index_class.relname
  `;

  const errors: string[] = [];
  const rowsByName = new Map(rows.map((row) => [row.indexName, row]));

  if (rows.length !== expected.size) {
    errors.push(`expected ${expected.size} indexes, found ${rows.length}`);
  }

  for (const [indexName, expectedIndex] of Array.from(expected.entries())) {
    const row = rowsByName.get(indexName);
    if (!row) {
      errors.push(`${indexName}: missing`);
      continue;
    }
    if (row.schemaName !== "public" || row.tableName !== expectedIndex.tableName) {
      errors.push(`${indexName}: attached to ${row.schemaName}.${row.tableName}`);
    }
    if (!row.isValid || !row.isReady) {
      errors.push(`${indexName}: valid=${row.isValid} ready=${row.isReady}`);
    }
    if (row.isUnique !== expectedIndex.isUnique) {
      errors.push(`${indexName}: expected unique=${expectedIndex.isUnique}, found ${row.isUnique}`);
    }
    if (JSON.stringify(row.columns) !== JSON.stringify(expectedIndex.columns)) {
      errors.push(
        `${indexName}: expected columns ${expectedIndex.columns.join(",")}, found ${row.columns.join(",")}`
      );
    }
  }

  const populatedRehearsal = process.env.TRACKING_HARDENING_REHEARSAL === "1";
  if (populatedRehearsal) {
    await verifyPopulatedRehearsal(errors);
  }

  if (errors.length > 0) {
    throw new Error(`Tracking hardening migration verification failed:\n- ${errors.join("\n- ")}`);
  }

  console.log(
    populatedRehearsal
      ? "Tracking hardening migration verified: 11/11 indexes plus populated backfills."
      : "Tracking hardening migration verified: 11/11 indexes valid and ready."
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
