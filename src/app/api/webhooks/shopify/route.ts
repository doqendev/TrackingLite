import { NextRequest, NextResponse } from "next/server";
import type { EventName } from "@prisma/client";
import { createLogger } from "@/lib/logger";
import { db } from "@/lib/db";
import { verifyShopifyWebhook } from "@/lib/shopify-webhook";
import { decrypt } from "@/lib/encryption";
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
import {
  checkOrderLimits,
  decrementOrderCount,
  recoverPurchaseBillingReservationAfterOutboxFailure,
  type PurchaseBillingReservation,
} from "@/lib/billing";
import { lookupSessionContextByIdentifiers, type SessionContext } from "@/lib/session-enrichment";
import { getSharedRedis } from "@/lib/redis";
import { DESTINATION_EVENT_MAP } from "@/lib/destinations";
import {
  buildLineItemContentIds,
  buildLineItemContents,
  buildOrderAttribution,
  extractLandingSiteAttribution,
  normalizeLandingPageUrl,
  resolveNewestConsentValue,
} from "@/lib/shopify-webhook-attribution";
import { filterDestinationsForWorkspace } from "@/lib/workspace-mode";
import {
  buildPurchaseBillingAliases,
  buildPurchaseEventId,
  normalizePurchaseIdentifier,
} from "@/lib/purchase-event-id";
import { contentIdOptionsFromWorkspace } from "@/lib/content-id";
import type { Queue } from "bullmq";
import {
  clearedEventRetryEnvelope,
  encryptEventRetryEnvelope,
} from "@/lib/event-retry-envelope";
import {
  enqueueReplayJob,
  eventReplayJobId,
} from "@/lib/event-replay-queue";
import { shouldSendToDestination } from "@/lib/consent";
import {
  clearedEventDeliveryClaim,
  reserveEventDeliveriesForWebhook,
} from "@/lib/event-delivery-guard";
import {
  buildShopifyWebhookDeliveryId,
  captureVerifiedShopifyWebhook,
  claimShopifyWebhookInbox,
  completeShopifyWebhookInbox,
  deferShopifyWebhookInbox,
  getShopifyWebhookOccurredAt,
  sanitizeWebhookProcessingError,
  type CapturedShopifyWebhook,
  type ShopifyWebhookInboxClaim,
} from "@/lib/shopify-webhook-inbox";

const log = createLogger({ component: "shopify-webhook" });

function firstString(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function hasAnyValue(values: Array<string | null | undefined>): boolean {
  return values.some((value) => typeof value === "string" && value.trim().length > 0);
}

function preserveUsefulEventLogColumns(
  input: Record<string, unknown>
): Record<string, unknown> {
  // Canonical commerce fields must replace browser estimates, including an
  // intentional null. Optional identity/context fields only replace a reused
  // snippet row when the webhook actually recovered a useful value.
  const canonicalFields = new Set([
    "payload",
    "value",
    "currency",
    "numItems",
    "orderId",
    "source",
    "paymentGateway",
    "pageUrl",
  ]);
  return Object.fromEntries(
    Object.entries(input).filter(([key, value]) => {
      if (canonicalFields.has(key)) return true;
      if (value === null || value === undefined || value === "") return false;
      return true;
    })
  );
}

function attributionSourcesForPurchase(input: {
  orderAttribution: ReturnType<typeof buildOrderAttribution>;
  sessionContext: SessionContext | null;
  landingAttribution: ReturnType<typeof extractLandingSiteAttribution>;
}): string[] {
  const sources: string[] = [];

  if (
    hasAnyValue([
      input.orderAttribution.fbp,
      input.orderAttribution.fbc,
      input.orderAttribution.fbclid,
      input.orderAttribution.gclid,
      input.orderAttribution.gbraid,
      input.orderAttribution.wbraid,
      input.orderAttribution.ttclid,
      input.orderAttribution.ttp,
      input.orderAttribution.rdtCid,
      input.orderAttribution.epik,
      input.orderAttribution.utmSource,
      input.orderAttribution.utmMedium,
      input.orderAttribution.utmCampaign,
      input.orderAttribution.landingPage,
    ])
  ) {
    sources.push("cart_attributes");
  }

  if (input.sessionContext) {
    sources.push("session_enrichment");
  }

  if (
    hasAnyValue([
      input.landingAttribution.fbc,
      input.landingAttribution.fbcFromFbclid,
      input.landingAttribution.fbclid,
      input.landingAttribution.gclid,
      input.landingAttribution.gbraid,
      input.landingAttribution.wbraid,
      input.landingAttribution.ttclid,
      input.landingAttribution.rdtCid,
      input.landingAttribution.epik,
      input.landingAttribution.utmSource,
      input.landingAttribution.utmCampaign,
    ])
  ) {
    sources.push("landing_site");
  }

  return sources.length > 0 ? sources : ["none"];
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const reqLog = log.child({ requestId });

  try {
    const rawBody = Buffer.from(await request.arrayBuffer());

    if (rawBody.length > 524288) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }

    const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
    const topic = request.headers.get("x-shopify-topic");
    const shopDomain = request.headers.get("x-shopify-shop-domain");

    if (!hmacHeader || !topic || !shopDomain) {
      reqLog.warn("Missing required Shopify headers");
      return NextResponse.json({ error: "Missing headers" }, { status: 400 });
    }

    if (topic !== "orders/paid" && topic !== "refunds/create") {
      reqLog.info("Ignoring unhandled topic", { topic });
      return NextResponse.json({ ok: true });
    }

    let bodyData: Record<string, unknown>;
    try {
      bodyData = JSON.parse(rawBody.toString("utf-8"));
    } catch {
      reqLog.error("Invalid JSON body");
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const isInboxReplay = request.headers.get("x-trackclear-inbox-replay") === "1";
    const replayWorkspaceId = isInboxReplay
      ? request.headers.get("x-trackclear-inbox-workspace")
      : null;
    const candidates = await db.workspace.findMany({
      where: {
        ...(replayWorkspaceId ? { id: replayWorkspaceId } : {}),
        shopifyDomain: shopDomain,
        isActive: true,
        shopifyWebhookSecretEncrypted: { not: null },
      },
      select: {
        id: true,
        shopifyWebhookSecretEncrypted: true,
        shopifyWebhookSecretIv: true,
        shopifyWebhookSecretTag: true,
      },
    });

    if (candidates.length === 0) {
      reqLog.warn("No matching workspaces for domain", { shopDomain });
      return NextResponse.json({ ok: true });
    }

    const verifiedWorkspaceIds: string[] = [];
    for (const workspace of candidates) {
      try {
        const webhookSecret = decrypt(
          workspace.shopifyWebhookSecretEncrypted!,
          workspace.shopifyWebhookSecretIv!,
          workspace.shopifyWebhookSecretTag!
        ).trim();
        if (verifyShopifyWebhook(rawBody, hmacHeader, webhookSecret)) {
          verifiedWorkspaceIds.push(workspace.id);
        }
      } catch (error) {
        reqLog.error("Unable to verify configured webhook secret", {
          workspaceId: workspace.id,
          error: sanitizeWebhookProcessingError(error),
        });
      }
    }

    if (verifiedWorkspaceIds.length === 0) {
      reqLog.warn("Shopify webhook HMAC verification failed", { shopDomain });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const deliveryId = buildShopifyWebhookDeliveryId({
      shopifyWebhookId: request.headers.get("x-shopify-webhook-id"),
      topic,
      shopDomain,
      rawBody,
    });
    const occurredAt = getShopifyWebhookOccurredAt(topic, bodyData);

    let captured: CapturedShopifyWebhook[];
    try {
      captured = await captureVerifiedShopifyWebhook({
        workspaceIds: verifiedWorkspaceIds,
        deliveryId,
        topic,
        shopDomain,
        rawBody,
        occurredAt,
        recordReceipt: !isInboxReplay,
      });
    } catch (error) {
      // Do not acknowledge unless the verified delivery is durable. Shopify can
      // retry this response without creating duplicates because deliveryId is unique.
      reqLog.error("Durable Shopify webhook capture failed", {
        shopDomain,
        topic,
        error: sanitizeWebhookProcessingError(error),
      });
      return NextResponse.json({ error: "Webhook capture unavailable" }, { status: 503 });
    }

    // Shopify's live webhook deadline is an acknowledgement deadline, not a
    // processing budget. Once the HMAC-verified body is durably encrypted in
    // the inbox, return immediately; the one-minute inbox worker owns all
    // downstream processing and retry. Never start unawaited work in Vercel.
    if (!isInboxReplay) {
      return NextResponse.json({ ok: true, captured: captured.length });
    }

    const rateLimitChecked = { value: false };
    let deferred = false;
    for (const inbox of captured) {
      const processed = await processCapturedShopifyWebhook({
        inbox,
        bodyData,
        rawBody,
        hmacHeader,
        shopDomain,
        reqLog,
        requestId,
        rateLimitChecked,
      });
      deferred ||= !processed;
    }

    return NextResponse.json({ ok: true, deferred });
  } catch (error) {
    // Any unexpected failure before durable capture must remain retryable by Shopify.
    reqLog.error("Webhook request failed before acknowledgement", {
      error: sanitizeWebhookProcessingError(error),
    });
    return NextResponse.json({ error: "Webhook processing unavailable" }, { status: 500 });
  }
}

async function processCapturedShopifyWebhook(input: {
  inbox: CapturedShopifyWebhook;
  bodyData: Record<string, unknown>;
  rawBody: Buffer;
  hmacHeader: string;
  shopDomain: string;
  reqLog: ReturnType<typeof log.child>;
  requestId: string;
  rateLimitChecked: { value: boolean };
}): Promise<boolean> {
  let claim: ShopifyWebhookInboxClaim | null = null;

  try {
    claim = await claimShopifyWebhookInbox(input.inbox.id);
    if (!claim) {
      // Already processed or currently owned by another request/worker.
      return input.inbox.status === "PROCESSED";
    }

    const response = input.inbox.topic === "orders/paid"
      ? await handleOrderPaid(
          input.bodyData,
          input.rawBody,
          input.hmacHeader,
          input.shopDomain,
          input.reqLog,
          input.requestId,
          input.rateLimitChecked,
          input.inbox.workspaceId,
          true,
          input.inbox.occurredAt,
          claim.attempts > 1
        )
      : await handleRefundCreated(
          input.bodyData,
          input.rawBody,
          input.hmacHeader,
          input.shopDomain,
          input.reqLog,
          input.requestId,
          input.rateLimitChecked,
          input.inbox.workspaceId,
          true,
          input.inbox.occurredAt
        );

    if (response.status >= 400) {
      throw new Error(`Webhook downstream processing returned HTTP ${response.status}`);
    }

    await completeShopifyWebhookInbox(claim);
    return true;
  } catch (error) {
    input.reqLog.error("Shopify webhook deferred for durable replay", {
      inboxId: input.inbox.id,
      workspaceId: input.inbox.workspaceId,
      topic: input.inbox.topic,
      error: sanitizeWebhookProcessingError(error),
    });

    if (claim) {
      try {
        await deferShopifyWebhookInbox(claim, error);
      } catch (deferError) {
        // The PROCESSING claim becomes stale after five minutes and is reclaimable.
        input.reqLog.error("Unable to update deferred Shopify webhook", {
          inboxId: input.inbox.id,
          error: sanitizeWebhookProcessingError(deferError),
        });
      }
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Handler: orders/paid
// ---------------------------------------------------------------------------

async function handleOrderPaid(
  orderData: Record<string, unknown>,
  rawBody: Buffer,
  hmacHeader: string,
  shopDomain: string,
  reqLog: ReturnType<typeof log.child>,
  requestId: string,
  rateLimitChecked: { value: boolean },
  targetWorkspaceId?: string,
  hmacAlreadyVerified = false,
  occurredAt: Date | null = null,
  durableReplay = false
): Promise<NextResponse> {
  // Find ALL active workspaces matching this shop domain
  const matchingWorkspaces = await db.workspace.findMany({
    where: {
      ...(targetWorkspaceId ? { id: targetWorkspaceId } : {}),
      shopifyDomain: shopDomain,
      isActive: true,
      shopifyWebhookSecretEncrypted: { not: null },
    },
    select: {
      id: true,
      userId: true,
      productMode: true,
      installType: true,
      catalogIdMode: true,
      catalogIdPrefix: true,
      catalogIdSuffix: true,
      catalogIdTemplate: true,
      shopifyWebhookSecretEncrypted: true,
      shopifyWebhookSecretIv: true,
      shopifyWebhookSecretTag: true,
      enableMeta: true,
      metaPixelId: true,
      metaAccessTokenEncrypted: true,
      enableReddit: true,
      redditAccessTokenEncrypted: true,
      enablePinterest: true,
      pinterestConversionTokenEncrypted: true,
      enableTikTok: true,
      tiktokPixelId: true,
      tiktokAccessTokenEncrypted: true,
      enableGA4: true,
      ga4MeasurementId: true,
      ga4ApiSecretEncrypted: true,
      enableKlaviyo: true,
      klaviyoApiKeyEncrypted: true,
      enableGoogleAds: true,
      googleAdsConversionId: true,
      enablePurchase: true,
      consentMode: true,
    },
  });

  if (matchingWorkspaces.length === 0) {
    reqLog.warn("No matching workspaces for domain", { shopDomain });
    return NextResponse.json({ ok: true });
  }

  const orderId = orderData.id ? String(orderData.id) : null;
  const orderName = orderData.name ? String(orderData.name) : null;

  if (!orderId && !orderName) {
    console.warn(JSON.stringify({ level: "warn", msg: "Webhook order missing both orderId and orderName", shopDomain }));
  }
  const totalPrice = orderData.total_price
    ? Number(orderData.total_price)
    : undefined;
  const currency = orderData.currency
    ? String(orderData.currency)
    : undefined;
  const email =
    (orderData.email as string) ||
    (orderData.contact_email as string) ||
    undefined;
  const billingAddress = orderData.billing_address as
    | Record<string, unknown>
    | undefined;
  const shippingAddress = orderData.shipping_address as
    | Record<string, unknown>
    | undefined;
  const customer = orderData.customer as
    | Record<string, unknown>
    | undefined;

  const phone =
    (orderData.phone as string) ||
    (billingAddress?.phone as string) ||
    (shippingAddress?.phone as string) ||
    (customer?.phone as string) ||
    undefined;

  const customerId = orderData.customer
    ? String((orderData.customer as Record<string, unknown>).id ?? "")
    : null;

  const lineItems =
    (orderData.line_items as Array<Record<string, unknown>>) || [];
  const numItems = lineItems.reduce(
    (sum: number, item: Record<string, unknown>) =>
      sum + (Number(item.quantity) || 0),
    0
  );
  const orderReferenceTime = occurredAt?.getTime() ?? Date.now();
  const orderAttribution = buildOrderAttribution(orderData, orderReferenceTime);

  // Extract browser context directly from Shopify order payload (fallback for session enrichment)
  const landingSite = orderData.landing_site ? String(orderData.landing_site) : null;
  const clientDetails = orderData.client_details as Record<string, unknown> | undefined;
  const orderBrowserIp = (orderData.browser_ip as string) || (clientDetails?.browser_ip as string) || null;
  const orderUserAgent = (clientDetails?.user_agent as string) || null;

  const landingAttribution = extractLandingSiteAttribution(
    landingSite,
    shopDomain,
    orderReferenceTime
  );

  // Filter out non-web orders (POS, draft, subscription, manual, bulk)
  // Use a denylist so unknown/new source types (including Shopify test notifications) pass through
  const paymentGateway = orderData.gateway ? String(orderData.gateway) : null;
  const orderSource = orderData.source_name ? String(orderData.source_name).toLowerCase() : "web";
  const BLOCKED_SOURCES = new Set(["pos", "shopify_draft_order", "manual", "bulk", "subscription"]);
  if (BLOCKED_SOURCES.has(orderSource)) {
    reqLog.info("Skipping non-web order", { orderSource, orderId: orderId || orderName });
    return NextResponse.json({ ok: true });
  }

  reqLog.info("Processing order", {
    shopDomain,
    orderId,
    orderName,
    workspaceCount: matchingWorkspaces.length,
  });

  // Process for each workspace that passes HMAC
  for (const workspace of matchingWorkspaces) {
    const wsLog = reqLog.child({ workspaceId: workspace.id });

    // Decrypt webhook secret and verify HMAC
    const webhookSecret = hmacAlreadyVerified ? null : decrypt(
      workspace.shopifyWebhookSecretEncrypted!,
      workspace.shopifyWebhookSecretIv!,
      workspace.shopifyWebhookSecretTag!
    ).trim();
    if (webhookSecret && !verifyShopifyWebhook(rawBody, hmacHeader, webhookSecret)) {
      // Log diagnostic info (no secrets, just lengths and prefixes)
      const computed = require("crypto").createHmac("sha256", webhookSecret).update(rawBody).digest("base64");
      wsLog.warn("HMAC verification failed", {
        secretLength: webhookSecret.length,
        hmacHeaderLength: hmacHeader.length,
        computedLength: computed.length,
        hmacHeaderPrefix: hmacHeader.substring(0, 8),
        computedPrefix: computed.substring(0, 8),
      });
      continue;
    }

    // Rate limit: 30 webhooks per minute per domain (atomic Lua to avoid INCR/EXPIRE race)
    // Only check once per request even if multiple workspaces share the same shopDomain
    if (!rateLimitChecked.value) {
      const rateLimitKey = `wh-rl:${shopDomain}`;
      const redis = getSharedRedis();
      const luaScript = `
        local current = redis.call('INCR', KEYS[1])
        if current == 1 then
          redis.call('EXPIRE', KEYS[1], 60)
        end
        return current
      `;
      const whCount = (await redis.eval(luaScript, 1, rateLimitKey)) as number;
      if (whCount > 30) {
        wsLog.warn("Webhook rate limit exceeded", { shopDomain, count: whCount });
        return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      }
      rateLimitChecked.value = true;
    }

    // Check Purchase toggle
    if (!workspace.enablePurchase) {
      wsLog.info("Purchase events disabled for workspace");
      continue;
    }

    const contentIdOptions = contentIdOptionsFromWorkspace(workspace);
    const contentIds = buildLineItemContentIds(lineItems, contentIdOptions);
    const contents = buildLineItemContents(lineItems, contentIdOptions);

    // Look up stored browser context by durable checkout identifiers. Email is
    // still used, but cart/checkout/session/order keys keep attribution alive
    // when Shopify withholds email or session enrichment happens before email.
    const checkoutToken = firstString(orderData, [
      "checkout_token",
      "checkoutToken",
      "checkout_id",
      "checkoutId",
    ]);
    const cartToken = firstString(orderData, [
      "cart_token",
      "cartToken",
      "cart_id",
      "cartId",
    ]);
    const sessionContext = await lookupSessionContextByIdentifiers(workspace.id, {
      email,
      trackclearSessionId: orderAttribution.trackclearSessionId,
      checkoutToken,
      cartToken,
      orderId,
      orderName,
    });

    if (sessionContext) {
      wsLog.info("Session enrichment found", {
        fieldsEnriched: sessionContext.fieldsEnriched,
        sessionAgeMs: Date.now() - sessionContext.oldestTimestamp,
      });
    }
    const finalFbc = orderAttribution.fbc ?? sessionContext?.fbc ?? landingAttribution.fbc ?? landingAttribution.fbcFromFbclid ?? null;
    const finalFbclid = orderAttribution.fbclid ?? landingAttribution.fbclid ?? null;
    const orderLandingPageUrl = normalizeLandingPageUrl(orderAttribution.landingPage, shopDomain);
    const purchasePageUrl = sessionContext?.url || orderLandingPageUrl || landingAttribution.pageUrl || `https://${shopDomain}`;
    const attributionSources = attributionSourcesForPurchase({
      orderAttribution,
      sessionContext,
      landingAttribution,
    });
    const finalAttributionTimestamp =
      orderAttribution.attributionTimestamp ??
      sessionContext?.attributionTimestamp ??
      null;
    const finalAttributionSource = orderAttribution.attributionTimestamp
      ? orderAttribution.attributionSource
      : sessionContext?.attributionTimestamp
        ? sessionContext.attributionSource ?? null
        : null;

    // Build destination list (before billing -- don't charge for consent-blocked events)
    const destinations: Array<{
      destination: string;
      queue: Queue;
      jobName: string;
    }> = [];

    if (
      workspace.enableMeta &&
      workspace.metaPixelId &&
      workspace.metaAccessTokenEncrypted
    ) {
      destinations.push({
        destination: "META",
        queue: getEventQueue(),
        jobName: "send-meta-event",
      });
    }
    if (workspace.enableReddit && workspace.redditAccessTokenEncrypted) {
      destinations.push({
        destination: "REDDIT",
        queue: getRedditQueue(),
        jobName: "send-reddit-event",
      });
    }
    if (workspace.enablePinterest && workspace.pinterestConversionTokenEncrypted) {
      destinations.push({
        destination: "PINTEREST",
        queue: getPinterestQueue(),
        jobName: "send-pinterest-event",
      });
    }
    if (workspace.enableTikTok && workspace.tiktokAccessTokenEncrypted) {
      destinations.push({
        destination: "TIKTOK",
        queue: getTiktokQueue(),
        jobName: "send-tiktok-event",
      });
    }
    if (
      workspace.enableGA4 &&
      workspace.ga4MeasurementId &&
      workspace.ga4ApiSecretEncrypted
    ) {
      destinations.push({
        destination: "GA4",
        queue: getGA4Queue(),
        jobName: "send-ga4-event",
      });
    }
    if (
      workspace.enableKlaviyo &&
      workspace.klaviyoApiKeyEncrypted &&
      email
    ) {
      destinations.push({
        destination: "KLAVIYO",
        queue: getKlaviyoQueue(),
        jobName: "send-klaviyo-event",
      });
    }
    if (workspace.enableGoogleAds && workspace.googleAdsConversionId) {
      destinations.push({
        destination: "GOOGLE_ADS",
        queue: getGoogleAdsQueue(),
        jobName: "send-google-ads-event",
      });
    }

    const modeFilteredDestinations = filterDestinationsForWorkspace(workspace, destinations);
    const customerConsent = {
      analytics: resolveNewestConsentValue({
        cartValue: orderAttribution.consentAnalytics,
        cartTimestamp: orderAttribution.consentTimestamp,
        sessionValue: sessionContext?.consent?.analytics,
        sessionTimestamp: sessionContext?.consentTimestamps?.analytics,
        now: orderReferenceTime,
      }),
      marketing: resolveNewestConsentValue({
        cartValue: orderAttribution.consentMarketing,
        cartTimestamp: orderAttribution.consentTimestamp,
        sessionValue: sessionContext?.consent?.marketing,
        sessionTimestamp: sessionContext?.consentTimestamps?.marketing,
        now: orderReferenceTime,
      }),
    };
    const consentFilteredDestinations = modeFilteredDestinations.filter((dest) =>
      shouldSendToDestination(workspace.consentMode, customerConsent, dest.destination)
    );

    if (consentFilteredDestinations.length === 0) {
      wsLog.info("No eligible destinations after configuration and consent checks", {
        configuredDestinations: modeFilteredDestinations.map((dest) => dest.destination),
        consentMode: workspace.consentMode,
        consent: customerConsent,
      });
      continue;
    }

    // Deterministic eventId for browser/server Purchase dedup.
    const webhookEventId = buildPurchaseEventId({
      workspaceId: workspace.id,
      shopifyOrderId: orderId,
      orderName,
    });

    const normalizedOrderId = normalizePurchaseIdentifier(orderId);
    const normalizedOrderName = normalizePurchaseIdentifier(orderName);
    const dedupOrderIds = Array.from(new Set(
      [orderId, normalizedOrderId].filter((value): value is string => !!value)
    ));
    const dedupOrderNames = Array.from(new Set(
      [orderName, normalizedOrderName].filter((value): value is string => !!value)
    ));
    const relatedEventIds = [webhookEventId];
    if (orderId) {
      // Custom Pixel checkout payloads can expose only order.id/GID while the
      // webhook also has order.name. Alias that order-ID-only deterministic ID
      // so the canonical name-first webhook can reconcile the same Purchase.
      relatedEventIds.push(buildPurchaseEventId({
        workspaceId: workspace.id,
        shopifyOrderId: orderId,
      }));
    }
    if (checkoutToken) {
      relatedEventIds.push(buildPurchaseEventId({
        workspaceId: workspace.id,
        checkoutToken,
      }));
    }
    if (cartToken) {
      relatedEventIds.push(buildPurchaseEventId({
        workspaceId: workspace.id,
        cartToken,
      }));
    }
    const dedupLockKey = `dedup:purchase:${workspace.id}:${orderId || orderName || webhookEventId}`;
    const lockAcquired = durableReplay
      ? "OK"
      : await getSharedRedis()
          .set(dedupLockKey, "webhook", "EX", 300, "NX")
          .catch(() => "OK");

    // Reconcile prior browser/webhook rows per destination. Lock contention by
    // itself is never proof that an event is durable: the competing request may
    // have crashed before creating an EventLog.
    const priorPurchaseRows = await db.eventLog.findMany({
          where: {
            workspaceId: workspace.id,
            eventName: "Purchase",
            OR: [
              { eventId: { in: Array.from(new Set(relatedEventIds)) } },
              ...(dedupOrderIds.length > 0
                ? [{ orderId: { in: dedupOrderIds } }]
                : []),
              ...(dedupOrderNames.length > 0
                ? [{ orderName: { in: dedupOrderNames } }]
                : []),
              ...(checkoutToken ? [{ checkoutToken }] : []),
              ...(cartToken ? [{ cartToken }] : []),
            ] as any,
          },
          select: {
            id: true,
            eventId: true,
            destination: true,
            status: true,
            orderId: true,
            source: true,
          },
        });

    if (!lockAcquired && priorPurchaseRows.length === 0) {
      throw new Error("Purchase dedup lock is held without a durable EventLog owner");
    }

    const alreadySentDestinations = new Set<string>(
      priorPurchaseRows
        .filter((row) => row.eventId !== webhookEventId && row.status === "SENT")
        .map((row) => row.destination)
    );
    const rowsBehindSentOwner = priorPurchaseRows.filter(
      (row) =>
        alreadySentDestinations.has(row.destination) &&
        (row.status === "PENDING" ||
          row.status === "RETRYING" ||
          row.status === "FAILED")
    );
    const sentOwnerReservation = await reserveEventDeliveriesForWebhook(
      rowsBehindSentOwner.map((row) => row.id)
    );
    for (const row of rowsBehindSentOwner) {
      const suppressed = await db.eventLog.updateMany({
        where: {
          id: row.id,
          status: { in: ["PENDING", "RETRYING", "FAILED"] },
          deliveryClaimToken: sentOwnerReservation.token,
          deliveryClaimOwner: "SHOPIFY_WEBHOOK",
        },
        data: {
          status: "SUPERSEDED",
          errorMessage: "Suppressed because an alias-matched fallback was already sent",
          nextRetryAt: null,
          ...clearedEventRetryEnvelope(),
          ...clearedEventDeliveryClaim(),
        },
      });
      if (suppressed.count !== 1) {
        throw new Error(
          `Purchase ${row.destination} changed state while suppressing duplicate aliases`
        );
      }
    }
    const canonicalDestinations = consentFilteredDestinations.filter(
      (dest) => !alreadySentDestinations.has(dest.destination)
    );
    if (canonicalDestinations.length === 0) {
      wsLog.info("Purchase already delivered for every eligible destination", {
        orderId: orderId || orderName,
        destinations: Array.from(alreadySentDestinations),
      });
      continue;
    }

    const purchaseAlreadyCounted = priorPurchaseRows.length > 0;

    // A replay that failed before writing any EventLog still needs a usage
    // reservation. The Redis marker set is idempotent across all overlapping
    // checkout/order/cart aliases, so replaying this call cannot count twice.
    let purchaseBillingReservation: PurchaseBillingReservation | undefined;
    if (!purchaseAlreadyCounted) {
      const billing = await checkOrderLimits(workspace.userId, "Purchase", {
        workspaceId: workspace.id,
        eventId: webhookEventId,
        aliases: buildPurchaseBillingAliases({
          workspaceId: workspace.id,
          shopifyOrderId: orderId,
          orderName,
          checkoutToken,
          cartToken,
        }),
      });
      if (!billing.allowed) {
        wsLog.warn("Order limit reached", {
          limit: billing.limit,
          used: billing.used,
        });
        continue;
      }
      purchaseBillingReservation = billing.reservation;
    }

    const canonicalDestinationNames = new Set(
      canonicalDestinations.map((destination) => destination.destination)
    );
    const ownershipRows = priorPurchaseRows.filter(
      (row) =>
        canonicalDestinationNames.has(row.destination) &&
        (row.status === "PENDING" ||
          row.status === "RETRYING" ||
          row.status === "FAILED")
    );

    // This DB reservation is the synchronization point shared with every
    // destination worker's final pre-I/O claim. A worker claim makes this
    // transaction fail and leaves the durable webhook inbox pending. If this
    // reservation wins, a different-ID fallback is terminal before its worker
    // can claim; a same-ID row is upgraded below and then released with a fresh
    // encrypted canonical envelope.
    const deliveryReservation = await reserveEventDeliveriesForWebhook(
      ownershipRows.map((row) => row.id)
    );
    const initiallyReservedIds = new Set(deliveryReservation.eventLogIds);
    const fallbackRowsToSupersede = ownershipRows.filter(
      (row) => row.eventId !== webhookEventId
    );
    for (const row of fallbackRowsToSupersede) {
      const superseded = await db.eventLog.updateMany({
        where: {
          id: row.id,
          eventId: row.eventId,
          status: { in: ["PENDING", "RETRYING", "FAILED"] },
          deliveryClaimToken: deliveryReservation.token,
          deliveryClaimOwner: "SHOPIFY_WEBHOOK",
        },
        data: {
          status: "SUPERSEDED",
          errorMessage: "Superseded by canonical Shopify webhook Purchase",
          nextRetryAt: null,
          ...clearedEventRetryEnvelope(),
          ...clearedEventDeliveryClaim(),
        },
      });
      if (superseded.count !== 1) {
        throw new Error(
          `Purchase ${row.destination} changed state during claimed canonical takeover`
        );
      }

      // Rolling deploy protection for a worker build that predates DB claims.
      // Current workers will see SUPERSEDED before I/O; an already-active old
      // worker is allowed to settle and the inbox reconciles its durable result.
      const destination = canonicalDestinations.find(
        (candidate) => candidate.destination === row.destination
      );
      if (!destination) {
        throw new Error(`Purchase destination ${row.destination} is unavailable for takeover`);
      }
      const retainedJob = await destination.queue.getJob(eventReplayJobId(row.id));
      const retainedState = retainedJob ? await retainedJob.getState() : "unknown";
      if (retainedState === "active" || retainedState === "completed") {
        throw new Error(
          `Purchase destination ${row.destination} is settling under another event ID`
        );
      }
    }

    // Create EventLog entries with dedup
    const eventLogBaseData = {
      workspaceId: workspace.id,
      eventName: "Purchase" as const,
      eventId: webhookEventId,
      status: "PENDING" as const,
      payload: {
        eventName: "Purchase",
        customData: {
          value: totalPrice,
          currency,
          num_items: numItems,
          order_id: orderName || orderId,
          order_name: orderName,
          checkout_token: checkoutToken,
          cart_token: cartToken,
          content_type: "product",
          content_ids: contentIds,
          contents,
        },
        hasUserData: !!(email || phone),
        attributionSource: attributionSources[0],
        attributionSources,
        attributionTimestamp: finalAttributionTimestamp,
        attributionTouchSource: finalAttributionSource,
        hasTtp: !!(orderAttribution.ttp ?? sessionContext?.ttp),
        trackclearSessionIdPresent: !!orderAttribution.trackclearSessionId,
        consent: {
          analytics: customerConsent.analytics ?? null,
          marketing: customerConsent.marketing ?? null,
          source: orderAttribution.consentSource ?? (sessionContext?.consent ? "session_enrichment" : null),
          timestamp: orderAttribution.consentTimestamp ?? null,
        },
        enrichment: sessionContext ? {
          fields: sessionContext.fieldsEnriched,
          ageMs: Date.now() - sessionContext.oldestTimestamp,
        } : null,
      } as any, // eslint-disable-line
      customerIp: sessionContext?.clientIp ?? orderBrowserIp,
      userAgent: sessionContext?.userAgent ?? orderUserAgent,
      value: totalPrice ?? null,
      currency: currency ?? null,
      numItems: numItems || null,
      orderId: normalizedOrderId,
      orderName: normalizedOrderName,
      checkoutToken,
      cartToken,
      source: "webhook",
      paymentGateway,
      utmSource: orderAttribution.utmSource ?? sessionContext?.utmSource ?? landingAttribution.utmSource,
      utmMedium: orderAttribution.utmMedium ?? sessionContext?.utmMedium ?? landingAttribution.utmMedium,
      utmCampaign: orderAttribution.utmCampaign ?? sessionContext?.utmCampaign ?? landingAttribution.utmCampaign,
      utmContent: orderAttribution.utmContent ?? sessionContext?.utmContent ?? landingAttribution.utmContent,
      utmTerm: orderAttribution.utmTerm ?? sessionContext?.utmTerm ?? landingAttribution.utmTerm,
      gclid: orderAttribution.gclid ?? sessionContext?.gclid ?? landingAttribution.gclid,
      pageUrl: purchasePageUrl,
      fbp: orderAttribution.fbp ?? sessionContext?.fbp ?? null,
      fbc: finalFbc,
      ttclid: orderAttribution.ttclid ?? sessionContext?.ttclid ?? landingAttribution.ttclid,
      rdtCid: orderAttribution.rdtCid ?? sessionContext?.rdtCid ?? landingAttribution.rdtCid,
      epik: orderAttribution.epik ?? sessionContext?.epik ?? landingAttribution.epik,
    };

    const eventLogResults = await (async () => {
      try {
        const settledResults = await Promise.allSettled(
          canonicalDestinations.map(async (dest) => {
            try {
              const entry = await db.eventLog.create({
                data: {
                  ...eventLogBaseData,
                  destination: dest.destination as any, // eslint-disable-line
                },
              });
              return { entry, created: true };
            } catch (err: any) { // eslint-disable-line
              if (err?.code === "P2002") {
                const existing = await db.eventLog.findUnique({
                  where: {
                    workspaceId_eventId_destination: {
                      workspaceId: workspace.id,
                      eventId: webhookEventId,
                      destination: dest.destination as any, // eslint-disable-line
                    },
                  },
                  select: { id: true, status: true },
                });
                return existing?.status === "SENT"
                  ? null
                  : existing
                    ? { entry: existing, created: false }
                    : null;
              }
              throw err;
            }
          })
        );
        const failedResult = settledResults.find(
          (result): result is PromiseRejectedResult =>
            result.status === "rejected"
        );
        if (failedResult) throw failedResult.reason;
        return settledResults.map((result) => {
          if (result.status === "rejected") throw result.reason;
          return result.value;
        });
      } catch (error) {
        if (purchaseBillingReservation) {
          const recovery =
            await recoverPurchaseBillingReservationAfterOutboxFailure(
              purchaseBillingReservation,
              {
                workspaceId: workspace.id,
                eventId: webhookEventId,
                orderId: normalizedOrderId,
                orderName: normalizedOrderName,
                checkoutToken,
                cartToken,
              }
            );
          wsLog.warn("Webhook Purchase outbox write failed after billing reservation", {
            billingRecovery: recovery,
          });
        }
        throw error;
      }
    })();

    const validResults = eventLogResults.filter(
      (result): result is NonNullable<typeof result> => result !== null
    );
    const validEntries = validResults.map((result) => result.entry);
    const validDests = canonicalDestinations.filter(
      (_, idx) => eventLogResults[idx] !== null
    );

    if (validEntries.length === 0) {
      wsLog.info("All events deduplicated");
      continue;
    }

    // The initial alias snapshot is not an ownership boundary: a same-ID
    // snippet row can commit and acquire a worker claim between that read and
    // this create's P2002. Reserve every newly discovered reused row before
    // touching canonical fields. Never clear an active claim we do not own.
    const lateReusedIds = validResults
      .filter(
        (result) =>
          !result.created && !initiallyReservedIds.has(result.entry.id)
      )
      .map((result) => result.entry.id);
    const lateReservation = await reserveEventDeliveriesForWebhook(lateReusedIds);
    const lateReservedIds = new Set(lateReservation.eventLogIds);

    // Build event data for workers
    const eventData = {
      eventName: "Purchase",
      eventId: webhookEventId,
      timestamp: occurredAt?.getTime() ?? Date.now(),
      url: purchasePageUrl,
      referrer: "",
      fbp: orderAttribution.fbp ?? sessionContext?.fbp ?? null,
      fbc: finalFbc,
      fbclid: finalFbclid,
      gbraid: orderAttribution.gbraid ?? sessionContext?.gbraid ?? null,
      wbraid: orderAttribution.wbraid ?? sessionContext?.wbraid ?? null,
      userData: {
        email: email || null,
        phone: phone || null,
        firstName:
          (customer?.first_name as string) ||
          (billingAddress?.first_name as string) ||
          null,
        lastName:
          (customer?.last_name as string) ||
          (billingAddress?.last_name as string) ||
          null,
        city: (billingAddress?.city as string) || null,
        state: (billingAddress?.province_code as string) || null,
        zip: (billingAddress?.zip as string) || null,
        countryCode: (billingAddress?.country_code as string) || null,
        customerId: customerId || undefined,
      },
      customData: {
        value: totalPrice,
        currency,
        num_items: numItems,
        order_id: orderName || orderId,
        order_name: orderName,
        checkout_token: checkoutToken,
        cart_token: cartToken,
        content_type: "product",
        content_ids: contentIds,
        contents,
      },
      clientIp: sessionContext?.clientIp ?? orderBrowserIp ?? "",
      userAgent: sessionContext?.userAgent ?? orderUserAgent ?? "",
    };

    const destinationEventData = {
      ...eventData,
      ttclid: orderAttribution.ttclid ?? sessionContext?.ttclid ?? landingAttribution.ttclid ?? null,
      ttp: orderAttribution.ttp ?? sessionContext?.ttp ?? landingAttribution.ttp ?? null,
      gclid: orderAttribution.gclid ?? sessionContext?.gclid ?? landingAttribution.gclid ?? null,
      rdtCid: orderAttribution.rdtCid ?? sessionContext?.rdtCid ?? landingAttribution.rdtCid ?? null,
      epik: orderAttribution.epik ?? sessionContext?.epik ?? landingAttribution.epik ?? null,
      gaClientId: sessionContext?.gaClientId ?? null,
    };
    const retryEnvelope = encryptEventRetryEnvelope({
      version: 1,
      event: destinationEventData,
    });

    const {
      workspaceId: _workspaceId,
      eventName: _eventName,
      eventId: _eventId,
      status: _status,
      ...candidateEventLogData
    } = eventLogBaseData;
    const authoritativeEventLogData = preserveUsefulEventLogColumns(
      candidateEventLogData
    );

    // Upgrade reused snippet rows with canonical Shopify value/order/attribution
    // fields as well as the short-lived encrypted worker payload. This also
    // normalizes GraphQL order IDs to the webhook's numeric ID for refunds and
    // diagnostics.
    await Promise.all(
      validResults.map(async (result) => {
        const reservationToken = initiallyReservedIds.has(result.entry.id)
          ? deliveryReservation.token
          : lateReservedIds.has(result.entry.id)
            ? lateReservation.token
            : null;
        const updated = await db.eventLog.updateMany({
          where: {
            id: result.entry.id,
            status: { in: ["PENDING", "RETRYING", "FAILED"] },
            ...(result.created
              ? { deliveryClaimToken: null }
              : {
                  deliveryClaimToken: reservationToken,
                  deliveryClaimOwner: "SHOPIFY_WEBHOOK",
                }),
          },
          data: {
            ...authoritativeEventLogData,
            ...retryEnvelope,
            ...clearedEventDeliveryClaim(),
          },
        });
        if (updated.count !== 1) {
          throw new Error(
            `Canonical Purchase ${result.entry.id} changed before authoritative update`
          );
        }
      })
    );

    // Queue jobs
    const enqueueResults = await Promise.all(
      validDests.map((dest, idx) => {
        const eventLogId = validEntries[idx].id;

        if (dest.destination === "META") {
          return enqueueReplayJob(
            dest.queue,
            dest.jobName,
            eventLogId,
            {
              workspaceId: workspace.id,
              requestId,
              event: eventData,
              eventLogId,
            } satisfies MetaEventJob,
            { preferReplayData: true }
          );
        } else {
          return enqueueReplayJob(
            dest.queue,
            dest.jobName,
            eventLogId,
            {
              workspaceId: workspace.id,
              destination: dest.destination,
              requestId,
              eventLogId,
              event: destinationEventData,
            } satisfies DestinationEventJob,
            { preferReplayData: true }
          );
        }
      })
    );
    if (enqueueResults.includes("active")) {
      throw new Error("Canonical webhook is waiting for an active Purchase delivery to settle");
    }

    wsLog.info("Purchase queued from webhook", {
      orderId: orderId || orderName,
      destinations: validDests.map((d) => d.destination),
      eventLogCount: validEntries.length,
    });
  }

  // Always return 200 quickly (Shopify requires response within 5 seconds)
  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// Handler: refunds/create
// ---------------------------------------------------------------------------

async function handleRefundCreated(
  refundData: Record<string, unknown>,
  rawBody: Buffer,
  hmacHeader: string,
  shopDomain: string,
  reqLog: ReturnType<typeof log.child>,
  requestId: string,
  rateLimitChecked: { value: boolean },
  targetWorkspaceId?: string,
  hmacAlreadyVerified = false,
  occurredAt: Date | null = null
): Promise<NextResponse> {
  const refundId = refundData.id ? String(refundData.id) : null;
  const shopifyOrderId = refundData.order_id ? String(refundData.order_id) : null;

  if (!refundId || !shopifyOrderId) {
    reqLog.warn("Refund payload missing id or order_id");
    return NextResponse.json({ ok: true });
  }

  // Extract refunded amount from transactions
  const transactions = (refundData.transactions as Array<Record<string, unknown>>) ?? [];
  const refundedAmount = transactions.reduce(
    (sum: number, tx) => sum + (Number(tx.amount) || 0),
    0
  );
  const currency = transactions[0]?.currency
    ? String(transactions[0].currency)
    : undefined;

  reqLog.info("Processing refund", { refundId, shopifyOrderId });

  // Find matching workspaces (only GA4 fields needed -- Meta has no standard refund event)
  const matchingWorkspaces = await db.workspace.findMany({
    where: {
      ...(targetWorkspaceId ? { id: targetWorkspaceId } : {}),
      shopifyDomain: shopDomain,
      isActive: true,
      shopifyWebhookSecretEncrypted: { not: null },
    },
    select: {
      id: true,
      userId: true,
      productMode: true,
      installType: true,
      shopifyWebhookSecretEncrypted: true,
      shopifyWebhookSecretIv: true,
      shopifyWebhookSecretTag: true,
      consentMode: true,
      enableGA4: true,
      ga4MeasurementId: true,
      ga4ApiSecretEncrypted: true,
    },
  });

  if (matchingWorkspaces.length === 0) return NextResponse.json({ ok: true });

  for (const workspace of matchingWorkspaces) {
    const wsLog = reqLog.child({ workspaceId: workspace.id });

    // Decrypt webhook secret and verify HMAC
    const webhookSecret = hmacAlreadyVerified ? null : decrypt(
      workspace.shopifyWebhookSecretEncrypted!,
      workspace.shopifyWebhookSecretIv!,
      workspace.shopifyWebhookSecretTag!
    ).trim();
    if (webhookSecret && !verifyShopifyWebhook(rawBody, hmacHeader, webhookSecret)) {
      wsLog.warn("HMAC verification failed for refund");
      continue;
    }

    // Rate limit: 30 webhooks per minute per domain (atomic Lua to avoid INCR/EXPIRE race)
    // Only check once per request even if multiple workspaces share the same shopDomain
    if (!rateLimitChecked.value) {
      const rateLimitKey = `wh-rl:${shopDomain}`;
      const redis = getSharedRedis();
      const luaScript = `
        local current = redis.call('INCR', KEYS[1])
        if current == 1 then
          redis.call('EXPIRE', KEYS[1], 60)
        end
        return current
      `;
      const whCount = (await redis.eval(luaScript, 1, rateLimitKey)) as number;
      if (whCount > 30) {
        wsLog.warn("Webhook rate limit exceeded", { shopDomain, count: whCount });
        return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      }
      rateLimitChecked.value = true;
    }

    // Dedup: check if this refund already processed
    const existingRefund = await db.eventLog.findFirst({
      where: { workspaceId: workspace.id, refundId, eventName: "Refund" },
    });
    if (existingRefund) {
      wsLog.info("Refund already processed, skipping", { refundId });
      continue;
    }

    // Find original Purchase to inherit browser context
    const originalPurchase = await db.eventLog.findFirst({
      where: {
        workspaceId: workspace.id,
        orderId: shopifyOrderId,
        eventName: "Purchase",
        status: "SENT",
      },
      orderBy: { createdAt: "desc" },
    });

    // Derive supported refund destinations from DESTINATION_EVENT_MAP.
    // Currently only GA4 has Refund support. If other destinations add support,
    // update DESTINATION_EVENT_MAP and add their credential check below.
    const REFUND_QUEUE_MAP: Record<string, { queue: () => Queue; jobName: string; hasCredentials: (ws: typeof workspace) => boolean }> = {
      GA4: {
        queue: getGA4Queue,
        jobName: "send-ga4-event",
        hasCredentials: (ws) => !!(ws.enableGA4 && ws.ga4MeasurementId && ws.ga4ApiSecretEncrypted),
      },
    };

    const refundSupportedDests = (Object.keys(DESTINATION_EVENT_MAP) as Array<keyof typeof DESTINATION_EVENT_MAP>)
      .filter((dest) => DESTINATION_EVENT_MAP[dest].Refund !== null);

    const destinations: Array<{ destination: string; queue: Queue; jobName: string }> = [];
    for (const dest of refundSupportedDests) {
      const config = REFUND_QUEUE_MAP[dest];
      if (config && config.hasCredentials(workspace)) {
        destinations.push({ destination: dest, queue: config.queue(), jobName: config.jobName });
      }
    }

    const modeFilteredDestinations = filterDestinationsForWorkspace(workspace, destinations);

    if (modeFilteredDestinations.length === 0) continue;

    // Refunds are server-side financial events -- no consent filtering
    const refundEventId = `refund-${refundId}`;

    const eventData = {
      eventName: "Refund",
      eventId: refundEventId,
      timestamp: occurredAt?.getTime() ?? Date.now(),
      url: originalPurchase?.pageUrl ?? "",
      referrer: "",
      fbp: originalPurchase?.fbp ?? null,
      fbc: originalPurchase?.fbc ?? null,
      userData: {},
      customData: {
        value: refundedAmount,
        currency,
        order_id: shopifyOrderId,
      },
      clientIp: originalPurchase?.customerIp ?? "",
      userAgent: originalPurchase?.userAgent ?? "",
    };
    const refundRetryEnvelope = encryptEventRetryEnvelope({
      version: 1,
      event: {
        ...eventData,
        ttclid: null,
        gclid: null,
        rdtCid: null,
        epik: null,
        gaClientId: null,
      },
    });

    // Create EventLog entries
    const eventLogEntries = await Promise.all(
      modeFilteredDestinations.map(async (dest) => {
        try {
          return await db.eventLog.create({
            data: {
              workspaceId: workspace.id,
              eventName: "Refund" as EventName,
              eventId: refundEventId,
              status: "PENDING" as const,
              destination: dest.destination as any,
              source: "webhook",
              refundId,
              refundAmount: refundedAmount || null,
              value: refundedAmount || null,
              currency: currency ?? null,
              orderId: shopifyOrderId,
              customerIp: originalPurchase?.customerIp ?? null,
              userAgent: originalPurchase?.userAgent ?? null,
              fbp: originalPurchase?.fbp ?? null,
              fbc: originalPurchase?.fbc ?? null,
              ...refundRetryEnvelope,
              payload: {
                eventName: "Refund",
                refundId,
                orderId: shopifyOrderId,
                refundedAmount,
              } as any,
            },
          });
        } catch (err: any) {
          if (err?.code === "P2002") return null;
          throw err;
        }
      })
    );

    const validEntries = eventLogEntries.filter((e): e is NonNullable<typeof e> => e !== null);
    const validDests = modeFilteredDestinations.filter((_, idx) => eventLogEntries[idx] !== null);

    if (validEntries.length === 0) continue;

    // Decrement billing quota
    if (originalPurchase) {
      const purchaseMonth = originalPurchase.createdAt.toISOString().slice(0, 7);
      await decrementOrderCount(workspace.userId, purchaseMonth);
    }

    // Queue jobs (GA4 only for refunds)
    const refundEnqueueResults = await Promise.all(
      validDests.map((dest, idx) => {
        const eventLogId = validEntries[idx].id;
        return enqueueReplayJob(
          dest.queue,
          dest.jobName,
          eventLogId,
          {
            workspaceId: workspace.id,
            destination: dest.destination,
            requestId,
            eventLogId,
            event: { ...eventData, ttclid: null, gclid: null, rdtCid: null, epik: null, gaClientId: null },
          } satisfies DestinationEventJob,
          { preferReplayData: true }
        );
      })
    );
    if (refundEnqueueResults.includes("active")) {
      throw new Error("Canonical webhook is waiting for an active Refund delivery to settle");
    }

    wsLog.info("Refund queued", {
      refundId,
      orderId: shopifyOrderId,
      amount: refundedAmount,
      destinations: validDests.map((d) => d.destination),
    });
  }

  return NextResponse.json({ ok: true });
}
