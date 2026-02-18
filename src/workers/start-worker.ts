import "dotenv/config";
import { worker } from "./meta-event-processor";

console.log("[Worker] Starting Meta event processor...");
console.log(`[Worker] Redis URL: ${process.env.REDIS_URL ?? "redis://localhost:6379"}`);
console.log("[Worker] Listening for jobs on queue: meta-events");

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`[Worker] Received ${signal}, shutting down gracefully...`);
  await worker.close();
  console.log("[Worker] Worker stopped.");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
