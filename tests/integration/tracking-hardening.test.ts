import { randomUUID } from "node:crypto";
import { Queue } from "bullmq";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  claimEventDelivery,
  completeEventDeliveryClaim,
  type EventDeliveryClaimResult,
} from "@/lib/event-delivery-guard";
import { enqueueReplayJob, eventReplayJobId } from "@/lib/event-replay-queue";
import {
  checkOrderLimits,
  getOrderCount,
  recoverPurchaseBillingReservationAfterOutboxFailure,
} from "@/lib/billing";
import {
  captureVerifiedShopifyWebhook,
  claimShopifyWebhookInbox,
  completeShopifyWebhookInbox,
  loadShopifyWebhookForReplay,
} from "@/lib/shopify-webhook-inbox";
import {
  clearSessionContextForIdentifiers,
  lookupSessionContextByIdentifiers,
  storeSessionContextForIdentifiers,
} from "@/lib/session-enrichment";
import { cleanDatabase, cleanRedis, disconnectAll } from "./helpers/db";
import { createUser, createWorkspace } from "./helpers/factories";
import { getSafeIntegrationRedisUrl } from "./helpers/safety";

async function retryDeliveryClaim(
  eventLogId: string,
  attempts = 4
): Promise<EventDeliveryClaimResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await claimEventDelivery(eventLogId);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function replayData(eventLogId: string, source: "browser" | "webhook") {
  const canonical = source === "webhook";
  return {
    workspaceId: "workspace-real-queue",
    destination: "TIKTOK",
    eventLogId,
    event: {
      eventName: "Purchase",
      eventId: `purchase-${eventLogId}`,
      timestamp: 1_785_139_200_000,
      url: canonical ? "" : "https://store.example/checkouts/checkout-1",
      referrer: canonical ? "" : "https://store.example/cart",
      fbp: canonical ? null : "fb.1.1785139200000.browser",
      fbc: canonical ? "fb.1.1785139200000.canonical" : null,
      ttclid: canonical ? "ttclid-canonical" : null,
      ttp: null,
      gclid: null,
      rdtCid: null,
      epik: null,
      gaClientId: null,
      userData: canonical
        ? { email: "canonical@example.com" }
        : { phone: "+351900000000" },
      customData: canonical
        ? { value: 42, currency: "EUR", orderName: "1001" }
        : { value: 40, currency: "EUR", browserOnly: true },
      clientIp: canonical ? "" : "203.0.113.10",
      userAgent: canonical ? "" : "IntegrationBrowser/1.0",
    },
  };
}

describe("tracking hardening with real infrastructure", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await cleanRedis();
  });

  afterAll(async () => {
    await disconnectAll();
  });

  it("durably encrypts, claims, completes, and verifies a Shopify webhook receipt", async () => {
    const user = await createUser();
    const workspace = await createWorkspace(user.id);
    const rawBody = Buffer.from(
      JSON.stringify({ id: 1001, email: "buyer@example.com", total_price: "42.00" })
    );

    const [captured] = await captureVerifiedShopifyWebhook({
      workspaceIds: [workspace.id],
      deliveryId: "shopify:integration-delivery-1",
      topic: "orders/paid",
      shopDomain: "integration-store.myshopify.com",
      rawBody,
      occurredAt: new Date("2026-07-27T10:00:00.000Z"),
    });

    const persisted = await db.shopifyWebhookInbox.findUniqueOrThrow({
      where: { id: captured.id },
    });
    expect(persisted.payloadEncrypted).not.toContain("buyer@example.com");
    expect(persisted.payloadEncrypted).not.toBe(rawBody.toString("utf8"));
    await expect(loadShopifyWebhookForReplay(captured.id)).resolves.toMatchObject({
      workspaceId: workspace.id,
      deliveryId: "shopify:integration-delivery-1",
      rawBody,
    });

    const verifiedWorkspace = await db.workspace.findUniqueOrThrow({
      where: { id: workspace.id },
    });
    expect(verifiedWorkspace.shopifyWebhookVerifiedAt).toBeInstanceOf(Date);
    expect(verifiedWorkspace.shopifyWebhookLastReceivedAt).toBeInstanceOf(Date);

    const claim = await claimShopifyWebhookInbox(
      captured.id,
      new Date(Date.now() + 1_000)
    );
    expect(claim).not.toBeNull();
    await completeShopifyWebhookInbox(claim!);

    await expect(
      db.shopifyWebhookInbox.findUniqueOrThrow({ where: { id: captured.id } })
    ).resolves.toMatchObject({
      status: "PROCESSED",
      payloadEncrypted: null,
      payloadIv: null,
      payloadTag: null,
      lockedAt: null,
    });
  });

  it("elects one canonical Purchase owner under real serializable contention", async () => {
    const user = await createUser();
    const workspace = await createWorkspace(user.id);
    const common = {
      workspaceId: workspace.id,
      eventName: "Purchase" as const,
      destination: "META" as const,
      status: "PENDING" as const,
      orderId: "1001",
      orderName: "1001",
      checkoutToken: "checkout-1001",
      cartToken: "cart-1001",
      payload: { customData: { orderName: "1001" } },
    };
    const browser = await db.eventLog.create({
      data: {
        ...common,
        id: "integration-browser-purchase",
        eventId: "shopify-purchase:integration:checkout-1001",
        source: "snippet",
        createdAt: new Date("2026-07-27T09:59:59.000Z"),
      },
    });
    const webhook = await db.eventLog.create({
      data: {
        ...common,
        id: "integration-webhook-purchase",
        eventId: "shopify-purchase:integration:1001",
        source: "webhook",
        createdAt: new Date("2026-07-27T10:00:00.000Z"),
      },
    });

    const raced = await Promise.allSettled([
      claimEventDelivery(browser.id),
      claimEventDelivery(webhook.id),
    ]);
    const resolved: EventDeliveryClaimResult[] = [];
    for (let index = 0; index < raced.length; index += 1) {
      const result = raced[index];
      resolved.push(
        result.status === "fulfilled"
          ? result.value
          : await retryDeliveryClaim(index === 0 ? browser.id : webhook.id)
      );
    }

    const outbound = resolved.filter(
      (result): result is Extract<EventDeliveryClaimResult, { action: "deliver" }> =>
        result.action === "deliver"
    );
    expect(outbound).toHaveLength(1);
    expect(outbound[0].claim.eventLogId).toBe(webhook.id);
    await completeEventDeliveryClaim(outbound[0].claim, { events_received: 1 });

    await expect(claimEventDelivery(browser.id)).resolves.toEqual({ action: "skip" });
    await expect(claimEventDelivery(webhook.id)).resolves.toEqual({ action: "skip" });
    const rows = await db.eventLog.findMany({
      where: { id: { in: [browser.id, webhook.id] } },
      orderBy: { id: "asc" },
      select: { id: true, status: true },
    });
    expect(rows).toEqual([
      { id: browser.id, status: "SUPERSEDED" },
      { id: webhook.id, status: "SENT" },
    ]);
  });

  it("counts twenty concurrent alias-sharing Purchase attempts as one order", async () => {
    const user = await createUser();
    const workspace = await createWorkspace(user.id);

    const decisions = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        checkOrderLimits(user.id, "Purchase", {
          workspaceId: workspace.id,
          eventId:
            index % 2 === 0
              ? `shopify-purchase:${workspace.id}:browser-${index}`
              : `shopify-purchase:${workspace.id}:webhook-${index}`,
          aliases: ["checkout:shared-checkout-1001", "order:1001"],
        })
      )
    );

    expect(decisions.every((decision) => decision.allowed)).toBe(true);
    await expect(getOrderCount(user.id)).resolves.toBe(1);
  });

  it("atomically persists explicit denial across linked Redis identities", async () => {
    const observedAt = Date.now();
    const identifiers = {
      trackclearSessionId: "integration-consent-session",
      email: "consent-integration@example.com",
    };

    await storeSessionContextForIdentifiers("workspace-consent", identifiers, {
      fbp: "fb.1.1785139200000.prior-opt-in",
      clientIp: "203.0.113.20",
      observedAt: observedAt - 1_000,
      consent: { analyticsAllowed: true, marketingAllowed: true },
    });
    await clearSessionContextForIdentifiers("workspace-consent", identifiers, {
      marketing: true,
      analytics: true,
      shared: true,
      observedAt,
    });

    const context = await lookupSessionContextByIdentifiers("workspace-consent", {
      email: identifiers.email,
    });
    expect(context).toMatchObject({
      consent: { analytics: false, marketing: false },
    });
    expect(context?.fbp).toBeUndefined();
    expect(context?.clientIp).toBeUndefined();
  });

  it("retains an explicit Redis denial through the 30-day context window", async () => {
    const denialAt = Date.now() - 29 * 24 * 60 * 60 * 1000;
    const identifiers = { trackclearSessionId: "integration-long-lived-denial" };

    await clearSessionContextForIdentifiers("workspace-consent-retention", identifiers, {
      marketing: true,
      observedAt: denialAt,
    });

    await expect(
      lookupSessionContextByIdentifiers("workspace-consent-retention", identifiers)
    ).resolves.toMatchObject({
      consent: { marketing: false },
      consentTimestamps: { marketing: denialAt },
    });
  });

  it("releases an orphaned usage unit only after proving no aliased outbox exists", async () => {
    const user = await createUser();
    const workspace = await createWorkspace(user.id);
    const identity = {
      workspaceId: workspace.id,
      eventId: `shopify-purchase:${workspace.id}:checkout-orphan`,
      aliases: ["checkout:checkout-orphan", "name:1002"],
    };
    const outboxIdentity = {
      workspaceId: workspace.id,
      eventId: identity.eventId,
      orderName: "1002",
      checkoutToken: "checkout-orphan",
    };

    const orphan = await checkOrderLimits(user.id, "Purchase", identity);
    expect(orphan.reservation).toBeDefined();
    await expect(getOrderCount(user.id)).resolves.toBe(1);
    await expect(
      recoverPurchaseBillingReservationAfterOutboxFailure(
        orphan.reservation!,
        outboxIdentity
      )
    ).resolves.toBe("released");
    await expect(getOrderCount(user.id)).resolves.toBe(0);

    const durable = await checkOrderLimits(user.id, "Purchase", identity);
    expect(durable.reservation).toBeDefined();
    await db.eventLog.create({
      data: {
        workspaceId: workspace.id,
        eventName: "Purchase",
        eventId: `shopify-purchase:${workspace.id}:canonical-1002`,
        status: "PENDING",
        destination: "META",
        source: "webhook",
        orderName: "1002",
        checkoutToken: "checkout-orphan",
      },
    });
    await expect(
      recoverPurchaseBillingReservationAfterOutboxFailure(
        durable.reservation!,
        outboxIdentity
      )
    ).resolves.toBe("outbox-present");
    await expect(getOrderCount(user.id)).resolves.toBe(1);
  });

  it("reuses one deterministic BullMQ job and upgrades its waiting payload", async () => {
    const queueName = `tracking-hardening-${randomUUID()}`;
    const redisUrl = new URL(getSafeIntegrationRedisUrl());
    const queue = new Queue(queueName, {
      connection: {
        host: redisUrl.hostname,
        port: Number(redisUrl.port || 6379),
        db: Number(redisUrl.pathname.replace(/^\//, "")),
        ...(redisUrl.username && { username: redisUrl.username }),
        ...(redisUrl.password && { password: redisUrl.password }),
        maxRetriesPerRequest: null,
      },
    });
    const eventLogId = "real-bullmq-log-1";

    try {
      await queue.waitUntilReady();
      await expect(
        enqueueReplayJob(
          queue,
          "send-tiktok-event",
          eventLogId,
          replayData(eventLogId, "browser")
        )
      ).resolves.toBe("queued");
      await expect(
        enqueueReplayJob(
          queue,
          "send-tiktok-event",
          eventLogId,
          replayData(eventLogId, "webhook"),
          { preferReplayData: true }
        )
      ).resolves.toBe("already-queued");

      expect(await queue.getWaitingCount()).toBe(1);
      const retained = await queue.getJob(eventReplayJobId(eventLogId));
      expect(retained).not.toBeNull();
      expect(retained?.data.event).toMatchObject({
        eventId: `purchase-${eventLogId}`,
        fbc: "fb.1.1785139200000.canonical",
        ttclid: "ttclid-canonical",
        url: "https://store.example/checkouts/checkout-1",
        clientIp: "203.0.113.10",
        userData: {
          email: "canonical@example.com",
          phone: "+351900000000",
        },
        customData: {
          value: 42,
          currency: "EUR",
          orderName: "1001",
          browserOnly: true,
        },
      });
    } finally {
      await queue.obliterate({ force: true }).catch(() => undefined);
      await queue.close();
    }
  });
});
