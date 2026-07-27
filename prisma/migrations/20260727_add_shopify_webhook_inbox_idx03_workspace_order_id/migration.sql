CREATE INDEX CONCURRENTLY IF NOT EXISTS "EventLog_workspaceId_orderId_idx"
  ON "EventLog"("workspaceId", "orderId");
