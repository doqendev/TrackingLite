import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { db } from "@/lib/db";
import { evaluateAlerts, shouldSendAlert, sendAndLogAlert } from "@/lib/alerts";
import { createLogger } from "@/lib/logger";

const ALERT_QUEUE_NAME = "alert-checks";
const ALERT_JOB_NAME = "run-alert-checks";

const log = createLogger({ component: "alert-checker" });

let _alertConnection: IORedis | null = null;

function getAlertConnection(): IORedis {
  if (!_alertConnection) {
    _alertConnection = new IORedis(
      process.env.REDIS_URL ?? "redis://localhost:6379",
      {
        maxRetriesPerRequest: null,
        lazyConnect: true,
      }
    );
  }
  return _alertConnection;
}

let _alertQueue: Queue | null = null;

function getAlertQueue(): Queue {
  if (!_alertQueue) {
    _alertQueue = new Queue(ALERT_QUEUE_NAME, {
      connection: getAlertConnection() as never,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
  }
  return _alertQueue;
}

async function runAlertChecks(): Promise<void> {
  log.info("Starting alert evaluation run");

  // Find all users who have at least one active workspace
  const usersWithWorkspaces = await db.user.findMany({
    where: {
      workspaces: {
        some: { isActive: true },
      },
    },
    select: {
      id: true,
      email: true,
    },
  });

  log.info("Evaluating alerts for users", { count: usersWithWorkspaces.length });

  let totalSent = 0;

  for (const user of usersWithWorkspaces) {
    try {
      const alerts = await evaluateAlerts(user.id);

      for (const alert of alerts) {
        try {
          const send = await shouldSendAlert(user.id, alert.alertType);
          if (!send) continue;

          await sendAndLogAlert(user.email, alert);
          totalSent++;
          log.info("Sent alert", { alertType: alert.alertType, workspaceName: alert.workspaceName });
        } catch (alertErr) {
          log.error("Failed to send alert", {
            alertType: alert.alertType,
            userId: user.id,
            error: alertErr instanceof Error ? alertErr.message : String(alertErr),
          });
        }
      }
    } catch (userErr) {
      log.error("Failed to evaluate alerts for user", {
        userId: user.id,
        error: userErr instanceof Error ? userErr.message : String(userErr),
      });
    }
  }

  // Check queue depths for all destination queues
  const QUEUE_DEPTH_THRESHOLD = 1000;
  const destinationQueues = ["meta-events", "tiktok-events", "ga4-events", "klaviyo-events", "reddit-events", "pinterest-events"];

  for (const queueName of destinationQueues) {
    try {
      const queue = new Queue(queueName, { connection: getAlertConnection() as never });
      const waiting = await queue.getWaitingCount();
      const delayed = await queue.getDelayedCount();
      const total = waiting + delayed;

      if (total > QUEUE_DEPTH_THRESHOLD) {
        log.warn("Queue depth exceeds threshold", {
          queue: queueName,
          waiting,
          delayed,
          total,
          threshold: QUEUE_DEPTH_THRESHOLD,
        });
      }

      await queue.close();
    } catch (err) {
      log.error("Failed to check queue depth", {
        queue: queueName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  log.info("Alert run complete", { totalSent });
}

// Register the repeatable job on the queue
export async function scheduleAlertChecks(): Promise<void> {
  const queue = getAlertQueue();

  // Remove any existing repeatable jobs with this name to avoid duplicates
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === ALERT_JOB_NAME) {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  await queue.add(
    ALERT_JOB_NAME,
    {},
    {
      repeat: { pattern: "0 * * * *" }, // every hour on the hour
    }
  );

  log.info("Repeatable alert-check job scheduled", { interval: "hourly" });
}

// BullMQ worker that processes alert-check jobs
export const alertWorker = new Worker(
  ALERT_QUEUE_NAME,
  async () => {
    await runAlertChecks();
  },
  {
    connection: getAlertConnection() as never,
    concurrency: 1,
  }
);

alertWorker.on("completed", () => {
  log.info("Alert check job completed");
});

alertWorker.on("failed", (_job, err) => {
  log.error("Alert check job failed", { error: err instanceof Error ? err.message : String(err) });
});

alertWorker.on("error", (err) => {
  log.error("Worker error", { error: err.message });
});
