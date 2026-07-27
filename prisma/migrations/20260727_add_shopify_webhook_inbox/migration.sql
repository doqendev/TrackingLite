-- Lossless Shopify webhook capture. Verified deliveries are encrypted at rest
-- before acknowledgement, then replayed until downstream processing succeeds.

ALTER TYPE "EventStatus" ADD VALUE IF NOT EXISTS 'SUPERSEDED';

DO $$
BEGIN
  CREATE TYPE "ShopifyWebhookInboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- Keep reruns safe if a previous attempt created the enum before the migration
-- reached the terminal retention state.
ALTER TYPE "ShopifyWebhookInboxStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

ALTER TABLE "Workspace"
  ADD COLUMN IF NOT EXISTS "shopifyWebhookVerifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "shopifyWebhookLastReceivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "metaBrowserTrackingEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "tiktokBrowserTrackingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Existing source='webhook' Purchase rows are proof that the workspace secret
-- successfully verified a real Shopify delivery before this inbox existed.
-- Backfill them so proven stores do not temporarily re-enable browser Purchase.
UPDATE "Workspace" AS workspace
SET
  "shopifyWebhookVerifiedAt" = latest."receivedAt",
  "shopifyWebhookLastReceivedAt" = latest."receivedAt"
FROM (
  SELECT "workspaceId", MAX("createdAt") AS "receivedAt"
  FROM "EventLog"
  WHERE "source" = 'webhook' AND "eventName" = 'Purchase'
  GROUP BY "workspaceId"
) AS latest
WHERE workspace."id" = latest."workspaceId"
  AND workspace."shopifyWebhookVerifiedAt" IS NULL;

ALTER TABLE "EventLog"
  ADD COLUMN IF NOT EXISTS "retryPayloadEncrypted" TEXT,
  ADD COLUMN IF NOT EXISTS "retryPayloadIv" TEXT,
  ADD COLUMN IF NOT EXISTS "retryPayloadTag" TEXT,
  ADD COLUMN IF NOT EXISTS "retryPayloadExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "nextRetryAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deliveryClaimToken" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryClaimOwner" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryClaimedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deliveryClaimExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "orderName" TEXT,
  ADD COLUMN IF NOT EXISTS "checkoutToken" TEXT,
  ADD COLUMN IF NOT EXISTS "cartToken" TEXT;

-- EventLog is a hot production table. Each new EventLog index is deliberately
-- created by its own following single-statement Prisma migration so PostgreSQL
-- can execute CREATE INDEX CONCURRENTLY outside an implicit multi-statement
-- transaction.

-- Recover aliases from sanitized historical payloads when they are available.
UPDATE "EventLog"
SET
  "orderName" = COALESCE(
    "orderName",
    "payload"->'customData'->>'orderName',
    "payload"->'customData'->>'order_name'
  ),
  "checkoutToken" = COALESCE(
    "checkoutToken",
    "payload"->'customData'->>'checkoutToken',
    "payload"->'customData'->>'checkout_token'
  ),
  "cartToken" = COALESCE(
    "cartToken",
    "payload"->'customData'->>'cartToken',
    "payload"->'customData'->>'cart_token'
  )
WHERE "eventName" = 'Purchase'
  AND (
    (
      "orderName" IS NULL
      AND COALESCE(
        "payload"->'customData'->>'orderName',
        "payload"->'customData'->>'order_name'
      ) IS NOT NULL
    )
    OR (
      "checkoutToken" IS NULL
      AND COALESCE(
        "payload"->'customData'->>'checkoutToken',
        "payload"->'customData'->>'checkout_token'
      ) IS NOT NULL
    )
    OR (
      "cartToken" IS NULL
      AND COALESCE(
        "payload"->'customData'->>'cartToken',
        "payload"->'customData'->>'cart_token'
      ) IS NOT NULL
    )
  );

-- Historical FAILED rows are deliberately not rescheduled here. They may no
-- longer have a complete encrypted retry envelope, and replaying them during a
-- schema rollout could create stale or duplicate destination traffic. Runtime
-- retry scheduling applies only to failures created by the hardened release.

CREATE TABLE IF NOT EXISTS "ShopifyWebhookInbox" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "shopDomain" TEXT NOT NULL,
  "payloadEncrypted" TEXT,
  "payloadIv" TEXT,
  "payloadTag" TEXT,
  "occurredAt" TIMESTAMP(3),
  "status" "ShopifyWebhookInboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ShopifyWebhookInbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShopifyWebhookInbox_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShopifyWebhookInbox_workspaceId_deliveryId_key"
  ON "ShopifyWebhookInbox"("workspaceId", "deliveryId");
CREATE INDEX IF NOT EXISTS "ShopifyWebhookInbox_status_nextAttemptAt_idx"
  ON "ShopifyWebhookInbox"("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "ShopifyWebhookInbox_workspaceId_createdAt_idx"
  ON "ShopifyWebhookInbox"("workspaceId", "createdAt");
