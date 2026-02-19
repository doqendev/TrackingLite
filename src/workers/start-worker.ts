import "dotenv/config";
import { worker as metaWorker } from "./meta-event-processor";
import { googleWorker } from "./google-event-processor";
import { tiktokWorker } from "./tiktok-event-processor";
import { ga4Worker } from "./ga4-event-processor";
import { klaviyoWorker } from "./klaviyo-event-processor";
import { alertWorker, scheduleAlertChecks } from "./alert-checker";

const workers = [metaWorker, googleWorker, tiktokWorker, ga4Worker, klaviyoWorker, alertWorker];

console.log("[Worker] Starting event processors...");
console.log(`[Worker] Redis URL: ${process.env.REDIS_URL ?? "redis://localhost:6379"}`);
console.log("[Worker] Listening for jobs on queues: meta-events, google-events, tiktok-events, ga4-events, klaviyo-events, alert-checks");

// Schedule the hourly alert-check repeatable job
scheduleAlertChecks().catch((err) => {
  console.error("[Worker] Failed to schedule alert checks:", err);
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
