CREATE INDEX CONCURRENTLY IF NOT EXISTS "EventLog_workspaceId_orderName_idx"
  ON "EventLog"("workspaceId", "orderName");
