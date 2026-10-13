CREATE INDEX CONCURRENTLY IF NOT EXISTS "EventLog_destination_request_status_idx"
  ON "EventLog"("destination", "destinationRequestStatus", "destinationStatusNextCheckAt");
