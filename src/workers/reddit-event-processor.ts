import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { decrypt } from "@/lib/encryption";
import {
  normalizeToRedditEvent,
  sendToReddit,
  RedditApiError,
} from "@/lib/destinations/reddit";
import { db } from "@/lib/db";
import { QUEUE_CONFIG } from "@/lib/constants";
import { createLogger } from "@/lib/logger";
import { getWorkspaceForDestination } from "@/lib/workspace-cache";
import type { DestinationEventJob } from "@/lib/queue";

async function processRedditEvent(job: Job<DestinationEventJob>): Promise<void> {
  const { workspaceId, eventLogId, event } = job.data;

  const log = createLogger({
    component: "reddit-worker",
    jobId: job.id,
    workspaceId,
    eventName: event.eventName,
    requestId: job.data.requestId,
  });

  try {
    const workspace = await getWorkspaceForDestination(workspaceId, "REDDIT");
    if (!workspace || !workspace.isActive) {
      throw new Error(`Workspace ${workspaceId} not found or inactive`);
    }
    if (!workspace.redditAccessTokenEncrypted) {
      throw new Error(`Reddit credentials not configured for workspace ${workspaceId}`);
    }

    const accessToken = decrypt(
      workspace.redditAccessTokenEncrypted as string,
      workspace.redditAccessTokenIv as string,
      workspace.redditAccessTokenTag as string
    );
    const accountId = (workspace.redditAccountId as string) || "";

    const redditEvent = normalizeToRedditEvent(event.eventName, {
      eventId: event.eventId,
      timestamp: event.timestamp,
      url: event.url,
      referrer: event.referrer,
      userData: event.userData,
      customData: event.customData,
      clientIp: event.clientIp,
      userAgent: event.userAgent,
      rdtCid: event.rdtCid,
    });

    if (!redditEvent) {
      // Event type not supported — skip
      if (eventLogId) {
        await db.eventLog.update({
          where: { id: eventLogId },
          data: {
            status: "SENT",
            metaResponse: { skipped: true, reason: "Event type not supported" } as any,
          },
        });
      }
      log.info("Job skipped: event type not tracked by Reddit");
      return;
    }

    const response = await sendToReddit(accountId, accessToken, [redditEvent]);

    if (eventLogId) {
      await db.eventLog.update({
        where: { id: eventLogId },
        data: { status: "SENT", metaResponse: response as any },
      });
    }

    log.info("Job completed");
  } catch (error) {
    const errorMessage =
      error instanceof RedditApiError
        ? `Reddit ${error.statusCode}: ${error.message}`
        : error instanceof Error
        ? error.message
        : "Unknown error";

    if (eventLogId) {
      await db.eventLog
        .update({
          where: { id: eventLogId },
          data: {
            status: "FAILED",
            errorMessage,
            retryCount: { increment: 1 },
          },
        })
        .catch((dbErr) => {
          log.error("Failed to update EventLog", {
            eventLogId,
            error: dbErr instanceof Error ? dbErr.message : String(dbErr),
          });
        });
    }

    // Re-throw so BullMQ can retry with exponential backoff
    throw error;
  }
}

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

export const redditWorker = new Worker<DestinationEventJob>(
  QUEUE_CONFIG.REDDIT_QUEUE_NAME,
  processRedditEvent,
  {
    connection: connection as never,
    concurrency: 10,
    lockDuration: 60000,
  }
);

const workerLog = createLogger({ component: "reddit-worker" });

redditWorker.on("completed", (job) => {
  workerLog.info("Job completed", { jobId: job.id });
});

redditWorker.on("failed", (job, err) => {
  workerLog.error("Job failed", { jobId: job?.id, error: err.message });
});

redditWorker.on("error", (err) => {
  workerLog.error("Worker error", { error: err.message });
});

export { processRedditEvent };
