import "dotenv/config";
import { validateEnv } from "@/lib/env-validation";

validateEnv();

import { worker as metaWorker } from "./meta-event-processor";
import { redditWorker } from "./reddit-event-processor";
import { pinterestWorker } from "./pinterest-event-processor";
import { tiktokWorker } from "./tiktok-event-processor";
import { ga4Worker } from "./ga4-event-processor";
import { klaviyoWorker } from "./klaviyo-event-processor";
import { alertWorker, scheduleAlertChecks } from "./alert-checker";
import { staleRequeueWorker, scheduleStaleRequeue } from "./stale-pending-requeue";
import { cleanupWorker, scheduleEventLogCleanup } from "./event-log-cleanup";
import { createLogger } from "@/lib/logger";

const log = createLogger({ component: "worker-main" });

process.on("uncaughtException", (err) => {
  log.error("Uncaught exception", { error: err.message });
});

process.on("unhandledRejection", (reason) => {
  log.error("Unhandled rejection", { error: String(reason) });
});

const workers = [metaWorker, tiktokWorker, ga4Worker, klaviyoWorker, redditWorker, pinterestWorker, alertWorker, staleRequeueWorker, cleanupWorker];

log.info("Starting event processors");
log.info("Redis configured", { redisUrl: (process.env.REDIS_URL ?? "redis://localhost:6379").replace(/\/\/.*@/, "//***@") });
log.info("Listening for jobs", { queues: ["meta-events", "tiktok-events", "ga4-events", "klaviyo-events", "reddit-events", "pinterest-events", "alert-checks", "stale-pending-requeue", "event-log-cleanup"] });

// Schedule the hourly alert-check repeatable job
scheduleAlertChecks().catch((err) => {
  log.error("Failed to schedule alert checks", { error: err instanceof Error ? err.message : String(err) });
});

// Schedule the stale-pending requeue job (every 5 minutes)
scheduleStaleRequeue().catch((err) => {
  log.error("Failed to schedule stale requeue", { error: err instanceof Error ? err.message : String(err) });
});

// Schedule the event-log cleanup job (hourly)
scheduleEventLogCleanup().catch((err) => {
  log.error("Failed to schedule event log cleanup", { error: err instanceof Error ? err.message : String(err) });
});

// Graceful shutdown
async function shutdown(signal: string) {
  log.info("Received signal, shutting down", { signal });
  await Promise.all(workers.map(w => w.close()));
  log.info("All workers stopped");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
