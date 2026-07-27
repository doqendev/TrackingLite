CREATE INDEX CONCURRENTLY IF NOT EXISTS "EventLog_status_lastAttemptAt_idx"
  ON "EventLog"("status", "lastAttemptAt");
