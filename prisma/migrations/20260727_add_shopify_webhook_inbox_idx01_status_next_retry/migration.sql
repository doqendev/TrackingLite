CREATE INDEX CONCURRENTLY IF NOT EXISTS "EventLog_status_nextRetryAt_idx"
  ON "EventLog"("status", "nextRetryAt");
