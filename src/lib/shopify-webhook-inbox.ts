import { createHash } from "crypto";
import type { ShopifyWebhookInboxStatus } from "@prisma/client";

// The durable inbox is scanned periodically after the live Shopify request has
// already been acknowledged. Keep the browser Purchase fallback behind at
// least one full scan plus processing jitter so the richer canonical webhook
// normally wins delivery ownership.
export const SHOPIFY_WEBHOOK_INBOX_REPLAY_INTERVAL_MS = 60_000;
export const VERIFIED_WEBHOOK_PURCHASE_GRACE_MS =
  SHOPIFY_WEBHOOK_INBOX_REPLAY_INTERVAL_MS + 30_000;
import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/encryption";
import { invalidateApiKeyCache } from "@/lib/api-key-cache";

const CLAIM_STALE_AFTER_MS = 5 * 60 * 1000;
const RETRY_BASE_DELAY_MS = 5 * 1000;
const RETRY_MAX_DELAY_MS = 15 * 60 * 1000;
export const SHOPIFY_WEBHOOK_PAYLOAD_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type CapturedShopifyWebhook = {
  id: string;
  workspaceId: string;
  deliveryId: string;
  topic: string;
  shopDomain: string;
  occurredAt: Date | null;
  status: ShopifyWebhookInboxStatus;
};

export type ShopifyWebhookInboxClaim = {
  id: string;
  attempts: number;
  lockedAt: Date;
};

type CaptureInput = {
  workspaceIds: string[];
  deliveryId: string;
  topic: string;
  shopDomain: string;
  rawBody: Buffer;
  occurredAt: Date | null;
  recordReceipt?: boolean;
};

function isUniqueConstraintError(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === "P2002";
}

export function buildShopifyWebhookDeliveryId(input: {
  shopifyWebhookId?: string | null;
  topic: string;
  shopDomain: string;
  rawBody: Buffer;
}): string {
  const shopifyWebhookId = input.shopifyWebhookId?.trim();
  if (shopifyWebhookId) {
    if (shopifyWebhookId.startsWith("shopify:") || shopifyWebhookId.startsWith("sha256:")) {
      return shopifyWebhookId.slice(0, 247);
    }
    return `shopify:${shopifyWebhookId.slice(0, 240)}`;
  }

  return `sha256:${createHash("sha256")
    .update(input.topic)
    .update("\n")
    .update(input.shopDomain.toLowerCase())
    .update("\n")
    .update(input.rawBody)
    .digest("hex")}`;
}

export function getShopifyWebhookOccurredAt(
  topic: string,
  payload: Record<string, unknown>
): Date | null {
  const keys = topic === "orders/paid"
    ? ["processed_at", "processedAt", "closed_at", "closedAt", "created_at", "createdAt"]
    : ["created_at", "createdAt", "processed_at", "processedAt"];

  for (const key of keys) {
    const raw = payload[key];
    if (typeof raw !== "string" && typeof raw !== "number" && !(raw instanceof Date)) continue;
    const date = new Date(raw);
    if (Number.isFinite(date.getTime())) return date;
  }

  return null;
}

export async function captureVerifiedShopifyWebhook(
  input: CaptureInput
): Promise<CapturedShopifyWebhook[]> {
  const encryptedPayload = encrypt(input.rawBody.toString("utf8"));
  const captured: CapturedShopifyWebhook[] = [];
  const receivedAt = new Date();

  // Each row is independently durable. If a later workspace write fails, the
  // request returns non-2xx and Shopify retries; already-written rows dedupe.
  for (const workspaceId of Array.from(new Set(input.workspaceIds))) {
    let inbox: CapturedShopifyWebhook | null = null;

    try {
      inbox = await db.shopifyWebhookInbox.create({
        data: {
          workspaceId,
          deliveryId: input.deliveryId,
          topic: input.topic,
          shopDomain: input.shopDomain,
          payloadEncrypted: encryptedPayload.encrypted,
          payloadIv: encryptedPayload.iv,
          payloadTag: encryptedPayload.tag,
          occurredAt: input.occurredAt,
          nextAttemptAt: receivedAt,
        },
        select: {
          id: true,
          workspaceId: true,
          deliveryId: true,
          topic: true,
          shopDomain: true,
          occurredAt: true,
          status: true,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      inbox = await db.shopifyWebhookInbox.findUnique({
        where: { workspaceId_deliveryId: { workspaceId, deliveryId: input.deliveryId } },
        select: {
          id: true,
          workspaceId: true,
          deliveryId: true,
          topic: true,
          shopDomain: true,
          occurredAt: true,
          status: true,
        },
      });
      if (!inbox) throw new Error("Webhook inbox dedup row disappeared");
    }

    if (input.recordReceipt !== false) {
      const workspace = await db.workspace.update({
        where: { id: workspaceId },
        data: {
          // Only the canonical Purchase topic proves that browser Purchase can
          // be suppressed safely. A valid refund hook is not evidence that
          // orders/paid is registered or reachable.
          ...(input.topic === "orders/paid" && { shopifyWebhookVerifiedAt: receivedAt }),
          shopifyWebhookLastReceivedAt: receivedAt,
        },
        select: { apiKey: true },
      });
      // The ingest route caches the verified-webhook gate. Clear it immediately
      // so the first verified live delivery cannot race a stale browser-Purchase
      // decision for another five minutes.
      if (input.topic === "orders/paid") {
        await invalidateApiKeyCache(workspace.apiKey);
      }
    }

    captured.push(inbox);
  }

  return captured;
}

export async function claimShopifyWebhookInbox(
  id: string,
  now = new Date()
): Promise<ShopifyWebhookInboxClaim | null> {
  const staleBefore = new Date(now.getTime() - CLAIM_STALE_AFTER_MS);
  const result = await db.shopifyWebhookInbox.updateMany({
    where: {
      id,
      nextAttemptAt: { lte: now },
      OR: [
        { status: "PENDING", lockedAt: null },
        { status: "PENDING", lockedAt: { lt: staleBefore } },
        { status: "PROCESSING", lockedAt: { lt: staleBefore } },
      ],
    },
    data: {
      status: "PROCESSING",
      lockedAt: now,
      attempts: { increment: 1 },
    },
  });

  if (result.count !== 1) return null;
  const claim = await db.shopifyWebhookInbox.findUnique({
    where: { id },
    select: { id: true, attempts: true, lockedAt: true },
  });
  return claim?.lockedAt ? { ...claim, lockedAt: claim.lockedAt } : null;
}

export async function completeShopifyWebhookInbox(
  claim: ShopifyWebhookInboxClaim
): Promise<void> {
  const result = await db.shopifyWebhookInbox.updateMany({
    where: {
      id: claim.id,
      status: "PROCESSING",
      attempts: claim.attempts,
      lockedAt: claim.lockedAt,
    },
    data: {
      status: "PROCESSED",
      processedAt: new Date(),
      lockedAt: null,
      lastError: null,
      // The delivery ID remains as the idempotency record; raw PII is erased.
      payloadEncrypted: null,
      payloadIv: null,
      payloadTag: null,
    },
  });
  if (result.count !== 1) {
    throw new Error("Shopify webhook inbox claim was lost before completion");
  }
}

export function shopifyWebhookRetryDelayMs(attempts: number): number {
  const exponent = Math.max(0, Math.min(attempts - 1, 16));
  return Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** exponent);
}

export function sanitizeWebhookProcessingError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[REDACTED_PHONE]")
    .slice(0, 2000);
}

export async function deferShopifyWebhookInbox(
  claim: ShopifyWebhookInboxClaim,
  error: unknown
): Promise<void> {
  const result = await db.shopifyWebhookInbox.updateMany({
    where: {
      id: claim.id,
      status: "PROCESSING",
      attempts: claim.attempts,
      lockedAt: claim.lockedAt,
    },
    data: {
      status: "PENDING",
      lockedAt: null,
      nextAttemptAt: new Date(Date.now() + shopifyWebhookRetryDelayMs(claim.attempts)),
      lastError: sanitizeWebhookProcessingError(error),
    },
  });
  if (result.count !== 1) {
    throw new Error("Shopify webhook inbox claim was lost before deferral");
  }
}

/**
 * Back off failures that happen before the normal route can claim/defer a row
 * (for example corrupt ciphertext or a removed workspace secret). This keeps a
 * broken workspace from occupying the oldest global replay window every minute.
 */
export async function deferShopifyWebhookReplayFailure(
  id: string,
  error: unknown,
  now = new Date()
): Promise<void> {
  const inbox = await db.shopifyWebhookInbox.findUnique({
    where: { id },
    select: { attempts: true, status: true },
  });
  if (!inbox || inbox.status === "PROCESSED" || inbox.status === "EXPIRED") return;

  const attempts = inbox.attempts + 1;
  await db.shopifyWebhookInbox.updateMany({
    where: {
      id,
      status: { in: ["PENDING", "PROCESSING"] },
      payloadEncrypted: { not: null },
    },
    data: {
      status: "PENDING",
      attempts,
      lockedAt: null,
      nextAttemptAt: new Date(now.getTime() + shopifyWebhookRetryDelayMs(attempts)),
      lastError: sanitizeWebhookProcessingError(error),
    },
  });
}

export async function getShopifyWebhookInboxStatus(
  id: string
): Promise<ShopifyWebhookInboxStatus | null> {
  const inbox = await db.shopifyWebhookInbox.findUnique({
    where: { id },
    select: { status: true },
  });
  return inbox?.status ?? null;
}

export async function listShopifyWebhookReplayCandidates(
  limit = 50,
  now = new Date()
): Promise<Array<{ id: string }>> {
  const staleBefore = new Date(now.getTime() - CLAIM_STALE_AFTER_MS);
  return db.shopifyWebhookInbox.findMany({
    where: {
      payloadEncrypted: { not: null },
      nextAttemptAt: { lte: now },
      OR: [
        { status: "PENDING" },
        { status: "PROCESSING", lockedAt: { lt: staleBefore } },
      ],
    },
    orderBy: { nextAttemptAt: "asc" },
    take: Math.max(1, Math.min(limit, 200)),
    select: { id: true },
  });
}

export async function loadShopifyWebhookForReplay(id: string): Promise<{
  id: string;
  workspaceId: string;
  deliveryId: string;
  topic: string;
  shopDomain: string;
  rawBody: Buffer;
}> {
  const inbox = await db.shopifyWebhookInbox.findUnique({
    where: { id },
    select: {
      id: true,
      workspaceId: true,
      deliveryId: true,
      topic: true,
      shopDomain: true,
      payloadEncrypted: true,
      payloadIv: true,
      payloadTag: true,
    },
  });

  if (!inbox?.payloadEncrypted || !inbox.payloadIv || !inbox.payloadTag) {
    throw new Error("Webhook inbox payload is unavailable");
  }

  return {
    id: inbox.id,
    workspaceId: inbox.workspaceId,
    deliveryId: inbox.deliveryId,
    topic: inbox.topic,
    shopDomain: inbox.shopDomain,
    rawBody: Buffer.from(decrypt(inbox.payloadEncrypted, inbox.payloadIv, inbox.payloadTag), "utf8"),
  };
}

/**
 * Erase encrypted webhook bodies that could not be processed within the
 * bounded recovery window. The payload-free receipt remains available for a
 * second retention window so operators can diagnose the terminal loss.
 */
export async function expireStaleShopifyWebhookInboxes(
  before = new Date(Date.now() - SHOPIFY_WEBHOOK_PAYLOAD_RETENTION_MS),
  now = new Date()
): Promise<number> {
  const result = await db.shopifyWebhookInbox.updateMany({
    where: {
      status: { in: ["PENDING", "PROCESSING"] },
      createdAt: { lt: before },
      payloadEncrypted: { not: null },
    },
    data: {
      status: "EXPIRED",
      processedAt: now,
      lockedAt: null,
      payloadEncrypted: null,
      payloadIv: null,
      payloadTag: null,
      lastError: "Encrypted webhook payload expired after 30 days of recovery attempts",
    },
  });
  return result.count;
}

export async function cleanupTerminalShopifyWebhookInboxes(
  before = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
): Promise<number> {
  const result = await db.shopifyWebhookInbox.deleteMany({
    where: {
      status: { in: ["PROCESSED", "EXPIRED"] },
      processedAt: { lt: before },
    },
  });
  return result.count;
}
