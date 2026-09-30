ALTER TABLE "Workspace"
  ADD COLUMN "openaiPixelId" TEXT,
  ADD COLUMN "openaiApiKeyEncrypted" TEXT,
  ADD COLUMN "openaiApiKeyIv" TEXT,
  ADD COLUMN "openaiApiKeyTag" TEXT,
  ADD COLUMN "enableOpenAI" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "EventLog"
  ADD COLUMN "occurredAt" TIMESTAMP(3),
  ADD COLUMN "deliveryTargetId" TEXT;
