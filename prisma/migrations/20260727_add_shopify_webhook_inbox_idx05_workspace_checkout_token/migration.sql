CREATE INDEX CONCURRENTLY IF NOT EXISTS "EventLog_workspaceId_checkoutToken_idx"
  ON "EventLog"("workspaceId", "checkoutToken");
