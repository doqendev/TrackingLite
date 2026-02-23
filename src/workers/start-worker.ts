import "dotenv/config";
import * as Sentry from "@sentry/node";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? "development",
  });
}

import { validateEnv } from "@/lib/env-validation";

// Validate early — log the exact error so Railway logs show what's missing
try {
  validateEnv("worker");
} catch (err) {
  // logger.ts uses only console.error/console.log internally, safe to inline here
  // before the dynamic imports below so Railway logs capture the failure reason
  process.stderr.write(
    JSON.stringify({
      level: "error",
      component: "worker-startup",
      msg: "Worker startup failed: environment validation",
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    }) + "\n"
  );
  process.exit(1);
}

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
import { createServer } from "http";

const log = createLogger({ component: "worker-main" });

process.on("uncaughtException", (err) => {
  log.error("Uncaught exception", { error: err.message, stack: err.stack });
  Sentry.captureException(err);
});

process.on("unhandledRejection", (reason) => {
  log.error("Unhandled rejection", { error: String(reason) });
  Sentry.captureException(reason);
});

const workers = [metaWorker, tiktokWorker, ga4Worker, klaviyoWorker, redditWorker, pinterestWorker, alertWorker, staleRequeueWorker, cleanupWorker];

log.info("Starting event processors", { workerCount: workers.length, pid: process.pid });
log.info("Redis configured", { redisUrl: (process.env.REDIS_URL ?? "redis://localhost:6379").replace(/\/\/.*@/, "//***@") });
log.info("Listening for jobs", { queues: ["meta-events", "tiktok-events", "ga4-events", "klaviyo-events", "reddit-events", "pinterest-events", "alert-checks", "stale-pending-requeue", "event-log-cleanup"] });

// Minimal HTTP health check for Railway
const healthPort = parseInt(process.env.WORKER_HEALTH_PORT || "8080", 10);
const healthServer = createServer((req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", workers: workers.length, uptime: process.uptime() }));
  } else {
    res.writeHead(404);
    res.end();
  }
});
healthServer.listen(healthPort, () => {
  log.info("Worker health check listening", { port: healthPort });
});

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
  const timeout = setTimeout(() => {
    log.error("Shutdown timed out after 30s, forcing exit");
    process.exit(1);
  }, 30000);
  try {
    healthServer.close();
    await Promise.all(workers.map(w => w.close()));
    log.info("All workers stopped");
  } catch (err) {
    log.error("Error during shutdown", { error: err instanceof Error ? err.message : String(err) });
  }
  clearTimeout(timeout);
  await Sentry.flush(2000).catch(() => null);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
