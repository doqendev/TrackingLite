import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { decrypt } from "@/lib/encryption";
import {
  normalizeToTikTokEvent,
  sendToTikTok,
  TikTokApiError,
} from "@/lib/destinations/tiktok";
import { db } from "@/lib/db";
import { QUEUE_CONFIG } from "@/lib/constants";
import { createLogger } from "@/lib/logger";
import { getWorkspaceForDestination } from "@/lib/workspace-cache";
import { isCircuitClosed, recordSuccess, recordFailure, CircuitOpenError } from "@/lib/circuit-breaker";
import {
  DESTINATION_WORKER_CONCURRENCY,
  WORKER_LOCK_DURATION_MS,
  WORKER_MAX_STALLED_COUNT,
  WORKER_STALLED_INTERVAL_MS,
} from "./worker-options";
import type { DestinationEventJob } from "@/lib/queue";

async function processTikTokEvent(job: Job<DestinationEventJob>): Promise<void> {
  const { workspaceId, eventLogId, event } = job.data;

  const log = createLogger({
    component: "tiktok-worker",
    jobId: job.id,
    workspaceId,
    eventName: event.eventName,
    requestId: job.data.requestId,
  });

  try {
    const startTime = Date.now();

    // Resolve credentials: backward compat for old-format jobs, otherwise DB lookup
    let accessToken: string;
    let pixelId: string;

    const oldCredentials = (job.data as unknown as Record<string, unknown>).credentials as Record<string, string> | undefined;

    if (oldCredentials?.accessToken) {
      // Old format: credentials in job data (drain existing queued jobs)
      accessToken = decrypt(oldCredentials.accessToken, oldCredentials.accessTokenIv, oldCredentials.accessTokenTag);
      pixelId = oldCredentials.pixelId || "";
    } else {
      // New format: look up workspace from DB
      const workspace = await getWorkspaceForDestination(workspaceId, "TIKTOK");
      if (!workspace || !workspace.isActive) {
        throw new Error(`Workspace ${workspaceId} not found or inactive`);
      }
      if (!workspace.tiktokAccessTokenEncrypted) {
        throw new Error(`TikTok credentials not configured for workspace ${workspaceId}`);
      }
      accessToken = decrypt(
        workspace.tiktokAccessTokenEncrypted as string,
        workspace.tiktokAccessTokenIv as string,
        workspace.tiktokAccessTokenTag as string
      );
      pixelId = (workspace.tiktokPixelId as string) || "";
    }

    // Normalize event to TikTok format
    const tiktokEvent = normalizeToTikTokEvent(event.eventName, {
      eventId: event.eventId,
      timestamp: event.timestamp,
      url: event.url,
      referrer: event.referrer,
      userData: event.userData,
      customData: event.customData,
      clientIp: event.clientIp,
      userAgent: event.userAgent,
      ttclid: event.ttclid,
    });

    if (!tiktokEvent) {
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
      log.info("Job skipped: event type not tracked by TikTok");
      return;
    }

    // Send to TikTok Events API
    // Circuit breaker check
    const circuitOk = await isCircuitClosed("TIKTOK");
    if (!circuitOk) {
      throw new CircuitOpenError("TIKTOK");
    }

    const response = await sendToTikTok(
      pixelId,
      accessToken,
      [tiktokEvent]
    );
    await recordSuccess("TIKTOK").catch(() => {});

    // Update EventLog to SENT (skip for fire-and-forget events)
    if (eventLogId) {
      await db.eventLog.update({
        where: { id: eventLogId },
        data: { status: "SENT", metaResponse: response as any },
      });
    }

    log.info("Job completed", {
      eventId: event.eventId,
      durationMs: Date.now() - startTime,
      hasEmail: !!(event.userData?.email),
      hasPhone: !!(event.userData?.phone),
      hasTtclid: !!event.ttclid,
      hasUrl: !!event.url,
      hasValue: event.customData?.value !== undefined && event.customData?.value !== null,
      currency: event.customData?.currency || null,
    });

    if (event.eventName === "Purchase" && (event.customData?.value === undefined || event.customData?.value === null)) {
      log.warn("Purchase event missing value/currency", { eventId: event.eventId });
    }
  } catch (error) {
    await recordFailure("TIKTOK").catch(() => {});
    const errorMessage =
      error instanceof TikTokApiError
        ? `TikTok ${error.statusCode}: ${error.message}`
        : error instanceof Error
        ? error.message
        : "Unknown error";

    if (eventLogId) {
      const willRetry = ((job.attemptsMade ?? 0) + 1) < (job.opts?.attempts ?? 3);
      await db.eventLog
        .update({
          where: { id: eventLogId },
          data: {
            status: willRetry ? "RETRYING" : "FAILED",
            errorMessage,
            retryCount: { increment: 1 },
          },
        })
        .catch((dbErr) => {
          log.error("Failed to update EventLog", { eventLogId, error: dbErr });
        });
    }

    // Re-throw so BullMQ can retry with exponential backoff
    throw error;
  }
}

const connectionLog = createLogger({ component: "tiktok-worker", channel: "redis" });

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

export const tiktokWorker = new Worker<DestinationEventJob>(
  QUEUE_CONFIG.TIKTOK_QUEUE_NAME,
  processTikTokEvent,
  {
    connection: connection as never,
    concurrency: DESTINATION_WORKER_CONCURRENCY,
    lockDuration: WORKER_LOCK_DURATION_MS,
    stalledInterval: WORKER_STALLED_INTERVAL_MS,
    maxStalledCount: WORKER_MAX_STALLED_COUNT,
  }
);

connection.on("error", (err) => {
  connectionLog.error("Worker Redis connection error", { error: err });
});

tiktokWorker.on("failed", (job, err) => {
  connectionLog.error("Job failed", {
    jobId: job?.id,
    jobName: job?.name,
    attemptsMade: job?.attemptsMade,
    attempts: job?.opts?.attempts,
    error: err,
  });
});

tiktokWorker.on("error", (err) => {
  connectionLog.error("Worker error", { error: err });
});

tiktokWorker.on("stalled", (jobId) => {
  connectionLog.warn("Job stalled", { jobId });
});

export { processTikTokEvent };
