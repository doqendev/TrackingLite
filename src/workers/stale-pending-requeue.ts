import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { db } from "@/lib/db";
import {
  getEventQueue,
  getGoogleQueue,
  getTiktokQueue,
  getGA4Queue,
  getKlaviyoQueue,
} from "@/lib/queue";
import type { MetaEventJob, DestinationEventJob } from "@/lib/queue";

const QUEUE_NAME = "stale-pending-requeue";
const JOB_NAME = "requeue-stale-pending";
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RETRY_COUNT = 3;
const FAILED_RETRY_DELAY_MS = 15 * 60 * 1000; // 15 minutes

const PERMANENT_FAILURE_MESSAGES = [
  "Workspace inactive or deleted",
  "Destination credentials missing on requeue",
];

let _connection: IORedis | null = null;

function getConnection(): IORedis {
  if (!_connection) {
    _connection = new IORedis(
      process.env.REDIS_URL ?? "redis://localhost:6379",
      { maxRetriesPerRequest: null, lazyConnect: true }
    );
  }
  return _connection;
}

let _queue: Queue | null = null;

function getQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, {
      connection: getConnection() as never,
      defaultJobOptions: { attempts: 1, removeOnComplete: 100, removeOnFail: 500 },
    });
  }
  return _queue;
}

// Shared event type used by both requeue functions
type EventToRequeue = {
  id: string;
  workspaceId: string;
  eventName: string;
  eventId: string;
  destination: string;
  payload: unknown;
  customerIp: string | null;
  userAgent: string | null;
  fbp: string | null;
  fbc: string | null;
  pageUrl: string | null;
  createdAt: Date;
};

type RequeueOptions = {
  incrementRetryCount: boolean;
  logPrefix: string;
};

// Shared routing logic for both PENDING stale requeue and FAILED event retry
async function requeueEvents(
  events: EventToRequeue[],
  options: RequeueOptions
): Promise<{ requeued: number; failed: number }> {
  const { incrementRetryCount, logPrefix } = options;

  // Group by workspace to batch credential lookups
  const byWorkspace = new Map<string, EventToRequeue[]>();
  for (const event of events) {
    const list = byWorkspace.get(event.workspaceId) || [];
    list.push(event);
    byWorkspace.set(event.workspaceId, list);
  }

  let requeued = 0;
  let failed = 0;

  for (const [workspaceId, workspaceEvents] of Array.from(byWorkspace)) {
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        isActive: true,
        metaPixelId: true,
        metaAccessTokenEncrypted: true,
        metaAccessTokenIv: true,
        metaAccessTokenTag: true,
        metaTestEventCode: true,
        enableMeta: true,
        enableGoogleAds: true,
        googleAdsConversionIdEncrypted: true,
        googleAdsConversionIdIv: true,
        googleAdsConversionIdTag: true,
        googleAdsViewContentLabelEncrypted: true,
        googleAdsViewContentLabelIv: true,
        googleAdsViewContentLabelTag: true,
        googleAdsAddToCartLabelEncrypted: true,
        googleAdsAddToCartLabelIv: true,
        googleAdsAddToCartLabelTag: true,
        googleAdsCheckoutLabelEncrypted: true,
        googleAdsCheckoutLabelIv: true,
        googleAdsCheckoutLabelTag: true,
        googleAdsPurchaseLabelEncrypted: true,
        googleAdsPurchaseLabelIv: true,
        googleAdsPurchaseLabelTag: true,
        enableTikTok: true,
        tiktokPixelId: true,
        tiktokAccessTokenEncrypted: true,
        tiktokAccessTokenIv: true,
        tiktokAccessTokenTag: true,
        enableGA4: true,
        ga4MeasurementId: true,
        ga4ApiSecretEncrypted: true,
        ga4ApiSecretIv: true,
        ga4ApiSecretTag: true,
        enableKlaviyo: true,
        klaviyoApiKeyEncrypted: true,
        klaviyoApiKeyIv: true,
        klaviyoApiKeyTag: true,
      },
    });

    if (!workspace || !workspace.isActive) {
      // Mark as FAILED -- workspace deleted or inactive
      await db.eventLog.updateMany({
        where: { id: { in: workspaceEvents.map((e) => e.id) } },
        data: { status: "FAILED", errorMessage: "Workspace inactive or deleted" },
      });
      failed += workspaceEvents.length;
      continue;
    }

    for (const event of workspaceEvents) {
      try {
        const payload = (event.payload as Record<string, unknown>) || {};
        const eventData = {
          eventName: event.eventName,
          eventId: event.eventId,
          timestamp: event.createdAt.getTime(),
          url: event.pageUrl ?? "",
          referrer: "",
          fbp: event.fbp,
          fbc: event.fbc,
          userData: (payload.userData as Record<string, unknown>) || {},
          customData: (payload.customData as Record<string, unknown>) || {},
          clientIp: event.customerIp || "unknown",
          userAgent: event.userAgent || "",
        };

        const retryCountUpdate = incrementRetryCount ? { retryCount: { increment: 1 } } : {};

        if (event.destination === "META" && workspace.enableMeta && workspace.metaAccessTokenEncrypted) {
          await getEventQueue().add("send-meta-event", {
            workspaceId: workspace.id,
            pixelId: workspace.metaPixelId!,
            accessToken: workspace.metaAccessTokenEncrypted!,
            accessTokenIv: workspace.metaAccessTokenIv!,
            accessTokenTag: workspace.metaAccessTokenTag!,
            testEventCode: workspace.metaTestEventCode || undefined,
            event: eventData,
            eventLogId: event.id,
          } satisfies MetaEventJob);
          await db.eventLog.update({
            where: { id: event.id },
            data: { status: "RETRYING", ...retryCountUpdate },
          });
          requeued++;
        } else if (event.destination === "GOOGLE_ADS" && workspace.googleAdsConversionIdEncrypted) {
          await getGoogleQueue().add("send-google-event", {
            workspaceId: workspace.id,
            destination: "GOOGLE_ADS",
            eventLogId: event.id,
            event: { ...eventData, ttclid: null },
            credentials: {
              conversionId: workspace.googleAdsConversionIdEncrypted!,
              conversionIdIv: workspace.googleAdsConversionIdIv!,
              conversionIdTag: workspace.googleAdsConversionIdTag!,
              viewContentLabel: workspace.googleAdsViewContentLabelEncrypted || "",
              viewContentLabelIv: workspace.googleAdsViewContentLabelIv || "",
              viewContentLabelTag: workspace.googleAdsViewContentLabelTag || "",
              addToCartLabel: workspace.googleAdsAddToCartLabelEncrypted || "",
              addToCartLabelIv: workspace.googleAdsAddToCartLabelIv || "",
              addToCartLabelTag: workspace.googleAdsAddToCartLabelTag || "",
              checkoutLabel: workspace.googleAdsCheckoutLabelEncrypted || "",
              checkoutLabelIv: workspace.googleAdsCheckoutLabelIv || "",
              checkoutLabelTag: workspace.googleAdsCheckoutLabelTag || "",
              purchaseLabel: workspace.googleAdsPurchaseLabelEncrypted || "",
              purchaseLabelIv: workspace.googleAdsPurchaseLabelIv || "",
              purchaseLabelTag: workspace.googleAdsPurchaseLabelTag || "",
            },
          } satisfies DestinationEventJob);
          await db.eventLog.update({
            where: { id: event.id },
            data: { status: "RETRYING", ...retryCountUpdate },
          });
          requeued++;
        } else if (event.destination === "TIKTOK" && workspace.tiktokAccessTokenEncrypted) {
          await getTiktokQueue().add("send-tiktok-event", {
            workspaceId: workspace.id,
            destination: "TIKTOK",
            eventLogId: event.id,
            event: { ...eventData, ttclid: null },
            credentials: {
              pixelId: workspace.tiktokPixelId || "",
              accessToken: workspace.tiktokAccessTokenEncrypted!,
              accessTokenIv: workspace.tiktokAccessTokenIv!,
              accessTokenTag: workspace.tiktokAccessTokenTag!,
            },
          } satisfies DestinationEventJob);
          await db.eventLog.update({
            where: { id: event.id },
            data: { status: "RETRYING", ...retryCountUpdate },
          });
          requeued++;
        } else if (event.destination === "GA4" && workspace.ga4ApiSecretEncrypted) {
          await getGA4Queue().add("send-ga4-event", {
            workspaceId: workspace.id,
            destination: "GA4",
            eventLogId: event.id,
            event: { ...eventData, ttclid: null },
            credentials: {
              measurementId: workspace.ga4MeasurementId || "",
              apiSecret: workspace.ga4ApiSecretEncrypted!,
              apiSecretIv: workspace.ga4ApiSecretIv!,
              apiSecretTag: workspace.ga4ApiSecretTag!,
            },
          } satisfies DestinationEventJob);
          await db.eventLog.update({
            where: { id: event.id },
            data: { status: "RETRYING", ...retryCountUpdate },
          });
          requeued++;
        } else if (event.destination === "KLAVIYO" && workspace.klaviyoApiKeyEncrypted) {
          await getKlaviyoQueue().add("send-klaviyo-event", {
            workspaceId: workspace.id,
            destination: "KLAVIYO",
            eventLogId: event.id,
            event: { ...eventData, ttclid: null },
            credentials: {
              apiKey: workspace.klaviyoApiKeyEncrypted!,
              apiKeyIv: workspace.klaviyoApiKeyIv!,
              apiKeyTag: workspace.klaviyoApiKeyTag!,
            },
          } satisfies DestinationEventJob);
          await db.eventLog.update({
            where: { id: event.id },
            data: { status: "RETRYING", ...retryCountUpdate },
          });
          requeued++;
        } else {
          // No credentials for this destination
          await db.eventLog.update({
            where: { id: event.id },
            data: { status: "FAILED", errorMessage: "Destination credentials missing on requeue" },
          });
          failed++;
        }
      } catch (err) {
        console.error(`[${logPrefix}] Failed to requeue event ${event.id}:`, err);
        await db.eventLog.update({
          where: { id: event.id },
          data: { status: "FAILED", errorMessage: "Requeue failed" },
        }).catch(() => {});
        failed++;
      }
    }
  }

  return { requeued, failed };
}

async function requeueStalePending(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);

  const staleEvents = await db.eventLog.findMany({
    where: {
      status: "PENDING",
      createdAt: { lt: cutoff },
    },
    take: 100,
    select: {
      id: true,
      workspaceId: true,
      eventName: true,
      eventId: true,
      destination: true,
      payload: true,
      customerIp: true,
      userAgent: true,
      fbp: true,
      fbc: true,
      pageUrl: true,
      createdAt: true,
    },
  });

  if (staleEvents.length === 0) return;

  console.log(`[StaleRequeue] Found ${staleEvents.length} stale PENDING event(s)`);

  const { requeued, failed } = await requeueEvents(staleEvents, {
    incrementRetryCount: false,
    logPrefix: "StaleRequeue",
  });

  console.log(`[StaleRequeue] Done: ${requeued} requeued, ${failed} marked failed`);
}

async function requeueFailedEvents(): Promise<void> {
  const cutoff = new Date(Date.now() - FAILED_RETRY_DELAY_MS);

  const failedEvents = await db.eventLog.findMany({
    where: {
      status: "FAILED",
      retryCount: { lt: MAX_RETRY_COUNT },
      createdAt: { lt: cutoff },
      errorMessage: {
        notIn: PERMANENT_FAILURE_MESSAGES,
      },
    },
    take: 50,
    select: {
      id: true,
      workspaceId: true,
      eventName: true,
      eventId: true,
      destination: true,
      payload: true,
      customerIp: true,
      userAgent: true,
      fbp: true,
      fbc: true,
      pageUrl: true,
      createdAt: true,
      retryCount: true,
    },
  });

  if (failedEvents.length === 0) return;

  console.log(`[FailedRetry] Found ${failedEvents.length} FAILED event(s) eligible for retry`);

  const { requeued, failed } = await requeueEvents(failedEvents, {
    incrementRetryCount: true,
    logPrefix: "FailedRetry",
  });

  console.log(`[FailedRetry] Done: ${requeued} requeued, ${failed} marked failed`);
}

export async function scheduleStaleRequeue(): Promise<void> {
  const queue = getQueue();

  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === JOB_NAME) {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  await queue.add(JOB_NAME, {}, {
    repeat: { every: 5 * 60 * 1000 }, // every 5 minutes
  });

  console.log("[StaleRequeue] Repeatable stale-pending requeue job scheduled (every 5 min).");
}

export const staleRequeueWorker = new Worker(
  QUEUE_NAME,
  async () => {
    await requeueStalePending();
    await requeueFailedEvents();
  },
  {
    connection: getConnection() as never,
    concurrency: 1,
  }
);

staleRequeueWorker.on("completed", () => {
  // silent on completion unless there was work
});

staleRequeueWorker.on("failed", (_job, err) => {
  console.error("[StaleRequeue] Job failed:", err);
});

staleRequeueWorker.on("error", (err) => {
  console.error("[StaleRequeue] Worker error:", err.message);
});
