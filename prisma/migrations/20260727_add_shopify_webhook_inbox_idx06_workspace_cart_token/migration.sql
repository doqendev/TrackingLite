CREATE INDEX CONCURRENTLY IF NOT EXISTS "EventLog_workspaceId_cartToken_idx"
  ON "EventLog"("workspaceId", "cartToken");
