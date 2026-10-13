import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { db } from "@/lib/db";
import { refreshEventSummaries, compactEventDetails, pruneExpiredDeliveryIdentities } from "@/lib/event-retention";
import { createLogger } from "@/lib/logger";
import {
  cleanupTerminalShopifyWebhookInboxes,
  expireStaleShopifyWebhookInboxes,
} from "@/lib/shopify-webhook-inbox";
import { WORKER_LOCK_DURATION_MS, WORKER_MAX_STALLED_COUNT, WORKER_STALLED_INTERVAL_MS } from "./worker-options";

const QUEUE_NAME = "event-log-cleanup";
const JOB_NAME = "run-event-log-cleanup";

const log = createLogger({ component: "cleanup" });

let _connection: IORedis | null = null;

function getConnection(): IORedis {
  if (!_connection) {
    _connection = new IORedis(
      process.env.REDIS_URL ?? "redis://localhost:6379",
      {
        maxRetriesPerRequest: null,
        lazyConnect: true,
      }
    );
    _connection.on("error", (err) => {
      log.error("Worker Redis connection error", { error: err, queue: QUEUE_NAME });
    });
  }
  return _connection;
}

let _queue: Queue | null = null;

function getQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, {
      connection: getConnection() as never,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
  }
  return _queue;
}

export async function runEventLogCleanup(): Promise<void> {
  log.info("Starting event log retention cleanup");

  // Step 0: Encrypted retry envelopes intentionally outlive the 48h display-PII
  // window for recovery, but must be erased as soon as their 72h TTL expires.
  const retryEnvelopeCutoff = new Date();
  const expiredRetryEnvelopes = await db.eventLog.updateMany({
    where: {
      retryPayloadExpiresAt: { lte: retryEnvelopeCutoff },
      retryPayloadEncrypted: { not: null },
    },
    data: {
      retryPayloadEncrypted: null,
      retryPayloadIv: null,
      retryPayloadTag: null,
      retryPayloadExpiresAt: null,
    },
  });
  if (expiredRetryEnvelopes.count > 0) {
    log.info("Cleared expired encrypted retry envelopes", {
      count: expiredRetryEnvelopes.count,
    });
  }

  const expiredWebhookInboxes = await expireStaleShopifyWebhookInboxes();
  if (expiredWebhookInboxes > 0) {
    log.error("Expired unprocessed Shopify webhook inbox payloads", {
      count: expiredWebhookInboxes,
      recoveryDays: 30,
    });
  }

  const deletedWebhookInboxes = await cleanupTerminalShopifyWebhookInboxes();
  if (deletedWebhookInboxes > 0) {
    log.info("Deleted processed Shopify webhook inbox receipts", {
      count: deletedWebhookInboxes,
      retentionDays: 30,
    });
  }

  // Step 1: Anonymize PII (IP + user agent) on events older than 48 hours
  const piiCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const anonymized = await db.eventLog.updateMany({
    where: {
      createdAt: { lt: piiCutoff },
      OR: [
        { customerIp: { not: null } },
        { userAgent: { not: null } },
      ],
    },
    data: {
      customerIp: null,
      userAgent: null,
    },
  });
  if (anonymized.count > 0) {
    log.info("Anonymized PII on old events", { count: anonymized.count, cutoffHours: 48 });
  }

  // Reporting must succeed before detailed data is compacted. Recovery, consent,
  // and billing identity have independent lifetimes and never follow plan expiry.
  const now = new Date();
  await refreshEventSummaries(now);
  const compacted = await compactEventDetails(now);
  const deleted = await pruneExpiredDeliveryIdentities(now);
  log.info("Cleanup run complete", { compacted, totalDeleted: deleted });
}

// Register the repeatable job on the queue
export async function scheduleEventLogCleanup(): Promise<void> {
  const queue = getQueue();

  // Remove any existing repeatable jobs with this name to avoid duplicates
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === JOB_NAME) {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  await queue.add(
    JOB_NAME,
    {},
    {
      repeat: { pattern: "0 * * * *" }, // every hour on the hour
    }
  );

  log.info("Repeatable event-log-cleanup job scheduled", { interval: "hourly" });
}

// BullMQ worker that processes event-log-cleanup jobs
export const cleanupWorker = new Worker(
  QUEUE_NAME,
  async () => {
    await runEventLogCleanup();
  },
  {
    connection: getConnection() as never,
    autorun: false,
    concurrency: 1,
    lockDuration: WORKER_LOCK_DURATION_MS,
    stalledInterval: WORKER_STALLED_INTERVAL_MS,
    maxStalledCount: WORKER_MAX_STALLED_COUNT,
  }
);

cleanupWorker.on("completed", () => {
  log.info("Event log cleanup job completed");
});

cleanupWorker.on("failed", (job, err) => {
  log.error("Event log cleanup job failed", {
    queue: QUEUE_NAME,
    jobId: job?.id,
    jobName: job?.name,
    attemptsMade: job?.attemptsMade,
    attempts: job?.opts?.attempts,
    error: err,
  });
});

cleanupWorker.on("error", (err) => {
  log.error("Worker error", { error: err, queue: QUEUE_NAME });
});

cleanupWorker.on("stalled", (jobId) => {
  log.warn("Job stalled", { queue: QUEUE_NAME, jobId });
});
