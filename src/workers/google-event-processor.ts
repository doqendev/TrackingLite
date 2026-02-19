import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { decrypt } from "@/lib/encryption";
import {
  normalizeToGoogleAdsEvent,
  sendToGoogleAds,
  refreshGoogleAdsToken,
  GoogleAdsError,
} from "@/lib/destinations/google-ads";
import { db } from "@/lib/db";
import { QUEUE_CONFIG } from "@/lib/constants";
import type { DestinationEventJob } from "@/lib/queue";

async function processGoogleEvent(job: Job<DestinationEventJob>): Promise<void> {
  const { workspaceId, eventLogId, event, credentials } = job.data;

  try {
    // Decrypt access token
    let accessToken = decrypt(
      credentials.accessToken,
      credentials.accessTokenIv,
      credentials.accessTokenTag
    );

    // Normalize event to Google Ads format
    const googleEvent = normalizeToGoogleAdsEvent(
      event.eventName,
      {
        eventId: event.eventId,
        timestamp: event.timestamp,
        userData: event.userData,
        customData: event.customData,
        clientIp: event.clientIp,
      },
      credentials.conversionAction
    );

    if (!googleEvent) {
      // Event type not supported by Google Ads (PageView, ViewContent) — skip
      await db.eventLog.update({
        where: { id: eventLogId },
        data: {
          status: "SENT",
          metaResponse: { skipped: true, reason: "Event type not supported by Google Ads" } as any,
        },
      });
      console.log(
        `[GoogleWorker] Job ${job.id} skipped: ${event.eventName} not tracked by Google Ads`
      );
      return;
    }

    // Send to Google Ads — retry once with refreshed token on 401
    let response: unknown;
    try {
      response = await sendToGoogleAds(
        credentials.customerId,
        accessToken,
        credentials.developerToken,
        [googleEvent]
      );
    } catch (err) {
      if (
        err instanceof GoogleAdsError &&
        err.statusCode === 401 &&
        credentials.refreshToken &&
        credentials.refreshTokenIv &&
        credentials.refreshTokenTag
      ) {
        // Token expired — attempt refresh
        console.log(`[GoogleWorker] Job ${job.id}: access token expired, refreshing...`);
        const refreshToken = decrypt(
          credentials.refreshToken,
          credentials.refreshTokenIv,
          credentials.refreshTokenTag
        );

        const refreshed = await refreshGoogleAdsToken(refreshToken);
        accessToken = refreshed.accessToken;

        // Persist the new encrypted access token to the workspace
        await db.workspace.update({
          where: { id: workspaceId },
          data: {
            googleAdsAccessTokenEncrypted: refreshed.encrypted,
            googleAdsAccessTokenIv: refreshed.iv,
            googleAdsAccessTokenTag: refreshed.tag,
          },
        });

        console.log(`[GoogleWorker] Job ${job.id}: token refreshed, retrying...`);

        // Retry with new token
        response = await sendToGoogleAds(
          credentials.customerId,
          accessToken,
          credentials.developerToken,
          [googleEvent]
        );
      } else {
        throw err;
      }
    }

    // Update EventLog to SENT
    await db.eventLog.update({
      where: { id: eventLogId },
      data: { status: "SENT", metaResponse: response as any },
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
