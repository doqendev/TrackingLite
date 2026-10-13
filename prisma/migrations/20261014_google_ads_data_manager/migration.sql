ALTER TABLE "Workspace"
  ADD COLUMN "googleAdsCustomerId" TEXT,
  ADD COLUMN "googleAdsLoginCustomerId" TEXT,
  ADD COLUMN "googleAdsConversionActionId" TEXT;

ALTER TABLE "EventLog"
  ADD COLUMN "gbraid" TEXT,
  ADD COLUMN "wbraid" TEXT,
  ADD COLUMN "destinationRequestId" TEXT,
  ADD COLUMN "destinationRequestStatus" TEXT,
  ADD COLUMN "destinationStatusCheckedAt" TIMESTAMP(3),
  ADD COLUMN "destinationStatusNextCheckAt" TIMESTAMP(3),
  ADD COLUMN "destinationStatusDetail" JSONB;
