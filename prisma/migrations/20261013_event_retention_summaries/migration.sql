ALTER TABLE "EventLog" ADD COLUMN "detailsCompactedAt" TIMESTAMP(3);

CREATE TABLE "EventDailySummary" (
  "workspaceId" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "scope" TEXT NOT NULL,
  "logical" JSONB NOT NULL,
  "deliveries" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventDailySummary_pkey" PRIMARY KEY ("workspaceId", "day", "scope"),
  CONSTRAINT "EventDailySummary_workspaceId_fkey" FOREIGN KEY ("workspaceId")
    REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "EventDailySummary_day_idx" ON "EventDailySummary"("day");
