import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import {
  normalizeToGoogleAdsParams,
  sendToGoogleAds,
  GoogleAdsApiError,
} from "@/lib/destinations/google-ads";
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

async function processGoogleAdsEvent(job: Job<DestinationEventJob>): Promise<void> {
  const { workspaceId, eventLogId, event } = job.data;

  const log = createLogger({
    component: "google-ads-worker",
    jobId: job.id,
    workspaceId,
    eventName: event.eventName,
    requestId: job.data.requestId,
  });

  try {
    const startTime = Date.now();

    const workspace = await getWorkspaceForDestination(workspaceId, "GOOGLE_ADS");
    if (!workspace || !workspace.isActive) {
      throw new Error(`Workspace ${workspaceId} not found or inactive`);
    }
    if (!workspace.googleAdsConversionId) {
      throw new Error(`Google Ads credentials not configured for workspace ${workspaceId}`);
    }

    // No decryption needed -- Conversion ID and Labels are public values
    const params = normalizeToGoogleAdsParams(event.eventName, {
      eventId: event.eventId,
      timestamp: event.timestamp,
      url: event.url,
      referrer: event.referrer,
      userData: event.userData,
      customData: event.customData,
      clientIp: event.clientIp,
      userAgent: event.userAgent,
      gclid: event.gclid,
    }, {
      googleAdsConversionId: workspace.googleAdsConversionId as string,
      googleAdsLabelPurchase: workspace.googleAdsLabelPurchase as string | null | undefined,
      googleAdsLabelAddToCart: workspace.googleAdsLabelAddToCart as string | null | undefined,
      googleAdsLabelInitiateCheckout: workspace.googleAdsLabelInitiateCheckout as string | null | undefined,
      googleAdsLabelViewContent: workspace.googleAdsLabelViewContent as string | null | undefined,
    });

    if (!params) {
      // Event type not supported or no label configured -- skip
      if (eventLogId) {
        await db.eventLog.update({
          where: { id: eventLogId },
          data: {
            status: "SENT",
            metaResponse: { skipped: true, reason: "Event type not supported or no label configured" } as any,
          },
        });
      }
      log.info("Job skipped: event type not tracked by Google Ads or label missing");
      return;
    }

    // Circuit breaker check
    const circuitOk = await isCircuitClosed("GOOGLE_ADS");
    if (!circuitOk) {
      throw new CircuitOpenError("GOOGLE_ADS");
    }

    const response = await sendToGoogleAds(params);
    await recordSuccess("GOOGLE_ADS").catch(() => {});

    if (eventLogId) {
      await db.eventLog.update({
        where: { id: eventLogId },
        data: { status: "SENT", metaResponse: response as any },
      });
    }

    log.info("Job completed", {
      eventId: event.eventId,
      durationMs: Date.now() - startTime,
      hasGclid: !!event.gclid,
      hasEmail: !!(event.userData?.email),
      hasValue: event.customData?.value !== undefined && event.customData?.value !== null,
      currency: event.customData?.currency || null,
    });

    if (event.eventName === "Purchase" && (event.customData?.value === undefined || event.customData?.value === null)) {
      log.warn("Purchase event missing value/currency", { eventId: event.eventId });
    }
  } catch (error) {
    if (!(error instanceof CircuitOpenError)) {
      await recordFailure("GOOGLE_ADS").catch(() => {});
    }
    const errorMessage =
      error instanceof GoogleAdsApiError
        ? `Google Ads ${error.statusCode}: ${error.message}`
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

const connectionLog = createLogger({ component: "google-ads-worker", channel: "redis" });

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

export const googleAdsWorker = new Worker<DestinationEventJob>(
  QUEUE_CONFIG.GOOGLE_ADS_QUEUE_NAME,
  processGoogleAdsEvent,
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

googleAdsWorker.on("failed", (job, err) => {
  connectionLog.error("Job failed", {
    jobId: job?.id,
    jobName: job?.name,
    attemptsMade: job?.attemptsMade,
    attempts: job?.opts?.attempts,
    error: err,
  });
});

googleAdsWorker.on("error", (err) => {
  connectionLog.error("Worker error", { error: err });
});

googleAdsWorker.on("stalled", (jobId) => {
  connectionLog.warn("Job stalled", { jobId });
});

export { processGoogleAdsEvent };
