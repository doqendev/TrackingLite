import { Prisma } from "@prisma/client";

export const REQUIRED_TRACKING_MIGRATIONS = [
  "20260727_add_shopify_webhook_inbox",
  "20260727_add_shopify_webhook_inbox_idx01_status_next_retry",
  "20260727_add_shopify_webhook_inbox_idx02_status_last_attempt",
  "20260727_add_shopify_webhook_inbox_idx03_workspace_order_id",
  "20260727_add_shopify_webhook_inbox_idx04_workspace_order_name",
  "20260727_add_shopify_webhook_inbox_idx05_workspace_checkout_token",
  "20260727_add_shopify_webhook_inbox_idx06_workspace_cart_token",
  "20260727_add_shopify_webhook_inbox_idx07_delivery_claim_token",
  "20260727_schema_history_catch_up",
  "20260727_schema_history_catch_up_drop_plaintext_secret",
  "20260727_schema_history_catch_up_idx01_workspace_refund_id",
  "20260730_add_internal_analytics_destination",
] as const;

export const REQUIRED_TRACKING_INDEXES = [
  "EventLog_status_nextRetryAt_idx",
  "EventLog_status_lastAttemptAt_idx",
  "EventLog_workspaceId_orderId_idx",
  "EventLog_workspaceId_orderName_idx",
  "EventLog_workspaceId_checkoutToken_idx",
  "EventLog_workspaceId_cartToken_idx",
  "EventLog_deliveryClaimToken_idx",
  "EventLog_workspaceId_refundId_idx",
  "ShopifyWebhookInbox_workspaceId_deliveryId_key",
  "ShopifyWebhookInbox_status_nextAttemptAt_idx",
  "ShopifyWebhookInbox_workspaceId_createdAt_idx",
] as const;

type MigrationState = {
  migrationName: string;
  finishedAt: Date | null;
  rolledBackAt: Date | null;
};

type IndexState = {
  indexName: string;
  isValid: boolean;
  isReady: boolean;
};

export interface DeploymentSchemaClient {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
}

export async function assertTrackingDeploymentSchemaReady(
  client: DeploymentSchemaClient
): Promise<void> {
  let migrations: MigrationState[];
  try {
    migrations = await client.$queryRaw<MigrationState[]>(Prisma.sql`
      SELECT
        "migration_name" AS "migrationName",
        "finished_at" AS "finishedAt",
        "rolled_back_at" AS "rolledBackAt"
      FROM "_prisma_migrations"
      WHERE "migration_name" IN (${Prisma.join(REQUIRED_TRACKING_MIGRATIONS)})
    `);
  } catch {
    throw new Error("Tracking deployment schema query failed");
  }
  const migrationsByName = new Map(
    migrations.map((migration) => [migration.migrationName, migration])
  );
  const unavailableMigrations = REQUIRED_TRACKING_MIGRATIONS.filter((name) => {
    const migration = migrationsByName.get(name);
    return !migration?.finishedAt || migration.rolledBackAt !== null;
  });

  let indexes: IndexState[];
  try {
    indexes = await client.$queryRaw<IndexState[]>(Prisma.sql`
      SELECT
        index_class.relname AS "indexName",
        index_state.indisvalid AS "isValid",
        index_state.indisready AS "isReady"
      FROM pg_index AS index_state
      JOIN pg_class AS index_class
        ON index_class.oid = index_state.indexrelid
      JOIN pg_class AS table_class
        ON table_class.oid = index_state.indrelid
      JOIN pg_namespace AS namespace
        ON namespace.oid = table_class.relnamespace
      WHERE namespace.nspname = current_schema()
        AND index_class.relname IN (${Prisma.join(REQUIRED_TRACKING_INDEXES)})
    `);
  } catch {
    throw new Error("Tracking deployment schema query failed");
  }
  const indexesByName = new Map(
    indexes.map((index) => [index.indexName, index])
  );
  const unavailableIndexes = REQUIRED_TRACKING_INDEXES.filter((name) => {
    const index = indexesByName.get(name);
    return !index?.isValid || !index.isReady;
  });

  if (unavailableMigrations.length > 0 || unavailableIndexes.length > 0) {
    throw new Error(
      `Tracking deployment schema is not ready (${unavailableMigrations.length} migrations, ${unavailableIndexes.length} indexes unavailable)`
    );
  }
}
