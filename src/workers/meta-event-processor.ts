import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { decrypt } from "@/lib/encryption";
import { normalizeToMetaCapiEvent } from "@/lib/event-normalizer";
import { sendToMetaCapi, MetaCapiError } from "@/lib/meta-capi";
import { db } from "@/lib/db";
import { QUEUE_CONFIG } from "@/lib/constants";
import type { MetaEventJob } from "@/lib/queue";
import type { SnippetEventPayload } from "@/types/events";

async function processMetaEvent(job: Job<MetaEventJob>): Promise<void> {
  const {
    workspaceId,
    pixelId,
    accessToken,
    accessTokenIv,
    accessTokenTag,
    testEventCode,
    event,
    eventLogId,
  } = job.data;

  try {
    // 1. Decrypt Meta access token
    const decryptedToken = decrypt(accessToken, accessTokenIv, accessTokenTag);

    // 2. Build SnippetEventPayload for normalizer
    const payload: SnippetEventPayload = {
      eventName: event.eventName,
      eventId: event.eventId,
      timestamp: event.timestamp,
      url: event.url,
      referrer: event.referrer,
      fbp: event.fbp,
      fbc: event.fbc,
      userData: event.userData as SnippetEventPayload["userData"],
      customData: event.customData,
    };

    // 3. Normalize to Meta CAPI format (hashes PII, converts timestamps, etc.)
    const metaCapiEvent = normalizeToMetaCapiEvent(
      payload,
      event.clientIp,
      event.userAgent
    );

    // 4. Send to Meta Conversions API
    const response = await sendToMetaCapi(
      pixelId,
      decryptedToken,
      [metaCapiEvent],
      testEventCode || undefined
    );

    // 5. Update EventLog to SENT
    await db.eventLog.update({
      where: { id: eventLogId },
      data: {
        status: "SENT",
        metaResponse: response as any,
      },
    });

    // 6. Increment workspace forwarded count
    await db.workspace.update({
      where: { id: workspaceId },
      data: {
        eventsForwardedCount: { increment: 1 },
      },
    });

    console.log(`[Worker] Job ${job.id} completed: ${event.eventName} for workspace ${workspaceId}`);
  } catch (error) {
    // Update EventLog to FAILED
    const errorMessage =
      error instanceof MetaCapiError
        ? `Meta CAPI ${error.statusCode}: ${error.message}`
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
        console.error(`[Worker] Failed to update EventLog ${eventLogId}:`, dbErr);
      });

    // Re-throw so BullMQ can retry with exponential backoff
    throw error;
  }
}

// Create worker
const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const worker = new Worker<MetaEventJob>(
  QUEUE_CONFIG.QUEUE_NAME,
  processMetaEvent,
  {
    connection: connection as never,
    concurrency: 10,
    lockDuration: 60000,
  }
);

worker.on("completed", (job) => {
  console.log(`[Worker] Job ${job.id} completed successfully`);
});

worker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err.message);
});

worker.on("error", (err) => {
  console.error("[Worker] Worker error:", err);
});

export { processMetaEvent };
