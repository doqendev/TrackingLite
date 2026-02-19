import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { db } from "@/lib/db";
import { evaluateAlerts, shouldSendAlert, sendAndLogAlert } from "@/lib/alerts";

const ALERT_QUEUE_NAME = "alert-checks";
const ALERT_JOB_NAME = "run-alert-checks";

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
  console.log("[AlertChecker] Starting alert evaluation run...");

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

  console.log(
    `[AlertChecker] Evaluating alerts for ${usersWithWorkspaces.length} user(s)...`
  );

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
          console.log(
            `[AlertChecker] Sent ${alert.alertType} alert to ${user.email} (workspace: ${alert.workspaceName})`
          );
        } catch (alertErr) {
          console.error(
            `[AlertChecker] Failed to send ${alert.alertType} alert for user ${user.id}:`,
            alertErr
          );
        }
      }
    } catch (userErr) {
      console.error(
        `[AlertChecker] Failed to evaluate alerts for user ${user.id}:`,
        userErr
      );
    }
  }

  console.log(
    `[AlertChecker] Run complete. ${totalSent} alert(s) sent.`
  );
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

  console.log("[AlertChecker] Repeatable alert-check job scheduled (hourly).");
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
  console.log("[AlertChecker] Alert check job completed.");
});

alertWorker.on("failed", (_job, err) => {
  console.error("[AlertChecker] Alert check job failed:", err);
});
