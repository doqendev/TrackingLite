import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { decrypt } from "@/lib/encryption";
import {
  normalizeToKlaviyoEvent,
  sendToKlaviyo,
  KlaviyoApiError,
} from "@/lib/destinations/klaviyo";
import { db } from "@/lib/db";
import { QUEUE_CONFIG } from "@/lib/constants";
import { createLogger } from "@/lib/logger";
import { getWorkspaceForDestination } from "@/lib/workspace-cache";
import { isCircuitClosed, recordSuccess, recordFailure, CircuitOpenError } from "@/lib/circuit-breaker";
import type { DestinationEventJob } from "@/lib/queue";

async function processKlaviyoEvent(job: Job<DestinationEventJob>): Promise<void> {
  const { workspaceId, eventLogId, event } = job.data;

  const log = createLogger({
    component: "klaviyo-worker",
    jobId: job.id,
    workspaceId,
    eventName: event.eventName,
    requestId: job.data.requestId,
  });

  try {
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

    // Normalize event to Klaviyo format
    const klaviyoEvent = normalizeToKlaviyoEvent(event.eventName, {
      eventId: event.eventId,
      timestamp: event.timestamp,
      userData: event.userData,
      customData: event.customData,
    });

    if (!klaviyoEvent) {
      // Event type not supported — skip (PageView is skipped at ingest level, but guard here too)
      if (eventLogId) {
        await db.eventLog.update({
          where: { id: eventLogId },
          data: {
            status: "SENT",
            metaResponse: { skipped: true, reason: "Event type not supported by Klaviyo" } as any,
          },
        });
      }
      log.info("Job skipped: event type not tracked by Klaviyo");
      return;
    }

    // Send to Klaviyo Events API
    // Circuit breaker check
    const circuitOk = await isCircuitClosed("KLAVIYO");
    if (!circuitOk) {
      throw new CircuitOpenError("KLAVIYO");
    }

    const response = await sendToKlaviyo(apiKey, klaviyoEvent);
    await recordSuccess("KLAVIYO");

    // Update EventLog to SENT (skip for fire-and-forget events)
    if (eventLogId) {
      await db.eventLog.update({
        where: { id: eventLogId },
        data: { status: "SENT", metaResponse: response as any },
      });
    }

    log.info("Job completed");
  } catch (error) {
    await recordFailure("KLAVIYO");
    const errorMessage =
      error instanceof KlaviyoApiError
        ? `Klaviyo ${error.statusCode}: ${error.message}`
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

export const klaviyoWorker = new Worker<DestinationEventJob>(
  QUEUE_CONFIG.KLAVIYO_QUEUE_NAME,
  processKlaviyoEvent,
  {
    connection: connection as never,
    concurrency: 10,
    lockDuration: 60000,
  }
);

const workerLog = createLogger({ component: "klaviyo-worker" });

klaviyoWorker.on("completed", (job) => {
  workerLog.info("Job completed", { jobId: job.id });
});

klaviyoWorker.on("failed", (job, err) => {
  workerLog.error("Job failed", { jobId: job?.id, error: err.message });
});

klaviyoWorker.on("error", (err) => {
  workerLog.error("Worker error", { error: err.message });
});

export { processKlaviyoEvent };
