import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import {
  sendGoogleAdsConversion,
  getConversionLabel,
  GoogleAdsError,
} from "@/lib/destinations/google-ads";
import { db } from "@/lib/db";
import { QUEUE_CONFIG } from "@/lib/constants";
import type { DestinationEventJob } from "@/lib/queue";

async function processGoogleEvent(job: Job<DestinationEventJob>): Promise<void> {
  const { workspaceId, eventLogId, event, credentials } = job.data;

  try {
    const conversionId = credentials.conversionId as string | undefined;
    if (!conversionId) {
      await db.eventLog.update({
        where: { id: eventLogId },
        data: {
          status: "FAILED",
          errorMessage: "Google Ads conversion ID not configured",
        },
      });
      return;
    }

    // Look up the per-event label from credentials
    const conversionLabel = getConversionLabel(
      event.eventName,
      credentials as Record<string, string>
    );

    if (!conversionLabel) {
      // Event type has no label configured — skip silently
      await db.eventLog.update({
        where: { id: eventLogId },
        data: {
          status: "SENT",
          metaResponse: {
            skipped: true,
            reason: `No conversion label configured for ${event.eventName}`,
          } as never,
        },
      });
      console.log(
        `[GoogleWorker] Job ${job.id} skipped: no label for ${event.eventName} in workspace ${workspaceId}`
      );
      return;
    }

    const cd = event.customData as Record<string, unknown>;
    const value = cd.value !== undefined && cd.value !== null ? Number(cd.value) : undefined;
    const currency = cd.currency ? String(cd.currency) : undefined;
    const orderId = cd.orderId ? String(cd.orderId) : undefined;
    // gclid is stored in customData by the ingest route via the EventLog gclid field;
    // the DestinationEventJob event shape does not carry it directly, so read from customData
    const gclid = cd.gclid ? String(cd.gclid) : undefined;

    const response = await sendGoogleAdsConversion({
      conversionId,
      conversionLabel,
      value,
      currency,
      orderId,
      gclid,
      eventName: event.eventName,
    });

    await db.eventLog.update({
      where: { id: eventLogId },
      data: { status: "SENT", metaResponse: response as never },
    });

    console.log(
      `[GoogleWorker] Job ${job.id} completed: ${event.eventName} for workspace ${workspaceId}`
    );
  } catch (error) {
    const errorMessage =
      error instanceof GoogleAdsError
        ? `Google Ads ${error.statusCode}: ${error.message}`
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
          `[GoogleWorker] Failed to update EventLog ${eventLogId}:`,
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

export const googleWorker = new Worker<DestinationEventJob>(
  QUEUE_CONFIG.GOOGLE_QUEUE_NAME,
  processGoogleEvent,
  {
    connection: connection as never,
    concurrency: 10,
  }
);

googleWorker.on("completed", (job) => {
  console.log(`[GoogleWorker] Job ${job.id} completed successfully`);
});

googleWorker.on("failed", (job, err) => {
  console.error(`[GoogleWorker] Job ${job?.id} failed:`, err.message);
});

googleWorker.on("error", (err) => {
  console.error("[GoogleWorker] Worker error:", err);
});

export { processGoogleEvent };
