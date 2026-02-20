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
import type { DestinationEventJob } from "@/lib/queue";

async function processGA4Event(job: Job<DestinationEventJob>): Promise<void> {
  const { workspaceId, eventLogId, event, credentials } = job.data;

  try {
    // Decrypt GA4 API secret
    const apiSecret = decrypt(
      credentials.apiSecret,
      credentials.apiSecretIv,
      credentials.apiSecretTag
    );

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
      console.log(
        `[GA4Worker] Job ${job.id} skipped: ${event.eventName} not tracked by GA4`
      );
      return;
    }

    // Use fbp cookie as client_id if available, otherwise fall back to eventId
    const clientId = (event.fbp as string | null | undefined) ?? event.eventId;

    // Send to GA4 Measurement Protocol
    const response = await sendToGA4(
      credentials.measurementId,
      apiSecret,
      clientId,
      [ga4Event]
    );

    // Update EventLog to SENT (skip for fire-and-forget events)
    if (eventLogId) {
      await db.eventLog.update({
        where: { id: eventLogId },
        data: { status: "SENT", metaResponse: response as any },
      });
    }

    console.log(
      `[GA4Worker] Job ${job.id} completed: ${event.eventName} for workspace ${workspaceId}`
    );
  } catch (error) {
    const errorMessage =
      error instanceof GA4ApiError
        ? `GA4 ${error.statusCode}: ${error.message}`
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
          console.error(
            `[GA4Worker] Failed to update EventLog ${eventLogId}:`,
            dbErr
          );
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
    concurrency: 10,
    lockDuration: 60000,
  }
);

ga4Worker.on("completed", (job) => {
  console.log(`[GA4Worker] Job ${job.id} completed successfully`);
});

ga4Worker.on("failed", (job, err) => {
  console.error(`[GA4Worker] Job ${job?.id} failed:`, err.message);
});

ga4Worker.on("error", (err) => {
  console.error("[GA4Worker] Worker error:", err);
});

export { processGA4Event };
