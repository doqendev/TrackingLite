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

  // Single query: fetch all active workspaces with their owner's subscription plan
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

  console.log(`[Cleanup] Checking retention for ${workspaces.length} active workspace(s)...`);

  // Group workspace IDs by retention period
  const freeWorkspaceIds: string[] = [];
  const paidWorkspaceIds: string[] = [];

  for (const ws of workspaces) {
    const plan = ws.user?.subscription?.plan ?? "FREE";
    if (plan === "FREE") {
      freeWorkspaceIds.push(ws.id);
    } else {
      paidWorkspaceIds.push(ws.id);
    }
  }

  const freeCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const paidCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  let totalDeleted = 0;

  if (freeWorkspaceIds.length > 0) {
    const result = await db.eventLog.deleteMany({
      where: { workspaceId: { in: freeWorkspaceIds }, createdAt: { lt: freeCutoff } },
    });
    if (result.count > 0) {
      console.log(
        `[Cleanup] Deleted ${result.count} event(s) from ${freeWorkspaceIds.length} FREE workspace(s) (>7d old)`
      );
    }
    totalDeleted += result.count;
  }

  if (paidWorkspaceIds.length > 0) {
    const result = await db.eventLog.deleteMany({
      where: { workspaceId: { in: paidWorkspaceIds }, createdAt: { lt: paidCutoff } },
    });
    if (result.count > 0) {
      console.log(
        `[Cleanup] Deleted ${result.count} event(s) from ${paidWorkspaceIds.length} paid workspace(s) (>30d old)`
      );
    }
    totalDeleted += result.count;
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
