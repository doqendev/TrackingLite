import { Worker, Job, UnrecoverableError } from "bullmq";
import IORedis from "ioredis";
import { decrypt } from "@/lib/encryption";
import {
  normalizeToGA4Event,
  sendToGA4,
  GA4ApiError,
} from "@/lib/destinations/ga4";
import { QUEUE_CONFIG } from "@/lib/constants";
import { createLogger } from "@/lib/logger";
import { getWorkspaceForDestination } from "@/lib/workspace-cache";
import { hashPii } from "@/lib/hash-pii";
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

async function processGA4Event(job: Job<DestinationEventJob>): Promise<void> {
  const { workspaceId, eventLogId, event: queuedEvent } = job.data;
  let event = queuedEvent;
  let deliveryClaim: EventDeliveryClaim | null = null;
  let outboundStarted = false;
  let outboundAccepted = false;

  const log = createLogger({
    component: "ga4-worker",
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
    let apiSecret: string;
    let measurementId: string;

    const oldCredentials = (job.data as unknown as Record<string, unknown>).credentials as Record<string, string> | undefined;

    if (oldCredentials?.apiSecret) {
      // Old format: credentials in job data (drain existing queued jobs)
      apiSecret = decrypt(oldCredentials.apiSecret, oldCredentials.apiSecretIv, oldCredentials.apiSecretTag);
      measurementId = oldCredentials.measurementId || "";
    } else {
      // New format: look up workspace from DB
      const workspace = await getWorkspaceForDestination(workspaceId, "GA4");
      if (!workspace || !workspace.isActive) {
        throw new Error(`Workspace ${workspaceId} not found or inactive`);
      }
      if (!workspace.ga4ApiSecretEncrypted) {
        throw new Error(`GA4 credentials not configured for workspace ${workspaceId}`);
      }
      apiSecret = decrypt(
        workspace.ga4ApiSecretEncrypted as string,
        workspace.ga4ApiSecretIv as string,
        workspace.ga4ApiSecretTag as string
      );
      measurementId = (workspace.ga4MeasurementId as string) || "";
    }

    const circuitOk = await isCircuitClosed("GA4", workspaceId);
    if (!circuitOk) {
      throw new CircuitOpenError("GA4", workspaceId);
    }

    const ownership = await claimEventDelivery(eventLogId);
    if (ownership.action === "skip") {
      log.info("Skipping delivery owned by a canonical or terminal EventLog", { eventLogId });
      return;
    }
    deliveryClaim = ownership.claim;
    event = (ownership.event ?? queuedEvent) as typeof queuedEvent;

    // Normalize event to GA4 Measurement Protocol format
    const ga4Event = normalizeToGA4Event(event.eventName, {
      eventId: event.eventId,
      timestamp: event.timestamp,
      url: event.url,
      referrer: event.referrer,
      userData: event.userData,
      customData: event.customData,
      clientIp: event.clientIp,
      userAgent: event.userAgent,
    });

    if (!ga4Event) {
      // Event type not supported — skip
      await completeEventDeliveryClaim(deliveryClaim, {
        skipped: true,
        reason: "Event type not supported",
      });
      log.info("Job skipped: event type not tracked by GA4");
      return;
    }

    // Prefer actual GA4 client_id from browser _ga cookie, fall back to hashed email, then eventId
    const ud = event.userData as Record<string, unknown> | undefined;
    const clientId = event.gaClientId ||
      (ud?.email && typeof ud.email === "string" ? hashPii(ud.email) : null) ||
      event.eventId;

    // Send to GA4 Measurement Protocol
    outboundStarted = true;
    const response = await sendToGA4(
      measurementId,
      apiSecret,
      clientId,
      [ga4Event]
    );
    outboundAccepted = true;
    await markEventDeliveryAccepted(deliveryClaim, response);
    await recordSuccess("GA4", workspaceId).catch(() => {});

    await completeEventDeliveryClaim(deliveryClaim, response);

    log.info("Job completed", {
      eventId: event.eventId,
      durationMs: Date.now() - startTime,
      hasEmail: !!(event.userData?.email),
      hasUrl: !!event.url,
      hasGaClientId: !!event.gaClientId,
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
      error instanceof GA4ApiError &&
      !transientFailure;
    const definitiveFailure =
      !outboundStarted ||
      terminalDestinationRejection;
    if (circuitFailure) {
      await recordFailure("GA4", workspaceId).catch(() => {});
    }
    const errorMessage =
      error instanceof GA4ApiError
        ? `GA4 ${error.statusCode}: ${error.message}`
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

const connectionLog = createLogger({ component: "ga4-worker", channel: "redis" });

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

export const ga4Worker = new Worker<DestinationEventJob>(
  QUEUE_CONFIG.GA4_QUEUE_NAME,
  processGA4Event,
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

ga4Worker.on("failed", (job, err) => {
  connectionLog.error("Job failed", {
    jobId: job?.id,
    jobName: job?.name,
    attemptsMade: job?.attemptsMade,
    attempts: job?.opts?.attempts,
    error: err,
  });
});

ga4Worker.on("error", (err) => {
  connectionLog.error("Worker error", { error: err });
});

ga4Worker.on("stalled", (jobId) => {
  connectionLog.warn("Job stalled", { jobId });
});

export { processGA4Event };
