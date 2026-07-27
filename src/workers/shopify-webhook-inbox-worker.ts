import { createHmac } from "crypto";
import { NextRequest } from "next/server";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { createLogger } from "@/lib/logger";
import {
  listShopifyWebhookReplayCandidates,
  loadShopifyWebhookForReplay,
  deferShopifyWebhookReplayFailure,
  getShopifyWebhookInboxStatus,
  SHOPIFY_WEBHOOK_INBOX_REPLAY_INTERVAL_MS,
} from "@/lib/shopify-webhook-inbox";
import { POST as processShopifyWebhookRequest } from "@/app/api/webhooks/shopify/route";
import {
  WORKER_LOCK_DURATION_MS,
  WORKER_MAX_STALLED_COUNT,
  WORKER_STALLED_INTERVAL_MS,
} from "./worker-options";

const QUEUE_NAME = "shopify-webhook-inbox";
const JOB_NAME = "replay-pending-shopify-webhooks";
const log = createLogger({ component: "shopify-webhook-inbox-worker" });

let connection: IORedis | null = null;
let queue: Queue | null = null;

function getConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    connection.on("error", (error) => {
      log.error("Worker Redis connection error", { queue: QUEUE_NAME, error });
    });
  }
  return connection;
}

function getQueue(): Queue {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: getConnection() as never,
      defaultJobOptions: { attempts: 1, removeOnComplete: 100, removeOnFail: 500 },
    });
  }
  return queue;
}

async function replayShopifyWebhookInbox(id: string): Promise<void> {
  let routeAlreadyDeferred = false;
  try {
    const captured = await loadShopifyWebhookForReplay(id);
    const workspace = await db.workspace.findUnique({
      where: { id: captured.workspaceId },
      select: {
        shopifyWebhookSecretEncrypted: true,
        shopifyWebhookSecretIv: true,
        shopifyWebhookSecretTag: true,
      },
    });

    if (
      !workspace?.shopifyWebhookSecretEncrypted ||
      !workspace.shopifyWebhookSecretIv ||
      !workspace.shopifyWebhookSecretTag
    ) {
      throw new Error("Workspace webhook secret is unavailable for replay");
    }

    const secret = decrypt(
      workspace.shopifyWebhookSecretEncrypted,
      workspace.shopifyWebhookSecretIv,
      workspace.shopifyWebhookSecretTag
    ).trim();
    const hmac = createHmac("sha256", secret).update(captured.rawBody).digest("base64");

    const request = new NextRequest("http://trackclear.internal/api/webhooks/shopify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shopify-hmac-sha256": hmac,
        "x-shopify-topic": captured.topic,
        "x-shopify-shop-domain": captured.shopDomain,
        "x-shopify-webhook-id": captured.deliveryId,
        "x-trackclear-inbox-replay": "1",
        "x-trackclear-inbox-workspace": captured.workspaceId,
      },
      body: captured.rawBody.toString("utf8"),
    });

    const response = await processShopifyWebhookRequest(request);
    const result = await response.json().catch(() => null) as { deferred?: boolean } | null;
    if (response.status >= 400) {
      throw new Error(`Shopify webhook replay returned HTTP ${response.status}`);
    }
    if (result?.deferred) {
      routeAlreadyDeferred = true;
      throw new Error("Shopify webhook replay remains deferred");
    }

    // A live-webhook ignore response is intentionally 200, but an internal
    // replay is only successful when its exact inbox row reached PROCESSED.
    const status = await getShopifyWebhookInboxStatus(id);
    if (status !== "PROCESSED") {
      throw new Error(`Shopify webhook replay did not process inbox row (status: ${status ?? "missing"})`);
    }
  } catch (error) {
    if (!routeAlreadyDeferred) {
      await deferShopifyWebhookReplayFailure(id, error);
    }
    throw error;
  }
}

export async function replayDueShopifyWebhooks(): Promise<{
  candidates: number;
  replayed: number;
  failed: number;
}> {
  const candidates = await listShopifyWebhookReplayCandidates(50);
  if (candidates.length === 0) return { candidates: 0, replayed: 0, failed: 0 };

  const results = await Promise.allSettled(
    candidates.map(({ id }) => replayShopifyWebhookInbox(id))
  );
  const replayed = results.filter((result) => result.status === "fulfilled").length;
  const failed = results.length - replayed;

  log.info("Shopify webhook inbox replay cycle complete", {
    candidates: candidates.length,
    replayed,
    failed,
  });
  return { candidates: candidates.length, replayed, failed };
}

export async function scheduleShopifyWebhookInboxReplay(): Promise<void> {
  const replayQueue = getQueue();
  const repeatableJobs = await replayQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === JOB_NAME) await replayQueue.removeRepeatableByKey(job.key);
  }

  await replayQueue.add(JOB_NAME, {}, {
    repeat: { every: SHOPIFY_WEBHOOK_INBOX_REPLAY_INTERVAL_MS },
  });
  log.info("Repeatable Shopify webhook inbox replay scheduled", { interval: "1min" });
}

export const shopifyWebhookInboxWorker = new Worker(
  QUEUE_NAME,
  replayDueShopifyWebhooks,
  {
    connection: getConnection() as never,
    autorun: false,
    concurrency: 1,
    lockDuration: WORKER_LOCK_DURATION_MS,
    stalledInterval: WORKER_STALLED_INTERVAL_MS,
    maxStalledCount: WORKER_MAX_STALLED_COUNT,
  }
);

shopifyWebhookInboxWorker.on("failed", (job, error) => {
  log.error("Shopify webhook inbox replay job failed", {
    jobId: job?.id,
    attemptsMade: job?.attemptsMade,
    error,
  });
});

shopifyWebhookInboxWorker.on("error", (error) => {
  log.error("Shopify webhook inbox worker error", { error });
});

shopifyWebhookInboxWorker.on("stalled", (jobId) => {
  log.warn("Shopify webhook inbox replay job stalled", { jobId });
});
