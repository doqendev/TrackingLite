import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { db } from "@/lib/db";
import { BILLING_PLANS, BillingPlanKey } from "@/lib/constants";
import { createLogger } from "@/lib/logger";

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

async function runEventLogCleanup(): Promise<void> {
  log.info("Starting event log retention cleanup");

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

  // Step 2: Fetch workspaces with their owner's subscription plan
  const workspaces = await db.workspace.findMany({
    where: { isActive: true },
    select: {
      id: true,
      userId: true,
      user: {
        select: {
          subscription: {
            select: { plan: true },
          },
        },
      },
    },
  });

  log.info("Checking retention for workspaces", { count: workspaces.length });

  // Group workspace IDs by retention period (days)
  const retentionGroups = new Map<number, string[]>();

  for (const ws of workspaces) {
    const plan = (ws.user?.subscription?.plan ?? "FREE") as BillingPlanKey;
    const retentionDays = BILLING_PLANS[plan]?.eventLogRetentionDays ?? 7;

    if (!retentionGroups.has(retentionDays)) {
      retentionGroups.set(retentionDays, []);
    }
    retentionGroups.get(retentionDays)!.push(ws.id);
  }

  let totalDeleted = 0;

  // Step 3: Delete old events per retention period
  for (const [days, workspaceIds] of Array.from(retentionGroups)) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await db.eventLog.deleteMany({
      where: { workspaceId: { in: workspaceIds }, createdAt: { lt: cutoff } },
    });
    if (result.count > 0) {
      log.info("Deleted events for retention period", {
        count: result.count,
        workspaceCount: workspaceIds.length,
        retentionDays: days,
      });
    }
    totalDeleted += result.count;
  }

  log.info("Cleanup run complete", { totalDeleted });
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
    concurrency: 1,
  }
);

cleanupWorker.on("completed", () => {
  log.info("Event log cleanup job completed");
});

cleanupWorker.on("failed", (_job, err) => {
  log.error("Event log cleanup job failed", { error: err instanceof Error ? err.message : String(err) });
});

cleanupWorker.on("error", (err) => {
  log.error("Worker error", { error: err.message });
});
