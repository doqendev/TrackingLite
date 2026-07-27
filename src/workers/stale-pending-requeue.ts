import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { db } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import {
  reconcilePurchaseBillingState,
  type PurchaseBillingIdentity,
} from "@/lib/billing";
import { buildPurchaseBillingAliases } from "@/lib/purchase-event-id";
import {
  getEventQueue,
  getTiktokQueue,
  getGA4Queue,
  getKlaviyoQueue,
  getRedditQueue,
  getPinterestQueue,
  getGoogleAdsQueue,
} from "@/lib/queue";
import type { MetaEventJob, DestinationEventJob } from "@/lib/queue";
import { getAllowedDestinationsForWorkspace } from "@/lib/workspace-mode";
import {
  enqueueReplayJob,
  type ReplayJobData,
} from "@/lib/event-replay-queue";
import {
  clearedEventRetryEnvelope,
  decryptEventRetryEnvelope,
  type EventRetryEnvelope,
} from "@/lib/event-retry-envelope";
import { WORKER_LOCK_DURATION_MS, WORKER_MAX_STALLED_COUNT, WORKER_STALLED_INTERVAL_MS } from "./worker-options";

const QUEUE_NAME = "stale-pending-requeue";
const JOB_NAME = "requeue-stale-pending";
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
// BullMQ already makes three immediate attempts. Allow three additional
// 15-minute replay cycles only for failures that look transient/upstream.
const MAX_AUTOMATIC_RETRY_COUNT = 12;

const PERMANENT_FAILURE_MESSAGES = [
  "Workspace inactive or deleted",
  "Unknown destination",
  "Destination disabled or credentials missing on requeue",
  "Destination credentials missing on requeue",
  "Destination not allowed for workspace mode",
];

const log = createLogger({ component: "stale-requeue" });

export type PurchaseBillingReconciliationRow = {
  workspaceId: string;
  eventId: string;
  orderId: string | null;
  orderName: string | null;
  checkoutToken: string | null;
  cartToken: string | null;
};

/**
 * Collapse destination fan-out rows and browser/webhook Purchase variants into
 * one billing identity per real order. Connections are transitive: for example,
 * a checkout-token-only browser row can join a webhook row through an
 * intermediate row that knows both checkout token and order ID. Alias kinds do
 * not collide with each other, and workspaces are always isolated.
 */
export function groupConnectedPurchaseBillingIdentities(
  rows: PurchaseBillingReconciliationRow[]
): PurchaseBillingIdentity[] {
  if (rows.length === 0) return [];

  const parents = rows.map((_, index) => index);
  const ranks = rows.map(() => 0);
  const find = (index: number): number => {
    let root = index;
    while (parents[root] !== root) root = parents[root];
    while (parents[index] !== index) {
      const next = parents[index];
      parents[index] = root;
      index = next;
    }
    return root;
  };
  const union = (left: number, right: number): void => {
    let leftRoot = find(left);
    let rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    if (ranks[leftRoot] < ranks[rightRoot]) {
      [leftRoot, rightRoot] = [rightRoot, leftRoot];
    }
    parents[rightRoot] = leftRoot;
    if (ranks[leftRoot] === ranks[rightRoot]) ranks[leftRoot]++;
  };

  const identityOwner = new Map<string, number>();
  const normalizedRows = rows.map((row) => {
    const eventId = row.eventId.trim();
    const aliases = buildPurchaseBillingAliases({
      workspaceId: row.workspaceId,
      shopifyOrderId: row.orderId,
      orderName: row.orderName,
      checkoutToken: row.checkoutToken,
      cartToken: row.cartToken,
    });
    return { row, eventId, aliases };
  });

  normalizedRows.forEach(({ row, eventId, aliases }, index) => {
    // Use the exact raw strings hashed by purchaseBillingKeys. Shopify aliases
    // already carry their kind prefix (order:/name:/checkout:/cart:), so this
    // both isolates unlike alias kinds and mirrors live Redis marker equality.
    const tokens = [...(eventId ? [eventId] : []), ...aliases];
    for (const token of tokens) {
      const workspaceToken = `${row.workspaceId}\u0000${token}`;
      const owner = identityOwner.get(workspaceToken);
      if (owner === undefined) identityOwner.set(workspaceToken, index);
      else union(index, owner);
    }
  });

  const components = new Map<
    number,
    { workspaceId: string; eventIds: Set<string>; aliases: Set<string> }
  >();
  normalizedRows.forEach(({ row, eventId, aliases }, index) => {
    const root = find(index);
    const component = components.get(root) ?? {
      workspaceId: row.workspaceId,
      eventIds: new Set<string>(),
      aliases: new Set<string>(),
    };
    if (eventId) component.eventIds.add(eventId);
    for (const alias of aliases) component.aliases.add(alias);
    components.set(root, component);
  });

  return Array.from(components.values())
    .map(({ workspaceId, eventIds, aliases }) => {
      const sortedEventIds = Array.from(eventIds).sort();
      const sortedAliases = Array.from(aliases).sort();
      // EventLog.eventId is required. Keeping this guard makes malformed data
      // fail closed instead of manufacturing a marker that live reservations
      // could never match.
      if (sortedEventIds.length === 0) {
        throw new Error("Purchase billing reconciliation row is missing eventId");
      }
      return {
        workspaceId,
        eventId: sortedEventIds[0],
        aliases: Array.from(
          new Set([...sortedEventIds.slice(1), ...sortedAliases])
        ),
      };
    })
    .sort(
      (left, right) =>
        left.workspaceId.localeCompare(right.workspaceId) ||
        left.eventId.localeCompare(right.eventId)
    );
}

let _connection: IORedis | null = null;

function getConnection(): IORedis {
  if (!_connection) {
    _connection = new IORedis(
      process.env.REDIS_URL ?? "redis://localhost:6379",
      { maxRetriesPerRequest: null, lazyConnect: true }
    );
    _connection.on("error", (err) => {
      log.error("Worker Redis connection error", { error: err, queue: QUEUE_NAME });
    });
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
  gclid: string | null;
  rdtCid: string | null;
  epik: string | null;
  pageUrl: string | null;
  createdAt: Date;
  retryCount: number;
  lastAttemptAt: Date | null;
  nextRetryAt: Date | null;
  errorMessage?: string | null;
  retryPayloadEncrypted: string | null;
  retryPayloadIv: string | null;
  retryPayloadTag: string | null;
  retryPayloadExpiresAt: Date | null;
};

type RequeueOptions = {
  expectedStatus: "PENDING" | "FAILED" | "RETRYING";
  logPrefix: string;
};

export function isRetryableDeliveryFailure(errorMessage: string | null | undefined): boolean {
  if (!errorMessage) return false;
  const message = errorMessage.toLowerCase();
  if (/\b(?:408|425|429|5\d\d)\b/.test(message)) return true;
  return [
    "circuit breaker open",
    "connection reset",
    "connection refused",
    "eai_again",
    "econn",
    "fetch failed",
    "network",
    "requeue failed",
    "socket hang up",
    "temporarily unavailable",
    "timed out",
    "timeout",
  ].some((fragment) => message.includes(fragment));
}

// Destination queue routing map
const DEST_QUEUE_MAP: Record<string, { queue: () => Queue; jobName: string }> = {
  META: { queue: getEventQueue, jobName: "send-meta-event" },
  TIKTOK: { queue: getTiktokQueue, jobName: "send-tiktok-event" },
  GA4: { queue: getGA4Queue, jobName: "send-ga4-event" },
  KLAVIYO: { queue: getKlaviyoQueue, jobName: "send-klaviyo-event" },
  REDDIT: { queue: getRedditQueue, jobName: "send-reddit-event" },
  PINTEREST: { queue: getPinterestQueue, jobName: "send-pinterest-event" },
  GOOGLE_ADS: { queue: getGoogleAdsQueue, jobName: "send-google-ads-event" },
};

function checkWorkspaceHasDestinationCredentials(
  workspace: Record<string, unknown>,
  destination: string
): boolean {
  switch (destination) {
    case "META":
      return !!(workspace.enableMeta && workspace.metaAccessTokenEncrypted);
    case "TIKTOK":
      return !!(workspace.enableTikTok && workspace.tiktokAccessTokenEncrypted);
    case "GA4":
      return !!(workspace.enableGA4 && workspace.ga4ApiSecretEncrypted);
    case "KLAVIYO":
      return !!(workspace.enableKlaviyo && workspace.klaviyoApiKeyEncrypted);
    case "REDDIT":
      return !!(workspace.enableReddit && workspace.redditAccessTokenEncrypted);
    case "PINTEREST":
      return !!(workspace.enablePinterest && workspace.pinterestConversionTokenEncrypted);
    case "GOOGLE_ADS":
      return !!(workspace.enableGoogleAds && workspace.googleAdsConversionId);
    default:
      return false;
  }
}

// Shared routing logic for both PENDING stale requeue and FAILED event retry
// Workers look up credentials from DB themselves; we only pass workspaceId + event data
export async function requeueEvents(
  events: EventToRequeue[],
  options: RequeueOptions
): Promise<{ requeued: number; failed: number }> {
  const { expectedStatus, logPrefix } = options;

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
        productMode: true,
        installType: true,
        enableMeta: true,
        metaAccessTokenEncrypted: true,
        enableTikTok: true,
        tiktokAccessTokenEncrypted: true,
        enableGA4: true,
        ga4ApiSecretEncrypted: true,
        enableKlaviyo: true,
        klaviyoApiKeyEncrypted: true,
        enableReddit: true,
        redditAccessTokenEncrypted: true,
        enablePinterest: true,
        pinterestConversionTokenEncrypted: true,
        enableGoogleAds: true,
        googleAdsConversionId: true,
      },
    });

    if (!workspace || !workspace.isActive) {
      // Mark as FAILED -- workspace deleted or inactive
      for (const event of workspaceEvents) {
        const result = await db.eventLog.updateMany({
          where: {
            id: event.id,
            status: expectedStatus,
            retryCount: event.retryCount,
          },
          data: {
            status: "FAILED",
            errorMessage: "Workspace inactive or deleted",
            nextRetryAt: null,
            ...clearedEventRetryEnvelope(),
          },
        });
        failed += result.count;
      }
      continue;
    }

    const allowedDestinations = new Set<string>(getAllowedDestinationsForWorkspace(workspace));

    for (const event of workspaceEvents) {
      let claimed = false;
      const nextRetryCount = expectedStatus === "RETRYING"
        ? event.retryCount
        : event.retryCount + 1;
      try {
        const destConfig = DEST_QUEUE_MAP[event.destination];
        if (!destConfig) {
          const result = await db.eventLog.updateMany({
            where: {
              id: event.id,
              status: expectedStatus,
              retryCount: event.retryCount,
            },
            data: {
              status: "FAILED",
              errorMessage: "Unknown destination",
              nextRetryAt: null,
              ...clearedEventRetryEnvelope(),
            },
          });
          failed += result.count;
          continue;
        }

        if (!allowedDestinations.has(event.destination)) {
          const result = await db.eventLog.updateMany({
            where: {
              id: event.id,
              status: expectedStatus,
              retryCount: event.retryCount,
            },
            data: {
              status: "FAILED",
              errorMessage: "Destination not allowed for workspace mode",
              nextRetryAt: null,
              ...clearedEventRetryEnvelope(),
            },
          });
          failed += result.count;
          continue;
        }

        // A destination must still be enabled and configured when it is replayed.
        const hasCredentials = checkWorkspaceHasDestinationCredentials(
          workspace as unknown as Record<string, unknown>,
          event.destination
        );
        if (!hasCredentials) {
          const result = await db.eventLog.updateMany({
            where: {
              id: event.id,
              status: expectedStatus,
              retryCount: event.retryCount,
            },
            data: {
              status: "FAILED",
              errorMessage: "Destination disabled or credentials missing on requeue",
              nextRetryAt: null,
              ...clearedEventRetryEnvelope(),
            },
          });
          failed += result.count;
          continue;
        }

        // Claim before touching BullMQ. Concurrent automatic/manual replays can
        // only queue the event when they win this status+retryCount compare-and-set.
        const claimTime = new Date();
        const claim = await db.eventLog.updateMany({
          where: {
            id: event.id,
            status: expectedStatus,
            retryCount: event.retryCount,
          },
          data: {
            status: "RETRYING",
            errorMessage: null,
            retryCount: nextRetryCount,
            lastAttemptAt: claimTime,
            nextRetryAt: null,
          },
        });
        if (claim.count !== 1) continue;
        claimed = true;

        const payload = (event.payload as Record<string, unknown>) || {};
        const legacyEventData: EventRetryEnvelope["event"] = {
          eventName: event.eventName,
          eventId: event.eventId,
          timestamp: event.createdAt.getTime(),
          url: event.pageUrl ?? "",
          referrer: "",
          fbp: event.fbp,
          fbc: event.fbc,
          ttclid: event.ttclid,
          gclid: event.gclid,
          rdtCid: event.rdtCid,
          epik: event.epik,
          userData: (payload.userData as Record<string, unknown>) || {},
          customData: (payload.customData as Record<string, unknown>) || {},
          clientIp: event.customerIp || "unknown",
          userAgent: event.userAgent || "",
        };
        const retryEnvelope = decryptEventRetryEnvelope(event);
        const eventData =
          retryEnvelope?.event.eventId === event.eventId &&
          retryEnvelope.event.eventName === event.eventName
            ? retryEnvelope.event
            : legacyEventData;

        let jobData: ReplayJobData;
        if (event.destination === "META") {
          jobData = {
            workspaceId: workspace.id,
            event: eventData,
            eventLogId: event.id,
          } satisfies MetaEventJob;
        } else {
          jobData = {
            workspaceId: workspace.id,
            destination: event.destination,
            eventLogId: event.id,
            event: {
              ...eventData,
              ttclid: event.ttclid ?? eventData.ttclid ?? null,
              gclid: event.gclid ?? eventData.gclid ?? null,
              rdtCid: event.rdtCid ?? eventData.rdtCid ?? null,
              epik: event.epik ?? eventData.epik ?? null,
            },
          } satisfies DestinationEventJob;
        }

        const enqueueResult = await enqueueReplayJob(
          destConfig.queue(),
          destConfig.jobName,
          event.id,
          jobData
        );

        if (enqueueResult === "completed") {
          // BullMQ retention can outlive a stale database status. A completed job
          // is proof the processor returned successfully; never duplicate it.
          await db.eventLog.updateMany({
            where: {
              id: event.id,
              status: "RETRYING",
              retryCount: nextRetryCount,
            },
            data: {
              status: "SENT",
              errorMessage: null,
              nextRetryAt: null,
              ...clearedEventRetryEnvelope(),
            },
          });
          log.info(`${logPrefix} found retained completed job`, { eventLogId: event.id });
          continue;
        }

        if (enqueueResult === "active") {
          log.info(`${logPrefix} found active retained job; deferring reconciliation`, {
            eventLogId: event.id,
          });
          continue;
        }

        requeued++;
      } catch (err) {
        log.error("Failed to requeue event", { eventId: event.id, error: err });
        if (claimed) {
          // Move queue failures onto the scheduled retry cursor instead of
          // restoring an already-due row. Deterministic job IDs make this safe
          // even if queue.add succeeded but its response was lost, and the
          // backoff prevents a broken oldest row from starving newer events.
          const failedAt = new Date();
          await db.eventLog.updateMany({
            where: {
              id: event.id,
              status: "RETRYING",
              retryCount: nextRetryCount,
            },
            data: {
              status: "FAILED",
              retryCount: nextRetryCount,
              errorMessage: "Requeue failed",
              lastAttemptAt: failedAt,
              nextRetryAt: new Date(failedAt.getTime() + 15 * 60 * 1000),
            },
          }).catch(() => {});
        }
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
      gclid: true,
      rdtCid: true,
      epik: true,
      pageUrl: true,
      createdAt: true,
      retryCount: true,
      lastAttemptAt: true,
      nextRetryAt: true,
      retryPayloadEncrypted: true,
      retryPayloadIv: true,
      retryPayloadTag: true,
      retryPayloadExpiresAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (staleEvents.length === 0) return;

  log.info("Found stale PENDING events", { count: staleEvents.length });

  const { requeued, failed } = await requeueEvents(staleEvents, {
    expectedStatus: "PENDING",
    logPrefix: "StaleRequeue",
  });

  log.info("Stale requeue complete", { requeued, failed });
}

async function requeueFailedEvents(): Promise<void> {
  const now = new Date();

  const scheduledFailedEvents = await db.eventLog.findMany({
    where: {
      status: "FAILED",
      retryCount: { lt: MAX_AUTOMATIC_RETRY_COUNT },
      nextRetryAt: { lte: now },
      errorMessage: {
        notIn: PERMANENT_FAILURE_MESSAGES,
      },
    },
    take: 50,
    orderBy: [{ nextRetryAt: "asc" }, { createdAt: "asc" }],
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
      gclid: true,
      rdtCid: true,
      epik: true,
      pageUrl: true,
      createdAt: true,
      retryCount: true,
      lastAttemptAt: true,
      nextRetryAt: true,
      errorMessage: true,
      retryPayloadEncrypted: true,
      retryPayloadIv: true,
      retryPayloadTag: true,
      retryPayloadExpiresAt: true,
    },
  });
  if (scheduledFailedEvents.length === 0) return;

  log.info("Found FAILED events eligible for retry", {
    count: scheduledFailedEvents.length,
  });

  const { requeued, failed } = await requeueEvents(scheduledFailedEvents, {
    expectedStatus: "FAILED",
    logPrefix: "FailedRetry",
  });

  log.info("Failed retry complete", { requeued, failed });
}

async function requeueStaleRetrying(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS * 2);
  const staleRetrying = await db.eventLog.findMany({
    where: {
      status: "RETRYING",
      OR: [
        { lastAttemptAt: { lt: cutoff } },
        { lastAttemptAt: null, createdAt: { lt: cutoff } },
      ],
    },
    take: 100,
    orderBy: [{ lastAttemptAt: "asc" }, { createdAt: "asc" }],
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
      gclid: true,
      rdtCid: true,
      epik: true,
      pageUrl: true,
      createdAt: true,
      retryCount: true,
      lastAttemptAt: true,
      nextRetryAt: true,
      errorMessage: true,
      retryPayloadEncrypted: true,
      retryPayloadIv: true,
      retryPayloadTag: true,
      retryPayloadExpiresAt: true,
    },
  });
  if (staleRetrying.length === 0) return;

  const { requeued, failed } = await requeueEvents(staleRetrying, {
    expectedStatus: "RETRYING",
    logPrefix: "RetryingRecovery",
  });
  log.info("Stale RETRYING recovery complete", { requeued, failed });
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

export async function reconcileOrderCounts(): Promise<void> {
  const now = new Date();
  const monthKey = now.toISOString().slice(0, 7); // YYYY-MM
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  // Purchase rows are the source of truth for reconciliation. In particular,
  // normal FREE users do not necessarily have a Subscription row until they
  // visit Stripe, so subscription enumeration silently skipped their counters
  // and dedup markers after Redis loss.
  const purchases = await db.eventLog.findMany({
    where: {
      eventName: "Purchase",
      status: { not: "SUPERSEDED" },
      createdAt: { gte: monthStart },
    },
    select: {
      workspaceId: true,
      workspace: { select: { userId: true } },
      eventId: true,
      orderId: true,
      orderName: true,
      checkoutToken: true,
      cartToken: true,
    },
  });

  const purchasesByUser = new Map<string, PurchaseBillingReconciliationRow[]>();
  for (const { workspace, ...purchase } of purchases) {
    const userPurchases = purchasesByUser.get(workspace.userId) ?? [];
    userPurchases.push(purchase);
    purchasesByUser.set(workspace.userId, userPurchases);
  }

  for (const [userId, userPurchases] of Array.from(purchasesByUser)) {
    try {
      // Destination fan-out shares event IDs, while browser fallback and
      // canonical webhook rows can use different IDs for the same Shopify
      // order. Load every durable alias and collapse the connected identity
      // graph before repairing Redis.
      const identities = groupConnectedPurchaseBillingIdentities(userPurchases);
      if (identities.length === 0) continue;

      const reconciliation = await reconcilePurchaseBillingState(
        userId,
        monthKey,
        identities
      );
      if (reconciliation.reconciledCount !== reconciliation.previousCount) {
        log.info("Order count and identity markers reconciled", {
          userId,
          previousCount: reconciliation.previousCount,
          reconciledCount: reconciliation.reconciledCount,
          durableOrders: identities.length,
          markerCount: reconciliation.markerCount,
        });
      }
    } catch (err) {
      log.error("Order count reconciliation failed", { userId, error: err });
    }
  }
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
    log.error("DLQ cleanup failed", { error: err });
  }
}

// Run reconciliation once per hour (every 12th cycle of the 5-minute job)
const RECONCILE_INTERVAL = 12;
let reconcileCycle = 0;

export const staleRequeueWorker = new Worker(
  QUEUE_NAME,
  async () => {
    await requeueStalePending();
    await requeueStaleRetrying();
    await requeueFailedEvents();
    await cleanupDlq();

    reconcileCycle++;
    if (reconcileCycle >= RECONCILE_INTERVAL) {
      reconcileCycle = 0;
      await reconcileOrderCounts();
    }
  },
  {
    connection: getConnection() as never,
    autorun: false,
    concurrency: 1,
    lockDuration: WORKER_LOCK_DURATION_MS,
    stalledInterval: WORKER_STALLED_INTERVAL_MS,
    maxStalledCount: WORKER_MAX_STALLED_COUNT,
  }
);

staleRequeueWorker.on("completed", () => {
  // silent on completion unless there was work
});

staleRequeueWorker.on("failed", (job, err) => {
  log.error("Job failed", {
    queue: QUEUE_NAME,
    jobId: job?.id,
    jobName: job?.name,
    attemptsMade: job?.attemptsMade,
    attempts: job?.opts?.attempts,
    error: err,
  });
});

staleRequeueWorker.on("error", (err) => {
  log.error("Worker error", { error: err, queue: QUEUE_NAME });
});

staleRequeueWorker.on("stalled", (jobId) => {
  log.warn("Job stalled", { queue: QUEUE_NAME, jobId });
});
