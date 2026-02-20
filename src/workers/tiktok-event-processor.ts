import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { decrypt } from "@/lib/encryption";
import {
  normalizeToTikTokEvent,
  sendToTikTok,
  TikTokApiError,
} from "@/lib/destinations/tiktok";
import { db } from "@/lib/db";
import { QUEUE_CONFIG } from "@/lib/constants";
import type { DestinationEventJob } from "@/lib/queue";

async function processTikTokEvent(job: Job<DestinationEventJob>): Promise<void> {
  const { workspaceId, eventLogId, event, credentials } = job.data;

  try {
    // Decrypt access token
    const accessToken = decrypt(
      credentials.accessToken,
      credentials.accessTokenIv,
      credentials.accessTokenTag
    );

    // Normalize event to TikTok format
    const tiktokEvent = normalizeToTikTokEvent(event.eventName, {
      eventId: event.eventId,
      timestamp: event.timestamp,
      url: event.url,
      referrer: event.referrer,
      userData: event.userData,
      customData: event.customData,
      clientIp: event.clientIp,
      userAgent: event.userAgent,
      ttclid: event.ttclid,
    });

    if (!tiktokEvent) {
      // Event type not supported — skip
      await db.eventLog.update({
        where: { id: eventLogId },
        data: {
          status: "SENT",
          metaResponse: { skipped: true, reason: "Event type not supported" } as any,
        },
      });
      console.log(
        `[TikTokWorker] Job ${job.id} skipped: ${event.eventName} not tracked by TikTok`
      );
      return;
    }

    // Send to TikTok Events API
    const response = await sendToTikTok(
      credentials.pixelId,
      accessToken,
      [tiktokEvent]
    );

    // Update EventLog to SENT
    await db.eventLog.update({
      where: { id: eventLogId },
      data: { status: "SENT", metaResponse: response as any },
    });

    console.log(
      `[TikTokWorker] Job ${job.id} completed: ${event.eventName} for workspace ${workspaceId}`
    );
  } catch (error) {
    const errorMessage =
      error instanceof TikTokApiError
        ? `TikTok ${error.statusCode}: ${error.message}`
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
          `[TikTokWorker] Failed to update EventLog ${eventLogId}:`,
          dbErr
        );
      });

    // Re-throw so BullMQ can retry with exponential backoff
    throw error;
  }
}

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

export const tiktokWorker = new Worker<DestinationEventJob>(
  QUEUE_CONFIG.TIKTOK_QUEUE_NAME,
  processTikTokEvent,
  {
    connection: connection as never,
    concurrency: 10,
    lockDuration: 60000,
  }
);

tiktokWorker.on("completed", (job) => {
  console.log(`[TikTokWorker] Job ${job.id} completed successfully`);
});

tiktokWorker.on("failed", (job, err) => {
  console.error(`[TikTokWorker] Job ${job?.id} failed:`, err.message);
});

tiktokWorker.on("error", (err) => {
  console.error("[TikTokWorker] Worker error:", err);
});

export { processTikTokEvent };
