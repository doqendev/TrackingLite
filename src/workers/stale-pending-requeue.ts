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

  // Group by workspace to batch credential lookups
  const byWorkspace = new Map<string, typeof staleEvents>();
  for (const event of staleEvents) {
    const list = byWorkspace.get(event.workspaceId) || [];
    list.push(event);
    byWorkspace.set(event.workspaceId, list);
  }

  let requeued = 0;
  let failed = 0;

  for (const [workspaceId, events] of Array.from(byWorkspace)) {
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
        enableGoogleAds: true,
        googleAdsConversionId: true,
        googleAdsViewContentLabel: true,
        googleAdsAddToCartLabel: true,
        googleAdsCheckoutLabel: true,
        googleAdsPurchaseLabel: true,
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
        where: { id: { in: events.map((e: { id: string }) => e.id) } },
        data: { status: "FAILED", errorMessage: "Workspace inactive or deleted" },
      });
      failed += events.length;
      continue;
    }

    for (const event of events) {
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

        if (event.destination === "META" && workspace.metaAccessTokenEncrypted) {
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
          requeued++;
        } else if (event.destination === "GOOGLE_ADS" && workspace.googleAdsConversionId) {
          await getGoogleQueue().add("send-google-event", {
            workspaceId: workspace.id,
            destination: "GOOGLE_ADS",
            eventLogId: event.id,
            event: { ...eventData, ttclid: null },
            credentials: {
              conversionId: workspace.googleAdsConversionId || "",
              viewContentLabel: workspace.googleAdsViewContentLabel || "",
              addToCartLabel: workspace.googleAdsAddToCartLabel || "",
              checkoutLabel: workspace.googleAdsCheckoutLabel || "",
              purchaseLabel: workspace.googleAdsPurchaseLabel || "",
            },
          } satisfies DestinationEventJob);
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
        console.error(`[StaleRequeue] Failed to requeue event ${event.id}:`, err);
        await db.eventLog.update({
          where: { id: event.id },
          data: { status: "FAILED", errorMessage: "Requeue failed" },
        }).catch(() => {});
        failed++;
      }
    }
  }

  console.log(`[StaleRequeue] Done: ${requeued} requeued, ${failed} marked failed`);
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
