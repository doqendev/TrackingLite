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
import type { DestinationEventJob } from "@/lib/queue";

async function processKlaviyoEvent(job: Job<DestinationEventJob>): Promise<void> {
  const { workspaceId, eventLogId, event, credentials } = job.data;

  try {
    // Decrypt API key
    const apiKey = decrypt(
      credentials.apiKey,
      credentials.apiKeyIv,
      credentials.apiKeyTag
    );

    // Normalize event to Klaviyo format
    const klaviyoEvent = normalizeToKlaviyoEvent(event.eventName, {
      eventId: event.eventId,
      timestamp: event.timestamp,
      userData: event.userData,
      customData: event.customData,
    });

    if (!klaviyoEvent) {
      // Event type not supported — skip (PageView is skipped at ingest level, but guard here too)
      await db.eventLog.update({
        where: { id: eventLogId },
        data: {
          status: "SENT",
          metaResponse: { skipped: true, reason: "Event type not supported by Klaviyo" } as any,
        },
      });
      console.log(
        `[KlaviyoWorker] Job ${job.id} skipped: ${event.eventName} not tracked by Klaviyo`
      );
      return;
    }

    // Send to Klaviyo Events API
    const response = await sendToKlaviyo(apiKey, klaviyoEvent);

    // Update EventLog to SENT
    await db.eventLog.update({
      where: { id: eventLogId },
      data: { status: "SENT", metaResponse: response as any },
    });

    console.log(
      `[KlaviyoWorker] Job ${job.id} completed: ${event.eventName} for workspace ${workspaceId}`
    );
  } catch (error) {
    const errorMessage =
      error instanceof KlaviyoApiError
        ? `Klaviyo ${error.statusCode}: ${error.message}`
        : error instanceof Error
        ? error.message
        : "Unknown error";

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
        console.error(
          `[KlaviyoWorker] Failed to update EventLog ${eventLogId}:`,
          dbErr
        );
      });

    // Re-throw so BullMQ can retry with exponential backoff
    throw error;
  }
}

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
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

klaviyoWorker.on("completed", (job) => {
  console.log(`[KlaviyoWorker] Job ${job.id} completed successfully`);
});

klaviyoWorker.on("failed", (job, err) => {
  console.error(`[KlaviyoWorker] Job ${job?.id} failed:`, err.message);
});

klaviyoWorker.on("error", (err) => {
  console.error("[KlaviyoWorker] Worker error:", err);
});

export { processKlaviyoEvent };
