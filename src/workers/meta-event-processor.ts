import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { decrypt } from "@/lib/encryption";
import { normalizeToMetaCapiEvent } from "@/lib/event-normalizer";
import { sendToMetaCapi, MetaCapiError } from "@/lib/meta-capi";
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
import type { MetaEventJob } from "@/lib/queue";
import type { SnippetEventPayload } from "@/types/events";

async function processMetaEvent(job: Job<MetaEventJob>): Promise<void> {
  const { workspaceId, event, eventLogId } = job.data;

  const log = createLogger({
    component: "meta-worker",
    jobId: job.id,
    workspaceId,
    eventName: event.eventName,
    requestId: job.data.requestId,
  });

  try {
    // 1. Resolve credentials: backward compat for old-format jobs, otherwise DB lookup
    let pixelId: string;
    let decryptedToken: string;
    let testEventCode: string | undefined;

    const jobData = job.data as unknown as Record<string, unknown>;
    if (jobData.pixelId && jobData.accessToken) {
      // Old format: credentials in job data (drain existing queued jobs)
      pixelId = jobData.pixelId as string;
      decryptedToken = decrypt(
        jobData.accessToken as string,
        jobData.accessTokenIv as string,
        jobData.accessTokenTag as string
      );
      testEventCode = (jobData.testEventCode as string) || undefined;
    } else {
      // New format: look up workspace from DB
      const workspace = await getWorkspaceForDestination(workspaceId, "META");
      if (!workspace || !workspace.isActive) {
        throw new Error(`Workspace ${workspaceId} not found or inactive`);
      }
      if (!workspace.metaPixelId || !workspace.metaAccessTokenEncrypted) {
        throw new Error(`Meta credentials not configured for workspace ${workspaceId}`);
      }
      pixelId = workspace.metaPixelId as string;
      decryptedToken = decrypt(
        workspace.metaAccessTokenEncrypted as string,
        workspace.metaAccessTokenIv as string,
        workspace.metaAccessTokenTag as string
      );
      testEventCode = (workspace.metaTestEventCode as string) || undefined;
    }

    // 2. Build SnippetEventPayload for normalizer
    const payload: SnippetEventPayload = {
      eventName: event.eventName,
      eventId: event.eventId,
      timestamp: event.timestamp,
      url: event.url,
      referrer: event.referrer,
      fbp: event.fbp,
      fbc: event.fbc,
      userData: event.userData as SnippetEventPayload["userData"],
      customData: event.customData,
    };

    // 3. Normalize to Meta CAPI format (hashes PII, converts timestamps, etc.)
    const metaCapiEvent = normalizeToMetaCapiEvent(
      payload,
      event.clientIp,
      event.userAgent
    );

    // 4. Send to Meta Conversions API
    // Circuit breaker check
    const circuitOk = await isCircuitClosed("META");
    if (!circuitOk) {
      throw new CircuitOpenError("META");
    }

    const response = await sendToMetaCapi(
      pixelId,
      decryptedToken,
      [metaCapiEvent],
      testEventCode || undefined
    );
    await recordSuccess("META").catch(() => {});

    // 5. Update EventLog to SENT (skip for fire-and-forget events)
    if (eventLogId) {
      await db.eventLog.update({
        where: { id: eventLogId },
        data: {
          status: "SENT",
          metaResponse: response as any,
        },
      });
    }

    log.info("Job completed");
  } catch (error) {
    await recordFailure("META").catch(() => {});
    // Update EventLog to FAILED
    const errorMessage =
      error instanceof MetaCapiError
        ? `Meta CAPI ${error.statusCode}: ${error.message}`
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

// Create worker
const connectionLog = createLogger({ component: "meta-worker", channel: "redis" });

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

export const worker = new Worker<MetaEventJob>(
  QUEUE_CONFIG.QUEUE_NAME,
  processMetaEvent,
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

const workerLog = createLogger({ component: "meta-worker" });

worker.on("completed", (job) => {
  workerLog.info("Job completed", { jobId: job.id });
});

worker.on("failed", (job, err) => {
  workerLog.error("Job failed", {
    jobId: job?.id,
    jobName: job?.name,
    attemptsMade: job?.attemptsMade,
    attempts: job?.opts?.attempts,
    error: err,
  });
});

worker.on("error", (err) => {
  workerLog.error("Worker error", { error: err });
});

worker.on("stalled", (jobId) => {
  workerLog.warn("Job stalled", { jobId });
});

export { processMetaEvent };
