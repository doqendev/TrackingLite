-- Add optional per-workspace custom ingest domain support.
-- Existing workspaces continue using the default TrackClear ingest endpoint
-- until a custom domain is saved and verified.

ALTER TABLE "Workspace"
ADD COLUMN "customIngestDomain" TEXT,
ADD COLUMN "customIngestDomainVerifiedAt" TIMESTAMP(3),
ADD COLUMN "customIngestDomainLastCheckedAt" TIMESTAMP(3),
ADD COLUMN "customIngestDomainLastError" TEXT;

CREATE UNIQUE INDEX "Workspace_customIngestDomain_key" ON "Workspace"("customIngestDomain");
