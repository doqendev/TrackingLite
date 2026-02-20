import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { db } from "@/lib/db";

const QUEUE_NAME = "event-log-cleanup";
const JOB_NAME = "run-event-log-cleanup";

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
  console.log("[Cleanup] Starting event log retention cleanup...");

  // Get all active workspaces with their user's plan
  const workspaces = await db.workspace.findMany({
    where: { isActive: true },
    select: { id: true, userId: true },
  });

  console.log(`[Cleanup] Checking retention for ${workspaces.length} active workspace(s)...`);

  let totalDeleted = 0;

  for (const ws of workspaces) {
    try {
      const sub = await db.subscription.findUnique({
        where: { userId: ws.userId },
        select: { plan: true },
      });

      const plan = sub?.plan || "FREE";
      // FREE=7 days, paid=30 days
      const retentionDays = plan === "FREE" ? 7 : 30;
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      const deleted = await db.eventLog.deleteMany({
        where: {
          workspaceId: ws.id,
          createdAt: { lt: cutoff },
        },
      });

      if (deleted.count > 0) {
        console.log(
          `[Cleanup] Deleted ${deleted.count} events for workspace ${ws.id} (>${retentionDays}d old)`
        );
        totalDeleted += deleted.count;
      }
    } catch (err) {
      console.error(`[Cleanup] Failed to clean up events for workspace ${ws.id}:`, err);
    }
  }

  console.log(`[Cleanup] Run complete. ${totalDeleted} total event(s) deleted.`);
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

  console.log("[Cleanup] Repeatable event-log-cleanup job scheduled (hourly).");
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
  console.log("[Cleanup] Event log cleanup job completed.");
});

cleanupWorker.on("failed", (_job, err) => {
  console.error("[Cleanup] Event log cleanup job failed:", err);
});

cleanupWorker.on("error", (err) => {
  console.error("[Cleanup] Worker error:", err.message);
});
