import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { decrypt } from "@/lib/encryption";
import {
  normalizeToPinterestEvent,
  sendToPinterest,
  PinterestApiError,
} from "@/lib/destinations/pinterest";
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

async function processPinterestEvent(job: Job<DestinationEventJob>): Promise<void> {
  const { workspaceId, eventLogId, event } = job.data;

  const log = createLogger({
    component: "pinterest-worker",
    jobId: job.id,
    workspaceId,
    eventName: event.eventName,
    requestId: job.data.requestId,
  });

  try {
    const workspace = await getWorkspaceForDestination(workspaceId, "PINTEREST");
    if (!workspace || !workspace.isActive) {
      throw new Error(`Workspace ${workspaceId} not found or inactive`);
    }
    if (!workspace.pinterestConversionTokenEncrypted) {
      throw new Error(`Pinterest credentials not configured for workspace ${workspaceId}`);
    }

    const conversionToken = decrypt(
      workspace.pinterestConversionTokenEncrypted as string,
      workspace.pinterestConversionTokenIv as string,
      workspace.pinterestConversionTokenTag as string
    );
    const adAccountId = (workspace.pinterestAdAccountId as string) || "";

    // Normalize event to Pinterest format
    const pinterestEvent = normalizeToPinterestEvent(event.eventName, {
      eventId: event.eventId,
      timestamp: event.timestamp,
      url: event.url,
      referrer: event.referrer,
      userData: event.userData,
      customData: event.customData,
      clientIp: event.clientIp,
      userAgent: event.userAgent,
      epik: event.epik,
    });

    if (!pinterestEvent) {
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
      log.info("Job skipped: event type not tracked by Pinterest");
      return;
    }

    // Send to Pinterest Conversions API
    // Circuit breaker check
    const circuitOk = await isCircuitClosed("PINTEREST");
    if (!circuitOk) {
      throw new CircuitOpenError("PINTEREST");
    }

    const response = await sendToPinterest(adAccountId, conversionToken, [pinterestEvent]);
    await recordSuccess("PINTEREST").catch(() => {});

    // Update EventLog to SENT (skip for fire-and-forget events)
    if (eventLogId) {
      await db.eventLog.update({
        where: { id: eventLogId },
        data: { status: "SENT", metaResponse: response as any },
      });
    }

    log.info("Job completed");
  } catch (error) {
    await recordFailure("PINTEREST").catch(() => {});
    const errorMessage =
      error instanceof PinterestApiError
        ? `Pinterest ${error.statusCode}: ${error.message}`
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
          log.error("Failed to update EventLog", {
            eventLogId,
            error: dbErr,
          });
        });
    }

    // Re-throw so BullMQ can retry with exponential backoff
    throw error;
  }
}

const connectionLog = createLogger({ component: "pinterest-worker", channel: "redis" });

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

export const pinterestWorker = new Worker<DestinationEventJob>(
  QUEUE_CONFIG.PINTEREST_QUEUE_NAME,
  processPinterestEvent,
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

const workerLog = createLogger({ component: "pinterest-worker" });

pinterestWorker.on("completed", (job) => {
  workerLog.info("Job completed", { jobId: job.id });
});

pinterestWorker.on("failed", (job, err) => {
  workerLog.error("Job failed", {
    jobId: job?.id,
    jobName: job?.name,
    attemptsMade: job?.attemptsMade,
    attempts: job?.opts?.attempts,
    error: err,
  });
});

pinterestWorker.on("error", (err) => {
  workerLog.error("Worker error", { error: err });
});

pinterestWorker.on("stalled", (jobId) => {
  workerLog.warn("Job stalled", { jobId });
});

export { processPinterestEvent };
