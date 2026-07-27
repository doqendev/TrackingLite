import { Worker, Job, UnrecoverableError } from "bullmq";
import IORedis from "ioredis";
import { decrypt } from "@/lib/encryption";
import {
  normalizeToKlaviyoEvent,
  sendToKlaviyo,
  KlaviyoApiError,
} from "@/lib/destinations/klaviyo";
import { QUEUE_CONFIG } from "@/lib/constants";
import { createLogger } from "@/lib/logger";
import { getWorkspaceForDestination } from "@/lib/workspace-cache";
import {
  isCircuitClosed,
  recordSuccess,
  recordFailure,
  shouldRecordCircuitFailure,
  shouldRetryDeliveryFailure,
  CircuitOpenError,
} from "@/lib/circuit-breaker";
import {
  DESTINATION_WORKER_CONCURRENCY,
  WORKER_LOCK_DURATION_MS,
  WORKER_MAX_STALLED_COUNT,
  WORKER_STALLED_INTERVAL_MS,
} from "./worker-options";
import type { DestinationEventJob } from "@/lib/queue";
import {
  claimEventDelivery,
  completeEventDeliveryClaim,
  failEventDeliveryClaim,
  isEventDeliverySuperseded,
  markEventDeliveryAccepted,
  type EventDeliveryClaim,
} from "@/lib/event-delivery-guard";

async function processKlaviyoEvent(job: Job<DestinationEventJob>): Promise<void> {
  const { workspaceId, eventLogId, event: queuedEvent } = job.data;
  let event = queuedEvent;
  let deliveryClaim: EventDeliveryClaim | null = null;
  let outboundStarted = false;
  let outboundAccepted = false;

  const log = createLogger({
    component: "klaviyo-worker",
    jobId: job.id,
    workspaceId,
    eventName: event.eventName,
    requestId: job.data.requestId,
  });

  try {
    if (await isEventDeliverySuperseded(eventLogId)) {
      log.info("Skipping superseded delivery", { eventLogId });
      return;
    }
    const startTime = Date.now();

    // Resolve credentials: backward compat for old-format jobs, otherwise DB lookup
    let apiKey: string;

    const oldCredentials = (job.data as unknown as Record<string, unknown>).credentials as Record<string, string> | undefined;

    if (oldCredentials?.apiKey) {
      // Old format: credentials in job data (drain existing queued jobs)
      apiKey = decrypt(oldCredentials.apiKey, oldCredentials.apiKeyIv, oldCredentials.apiKeyTag);
    } else {
      // New format: look up workspace from DB
      const workspace = await getWorkspaceForDestination(workspaceId, "KLAVIYO");
      if (!workspace || !workspace.isActive) {
        throw new Error(`Workspace ${workspaceId} not found or inactive`);
      }
      if (!workspace.klaviyoApiKeyEncrypted) {
        throw new Error(`Klaviyo credentials not configured for workspace ${workspaceId}`);
      }
      apiKey = decrypt(
        workspace.klaviyoApiKeyEncrypted as string,
        workspace.klaviyoApiKeyIv as string,
        workspace.klaviyoApiKeyTag as string
      );
    }

    const circuitOk = await isCircuitClosed("KLAVIYO", workspaceId);
    if (!circuitOk) {
      throw new CircuitOpenError("KLAVIYO", workspaceId);
    }

    const ownership = await claimEventDelivery(eventLogId);
    if (ownership.action === "skip") {
      log.info("Skipping delivery owned by a canonical or terminal EventLog", { eventLogId });
      return;
    }
    deliveryClaim = ownership.claim;
    event = (ownership.event ?? queuedEvent) as typeof queuedEvent;

    // Normalize event to Klaviyo format
    const klaviyoEvent = normalizeToKlaviyoEvent(event.eventName, {
      eventId: event.eventId,
      timestamp: event.timestamp,
      userData: event.userData,
      customData: event.customData,
    });

    if (!klaviyoEvent) {
      // Event type not supported — skip (PageView is skipped at ingest level, but guard here too)
      await completeEventDeliveryClaim(deliveryClaim, {
        skipped: true,
        reason: "Event type not supported by Klaviyo",
      });
      log.info("Job skipped: event type not tracked by Klaviyo");
      return;
    }

    // Send to Klaviyo Events API
    outboundStarted = true;
    const response = await sendToKlaviyo(apiKey, klaviyoEvent);
    outboundAccepted = true;
    await markEventDeliveryAccepted(deliveryClaim, response);
    await recordSuccess("KLAVIYO", workspaceId).catch(() => {});

    await completeEventDeliveryClaim(deliveryClaim, response);

    log.info("Job completed", {
      eventId: event.eventId,
      durationMs: Date.now() - startTime,
      hasEmail: !!(event.userData?.email),
      hasPhone: !!(event.userData?.phone),
      hasValue: event.customData?.value !== undefined && event.customData?.value !== null,
      currency: event.customData?.currency || null,
    });

    if (event.eventName === "Purchase" && (event.customData?.value === undefined || event.customData?.value === null)) {
      log.warn("Purchase event missing value/currency", { eventId: event.eventId });
    }
  } catch (error) {
    const circuitFailure = shouldRecordCircuitFailure(error);
    const transientFailure = shouldRetryDeliveryFailure(error);
    const terminalDestinationRejection =
      outboundStarted &&
      error instanceof KlaviyoApiError &&
      !transientFailure;
    const definitiveFailure =
      !outboundStarted ||
      terminalDestinationRejection;
    if (circuitFailure) {
      await recordFailure("KLAVIYO", workspaceId).catch(() => {});
    }
    const errorMessage =
      error instanceof KlaviyoApiError
        ? `Klaviyo ${error.statusCode}: ${error.message}`
        : error instanceof Error
        ? error.message
        : "Unknown error";

    if (eventLogId && !outboundAccepted) {
      const willRetry =
        !terminalDestinationRejection &&
        ((job.attemptsMade ?? 0) + 1) < (job.opts?.attempts ?? 3);
      const failedAt = new Date();
      await failEventDeliveryClaim({
          eventLogId,
          claim: deliveryClaim,
          outcome: definitiveFailure
            ? "DEFINITELY_NOT_DELIVERED"
            : "DELIVERY_AMBIGUOUS",
          status: willRetry ? "RETRYING" : "FAILED",
          errorMessage,
          failedAt,
          nextRetryAt: !willRetry && transientFailure
            ? new Date(failedAt.getTime() + 15 * 60 * 1000)
            : null,
        })
        .catch((dbErr) => {
          log.error("Failed to update EventLog", { eventLogId, error: dbErr });
        });
    }

    if (terminalDestinationRejection) {
      throw new UnrecoverableError(errorMessage);
    }

    // Re-throw so BullMQ can retry with exponential backoff
    throw error;
  }
}

const connectionLog = createLogger({ component: "klaviyo-worker", channel: "redis" });

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

export const klaviyoWorker = new Worker<DestinationEventJob>(
  QUEUE_CONFIG.KLAVIYO_QUEUE_NAME,
  processKlaviyoEvent,
  {
    connection: connection as never,
    autorun: false,
    concurrency: DESTINATION_WORKER_CONCURRENCY,
    lockDuration: WORKER_LOCK_DURATION_MS,
    stalledInterval: WORKER_STALLED_INTERVAL_MS,
    maxStalledCount: WORKER_MAX_STALLED_COUNT,
  }
);

connection.on("error", (err) => {
  connectionLog.error("Worker Redis connection error", { error: err });
});

klaviyoWorker.on("failed", (job, err) => {
  connectionLog.error("Job failed", {
    jobId: job?.id,
    jobName: job?.name,
    attemptsMade: job?.attemptsMade,
    attempts: job?.opts?.attempts,
    error: err,
  });
});

klaviyoWorker.on("error", (err) => {
  connectionLog.error("Worker error", { error: err });
});

klaviyoWorker.on("stalled", (jobId) => {
  connectionLog.warn("Job stalled", { jobId });
});

export { processKlaviyoEvent };
