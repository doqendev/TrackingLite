import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { decrypt } from "@/lib/encryption";
import {
  normalizeToGA4Event,
  sendToGA4,
  GA4ApiError,
} from "@/lib/destinations/ga4";
import { db } from "@/lib/db";
import { QUEUE_CONFIG } from "@/lib/constants";
import { createLogger } from "@/lib/logger";
import { getWorkspaceForDestination } from "@/lib/workspace-cache";
import { hashPii } from "@/lib/hash-pii";
import { isCircuitClosed, recordSuccess, recordFailure, CircuitOpenError } from "@/lib/circuit-breaker";
import type { DestinationEventJob } from "@/lib/queue";

async function processGA4Event(job: Job<DestinationEventJob>): Promise<void> {
  const { workspaceId, eventLogId, event } = job.data;

  const log = createLogger({
    component: "ga4-worker",
    jobId: job.id,
    workspaceId,
    eventName: event.eventName,
    requestId: job.data.requestId,
  });

  try {
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
      if (eventLogId) {
        await db.eventLog.update({
          where: { id: eventLogId },
          data: {
            status: "SENT",
            metaResponse: { skipped: true, reason: "Event type not supported" } as any,
          },
        });
      }
      log.info("Job skipped: event type not tracked by GA4");
      return;
    }

    // Prefer actual GA4 client_id from browser _ga cookie, fall back to hashed email, then eventId
    const ud = event.userData as Record<string, unknown> | undefined;
    const clientId = event.gaClientId ||
      (ud?.email && typeof ud.email === "string" ? hashPii(ud.email) : null) ||
      event.eventId;

    // Send to GA4 Measurement Protocol
    // Circuit breaker check
    const circuitOk = await isCircuitClosed("GA4");
    if (!circuitOk) {
      throw new CircuitOpenError("GA4");
    }

    const response = await sendToGA4(
      measurementId,
      apiSecret,
      clientId,
      [ga4Event]
    );
    await recordSuccess("GA4").catch(() => {});

    // Update EventLog to SENT (skip for fire-and-forget events)
    if (eventLogId) {
      await db.eventLog.update({
        where: { id: eventLogId },
        data: { status: "SENT", metaResponse: response as any },
      });
    }

    log.info("Job completed");
  } catch (error) {
    await recordFailure("GA4").catch(() => {});
    const errorMessage =
      error instanceof GA4ApiError
        ? `GA4 ${error.statusCode}: ${error.message}`
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
          log.error("Failed to update EventLog", { eventLogId, error: dbErr instanceof Error ? dbErr.message : String(dbErr) });
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

export const ga4Worker = new Worker<DestinationEventJob>(
  QUEUE_CONFIG.GA4_QUEUE_NAME,
  processGA4Event,
  {
    connection: connection as never,
    concurrency: 2,
    lockDuration: 60000,
  }
);

connection.on("error", (err) => {
  console.error(JSON.stringify({ level: "error", msg: "Worker Redis connection error", error: err.message }));
});

const workerLog = createLogger({ component: "ga4-worker" });

ga4Worker.on("completed", (job) => {
  workerLog.info("Job completed", { jobId: job.id });
});

ga4Worker.on("failed", (job, err) => {
  workerLog.error("Job failed", { jobId: job?.id, error: err.message });
});

ga4Worker.on("error", (err) => {
  workerLog.error("Worker error", { error: err.message });
});

export { processGA4Event };
