import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { db } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import {
  getEventQueue,
  getTiktokQueue,
  getGA4Queue,
  getKlaviyoQueue,
  getRedditQueue,
  getPinterestQueue,
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

const log = createLogger({ component: "stale-requeue" });

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
  ttclid: string | null;
  rdtCid: string | null;
  epik: string | null;
  pageUrl: string | null;
  createdAt: Date;
};

type RequeueOptions = {
  incrementRetryCount: boolean;
  logPrefix: string;
};

// Destination queue routing map
const DEST_QUEUE_MAP: Record<string, { queue: () => Queue; jobName: string }> = {
  META: { queue: getEventQueue, jobName: "send-meta-event" },
  TIKTOK: { queue: getTiktokQueue, jobName: "send-tiktok-event" },
  GA4: { queue: getGA4Queue, jobName: "send-ga4-event" },
  KLAVIYO: { queue: getKlaviyoQueue, jobName: "send-klaviyo-event" },
  REDDIT: { queue: getRedditQueue, jobName: "send-reddit-event" },
  PINTEREST: { queue: getPinterestQueue, jobName: "send-pinterest-event" },
};

function checkWorkspaceHasDestinationCredentials(
  workspace: Record<string, unknown>,
  destination: string
): boolean {
  switch (destination) {
    case "META":
      return !!(workspace.enableMeta && workspace.metaAccessTokenEncrypted);
    case "REDDIT":
      return !!workspace.redditAccessTokenEncrypted;
    case "PINTEREST":
      return !!workspace.pinterestConversionTokenEncrypted;
    case "TIKTOK":
      return !!workspace.tiktokAccessTokenEncrypted;
    case "GA4":
      return !!workspace.ga4ApiSecretEncrypted;
    case "KLAVIYO":
      return !!workspace.klaviyoApiKeyEncrypted;
    default:
      return false;
  }
}

// Shared routing logic for both PENDING stale requeue and FAILED event retry
// Workers look up credentials from DB themselves; we only pass workspaceId + event data
async function requeueEvents(
  events: EventToRequeue[],
  options: RequeueOptions
): Promise<{ requeued: number; failed: number }> {
  const { incrementRetryCount } = options;

  // Group by workspace to batch workspace lookups
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
        enableMeta: true,
        metaAccessTokenEncrypted: true,
        tiktokAccessTokenEncrypted: true,
        ga4ApiSecretEncrypted: true,
        klaviyoApiKeyEncrypted: true,
        redditAccessTokenEncrypted: true,
        pinterestConversionTokenEncrypted: true,
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

        const destConfig = DEST_QUEUE_MAP[event.destination];
        if (!destConfig) {
          await db.eventLog.update({
            where: { id: event.id },
            data: { status: "FAILED", errorMessage: "Unknown destination" },
          });
          failed++;
          continue;
        }

        // Check workspace has credentials for this destination (basic check)
        const hasCredentials = checkWorkspaceHasDestinationCredentials(
          workspace as unknown as Record<string, unknown>,
          event.destination
        );
        if (!hasCredentials) {
          await db.eventLog.update({
            where: { id: event.id },
            data: { status: "FAILED", errorMessage: "Destination credentials missing on requeue" },
          });
          failed++;
          continue;
        }

        if (event.destination === "META") {
          await destConfig.queue().add(destConfig.jobName, {
            workspaceId: workspace.id,
            event: eventData,
            eventLogId: event.id,
          } satisfies MetaEventJob);
        } else {
          await destConfig.queue().add(destConfig.jobName, {
            workspaceId: workspace.id,
            destination: event.destination,
            eventLogId: event.id,
            event: { ...eventData, ttclid: event.ttclid || null, gclid: null, rdtCid: event.rdtCid || null, epik: event.epik || null },
          } satisfies DestinationEventJob);
        }

        await db.eventLog.update({
          where: { id: event.id },
          data: { status: "RETRYING", ...retryCountUpdate },
        });
        requeued++;
      } catch (err) {
        log.error("Failed to requeue event", { eventId: event.id, error: err instanceof Error ? err.message : String(err) });
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
      ttclid: true,
      rdtCid: true,
      epik: true,
      pageUrl: true,
      createdAt: true,
    },
  });

  if (staleEvents.length === 0) return;

  log.info("Found stale PENDING events", { count: staleEvents.length });

  const { requeued, failed } = await requeueEvents(staleEvents, {
    incrementRetryCount: false,
    logPrefix: "StaleRequeue",
  });

  log.info("Stale requeue complete", { requeued, failed });
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
      ttclid: true,
      rdtCid: true,
      epik: true,
      pageUrl: true,
      createdAt: true,
      retryCount: true,
    },
  });

  if (failedEvents.length === 0) return;

  log.info("Found FAILED events eligible for retry", { count: failedEvents.length });

  const { requeued, failed } = await requeueEvents(failedEvents, {
    incrementRetryCount: true,
    logPrefix: "FailedRetry",
  });

  log.info("Failed retry complete", { requeued, failed });
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

  log.info("Repeatable stale-pending requeue job scheduled", { interval: "5min" });
}

async function cleanupDlq(): Promise<void> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    await db.webhookDeadLetter.deleteMany({
      where: {
        OR: [
          { resolvedAt: { not: null }, createdAt: { lt: thirtyDaysAgo } },
          { resolvedAt: null, createdAt: { lt: ninetyDaysAgo } },
        ],
      },
    });
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "DLQ cleanup failed", error: err instanceof Error ? err.message : String(err) }));
  }
}

export const staleRequeueWorker = new Worker(
  QUEUE_NAME,
  async () => {
    await requeueStalePending();
    await requeueFailedEvents();
    await cleanupDlq();
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
  log.error("Job failed", { error: err instanceof Error ? err.message : String(err) });
});

staleRequeueWorker.on("error", (err) => {
  log.error("Worker error", { error: err.message });
});
