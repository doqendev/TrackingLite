-- Forward-only catch-up for schema changes that existed in the Prisma model
-- but were missing from the committed migration history.

ALTER TYPE "Destination" ADD VALUE IF NOT EXISTS 'GOOGLE_ADS';
ALTER TYPE "EventName" ADD VALUE IF NOT EXISTS 'Refund';

ALTER TABLE "EventLog"
  ADD COLUMN IF NOT EXISTS "refundAmount" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "refundId" TEXT;

ALTER TABLE "Workspace"
  ADD COLUMN IF NOT EXISTS "enableGoogleAds" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "googleAdsConversionId" TEXT,
  ADD COLUMN IF NOT EXISTS "googleAdsLabelAddToCart" TEXT,
  ADD COLUMN IF NOT EXISTS "googleAdsLabelInitiateCheckout" TEXT,
  ADD COLUMN IF NOT EXISTS "googleAdsLabelPurchase" TEXT,
  ADD COLUMN IF NOT EXISTS "googleAdsLabelViewContent" TEXT,
  ADD COLUMN IF NOT EXISTS "shopifyWebhookSecretEncrypted" TEXT,
  ADD COLUMN IF NOT EXISTS "shopifyWebhookSecretIv" TEXT,
  ADD COLUMN IF NOT EXISTS "shopifyWebhookSecretTag" TEXT;

CREATE TABLE IF NOT EXISTS "WebhookDeadLetter" (
  "id" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "shopDomain" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "headers" TEXT,
  "error" TEXT NOT NULL,
  "requestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retries" INTEGER NOT NULL DEFAULT 0,
  "resolvedAt" TIMESTAMP(3),

  CONSTRAINT "WebhookDeadLetter_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WebhookDeadLetter_shopDomain_idx"
  ON "WebhookDeadLetter"("shopDomain");
CREATE INDEX IF NOT EXISTS "WebhookDeadLetter_createdAt_idx"
  ON "WebhookDeadLetter"("createdAt");
CREATE INDEX IF NOT EXISTS "WebhookDeadLetter_resolvedAt_idx"
  ON "WebhookDeadLetter"("resolvedAt");
