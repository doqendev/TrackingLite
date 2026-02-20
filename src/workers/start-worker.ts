import "dotenv/config";
import { validateEnv } from "@/lib/env-validation";

validateEnv();

import { worker as metaWorker } from "./meta-event-processor";
import { googleWorker } from "./google-event-processor";
import { tiktokWorker } from "./tiktok-event-processor";
import { ga4Worker } from "./ga4-event-processor";
import { klaviyoWorker } from "./klaviyo-event-processor";
import { alertWorker, scheduleAlertChecks } from "./alert-checker";
import { staleRequeueWorker, scheduleStaleRequeue } from "./stale-pending-requeue";
import { cleanupWorker, scheduleEventLogCleanup } from "./event-log-cleanup";

process.on("uncaughtException", (err) => {
  console.error("[Worker] Uncaught exception:", err.message);
});

process.on("unhandledRejection", (reason) => {
  console.error("[Worker] Unhandled rejection:", reason);
});

const workers = [metaWorker, googleWorker, tiktokWorker, ga4Worker, klaviyoWorker, alertWorker, staleRequeueWorker, cleanupWorker];

console.log("[Worker] Starting event processors...");
console.log(`[Worker] Redis URL: ${process.env.REDIS_URL ?? "redis://localhost:6379"}`);
console.log("[Worker] Listening for jobs on queues: meta-events, google-events, tiktok-events, ga4-events, klaviyo-events, alert-checks, stale-pending-requeue, event-log-cleanup");

// Schedule the hourly alert-check repeatable job
scheduleAlertChecks().catch((err) => {
  console.error("[Worker] Failed to schedule alert checks:", err);
});

// Schedule the stale-pending requeue job (every 5 minutes)
scheduleStaleRequeue().catch((err) => {
  console.error("[Worker] Failed to schedule stale requeue:", err);
});

// Schedule the event-log cleanup job (hourly)
scheduleEventLogCleanup().catch((err) => {
  console.error("[Worker] Failed to schedule event log cleanup:", err);
});

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`[Worker] Received ${signal}, shutting down gracefully...`);
  await Promise.all(workers.map(w => w.close()));
  console.log("[Worker] All workers stopped.");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
