import { NextRequest, NextResponse } from "next/server";
import type { EventName } from "@prisma/client";
import { createLogger } from "@/lib/logger";
import { db } from "@/lib/db";
import { lookupWorkspaceByApiKey } from "@/lib/api-key-cache";
import { isValidApiKeyFormat } from "@/lib/api-key";
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
import { shouldSendToDestination } from "@/lib/consent";
import {
  checkConsentRevocationRateLimit,
  checkRateLimit,
  checkPurchaseRateLimit,
} from "@/lib/rate-limit";
import {
  checkOrderLimits,
  recoverPurchaseBillingReservationAfterOutboxFailure,
  type BillingCheck,
} from "@/lib/billing";
import { extractCustomData } from "@/lib/extract-custom-data";
import { DESTINATION_EVENT_MAP } from "@/lib/destinations";
import {
  clearSessionContextForIdentifiers,
  storeSessionContextForIdentifiers,
} from "@/lib/session-enrichment";
import { getSharedRedis } from "@/lib/redis";
import { getClientIpFromHeaders, getClientUserAgentFromHeaders, resolveFbc } from "@/lib/tracking-context";
import { buildEventLogPayload } from "@/lib/event-log-payload";
import {
  filterDestinationsForWorkspace,
  resolveWorkspaceInstallType,
  resolveWorkspaceProductMode,
  SHOPIFY_CUSTOM_PIXEL,
  SHOPIFY_META_TIKTOK_V1,
} from "@/lib/workspace-mode";
import {
  buildPurchaseBillingAliases,
  buildPurchaseEventIdFromCustomData,
  normalizePurchaseIdentifier,
} from "@/lib/purchase-event-id";
import { contentIdOptionsFromWorkspace, normalizeCustomDataContentIds } from "@/lib/content-id";
import {
  IngestPayloadSchema,
  isPrivacyMinimizedConsentRevocation,
  isPrivacyMinimizedConsentRevocationEnvelope,
} from "@/lib/ingest-validation";
import { encryptEventRetryEnvelope, type EventRetryEnvelope } from "@/lib/event-retry-envelope";
import { VERIFIED_WEBHOOK_PURCHASE_GRACE_MS } from "@/lib/shopify-webhook-inbox";
import {
  persistInternalAttributionEvent,
  supersedeInternalAttributionEvent,
} from "@/lib/internal-attribution";
import { ZodError } from "zod";
import type { Queue } from "bullmq";

function pickCustomString(
  customData: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = customData[key];
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

// CORS headers for cross-origin snippet requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-TL-API-Key",
};
// Hold the initial InitiateCheckout delivery long enough for Shopify's
// checkout_contact_info_submitted enrichment (email/phone) to land on the
// still-unclaimed outbox row. Shoppers rarely submit contact info within a
// few seconds, so a short window would send the anonymous version first.
const CHECKOUT_ENRICHMENT_DELAY_MS = 90_000;
const CHECKOUT_ENRICHMENT_DESTINATIONS: readonly string[] = ["META", "TIKTOK"];

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = createLogger({ component: "ingest", requestId });

  try {
    // 1. Extract and validate API key
    const apiKey = request.headers.get("X-TL-API-Key");
    if (!apiKey) {
      return NextResponse.json({ error: "Missing API key" }, { status: 401, headers: corsHeaders });
    }

    if (!isValidApiKeyFormat(apiKey)) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401, headers: corsHeaders });
    }

    // 2. Look up workspace by API key (Redis-cached, falls back to DB)
    const workspace = await lookupWorkspaceByApiKey(apiKey);

    if (!workspace) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401, headers: corsHeaders });
    }

    // Parse the bounded payload before delivery gates because a narrowly
    // validated consent revocation is a deletion control-plane request. It
    // must remain effective when delivery is disabled, unconfigured, or rate
    // limited. Authentication still happens first, and the minimized shape
    // cannot carry delivery destinations, attribution data, or shopper PII.
    let rawBody: string;
    try {
      rawBody = await request.text();
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400, headers: corsHeaders });
    }

    if (rawBody.length > 102400) { // 100KB max
      return NextResponse.json({ error: "Payload too large" }, { status: 413, headers: corsHeaders });
    }

    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: corsHeaders });
    }
    const payload = IngestPayloadSchema.parse(body);
    const normalizedCustomData = normalizeCustomDataContentIds(
      payload.customData,
      contentIdOptionsFromWorkspace(workspace)
    );
    const sessionIdentifiers = {
      email: payload.userData?.email ?? null,
      trackclearSessionId:
        payload.trackclearSessionId ??
        pickCustomString(normalizedCustomData, ["trackclearSessionId", "_trackclear_session_id"]),
      checkoutToken:
        payload.checkoutToken ??
        pickCustomString(normalizedCustomData, ["checkoutToken", "checkout_token"]),
      cartToken:
        payload.cartToken ??
        pickCustomString(normalizedCustomData, ["cartToken", "cart_token"]),
      orderId: pickCustomString(normalizedCustomData, ["shopifyOrderId", "shopify_order_id", "orderId", "order_id"]),
      orderName: pickCustomString(normalizedCustomData, ["orderName", "order_name"]),
    };
    const explicitlyDeniedAnalytics = payload.consent.analyticsAllowed === false;
    const explicitlyDeniedMarketing = payload.consent.marketingAllowed === false;
    const explicitlyDeniedSaleOfData = payload.consent.saleOfDataAllowed === false;
    const explicitlyDeniedAdvertising =
      explicitlyDeniedMarketing || explicitlyDeniedSaleOfData;
    const hasExplicitConsentDenial =
      explicitlyDeniedAnalytics || explicitlyDeniedAdvertising;
    const consentRevocationIdentifiers = sessionIdentifiers.trackclearSessionId
      ? { trackclearSessionId: sessionIdentifiers.trackclearSessionId }
      : sessionIdentifiers.checkoutToken
        ? { checkoutToken: sessionIdentifiers.checkoutToken }
        : sessionIdentifiers.cartToken
          ? { cartToken: sessionIdentifiers.cartToken }
          : null;

    if (
      isPrivacyMinimizedConsentRevocationEnvelope(payload as Record<string, unknown>) &&
      !consentRevocationIdentifiers
    ) {
      return NextResponse.json(
        { error: "Consent revocation requires a session, checkout, or cart identifier" },
        { status: 422, headers: { ...corsHeaders, "X-Request-ID": requestId } }
      );
    }

    if (isPrivacyMinimizedConsentRevocation(payload as Record<string, unknown>)) {
      const revocationRateLimit = await checkConsentRevocationRateLimit(workspace.id);
      if (!revocationRateLimit.allowed) {
        return NextResponse.json(
          { error: "Consent revocation rate limited" },
          {
            status: 429,
            headers: {
              ...corsHeaders,
              "Retry-After": String(revocationRateLimit.retryAfter ?? 60),
              "X-Request-ID": requestId,
            },
          }
        );
      }

      // Use exactly one opaque anchor. Predictable order aliases remain
      // accepted in old queued payloads for compatibility but are never direct
      // deletion keys; existing Redis alias links propagate the tombstone.
      await clearSessionContextForIdentifiers(workspace.id, consentRevocationIdentifiers!, {
        marketing: explicitlyDeniedMarketing,
        saleOfData: explicitlyDeniedSaleOfData,
        analytics: explicitlyDeniedAnalytics,
        shared: explicitlyDeniedAdvertising && explicitlyDeniedAnalytics,
        observedAt: payload.timestamp,
      });
      return NextResponse.json(
        {
          success: true,
          eventId: payload.eventId,
          skipped: true,
          reason: "consent_revocation_recorded",
          destinations: [],
        },
        { status: 200, headers: { ...corsHeaders, "X-Request-ID": requestId } }
      );
    }

    if (!workspace.isActive) {
      return NextResponse.json({ error: "Workspace inactive" }, { status: 403, headers: corsHeaders });
    }

    // 3. Check that at least one destination has credentials configured.
    // These booleans are pre-computed in api-key-cache.ts before caching so
    // encrypted values are never stored in Redis.
    const hasMetaCredentials = !!workspace.hasMetaCredentials;
    const hasTiktokCredentials = !!workspace.hasTikTokCredentials;
    const hasGA4Credentials = !!workspace.hasGA4Credentials;
    const hasKlaviyoCredentials = !!workspace.hasKlaviyoCredentials;
    const hasRedditCredentials = !!workspace.hasRedditCredentials;
    const hasPinterestCredentials = !!workspace.hasPinterestCredentials;
    const hasGoogleAdsCredentials = !!workspace.hasGoogleAdsCredentials;

    if (!hasMetaCredentials && !hasTiktokCredentials && !hasGA4Credentials && !hasKlaviyoCredentials && !hasRedditCredentials && !hasPinterestCredentials && !hasGoogleAdsCredentials) {
      return NextResponse.json({ error: "No destination credentials configured" }, { status: 422, headers: corsHeaders });
    }

    // 4. Rate limit check
    const rateLimit = await checkRateLimit(workspace.id);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: corsHeaders });
    }

    // 5. Build the delivery event after workspace, credential, and rate gates.
    const resolvedFbc = resolveFbc(payload.fbc, payload.fbclid);
    const extracted = extractCustomData(normalizedCustomData);
    const effectiveEventId =
      payload.eventName === "Purchase"
        ? buildPurchaseEventIdFromCustomData({
            workspaceId: workspace.id,
            eventId: payload.eventId,
            customData: normalizedCustomData,
          })
        : payload.eventId;
    const isCheckoutEnrichmentRequest =
      payload.eventName === "InitiateCheckout" &&
      !!payload.onlyDestinations?.length &&
      payload.onlyDestinations.every((dest) =>
        CHECKOUT_ENRICHMENT_DESTINATIONS.includes(dest)
      ) &&
      !!(payload.userData?.email || payload.userData?.phone);

    // 7. Extract IP and User-Agent from request. Server-side storefront
    // proxies can pass the real shopper values through X-TL-Client-* headers.
    const clientIp = getClientIpFromHeaders(request.headers);
    const userAgent = getClientUserAgentFromHeaders(request.headers);

    // Store browser context for webhook enrichment. Email is useful, but
    // session/cart/checkout/order identifiers survive more checkout variants.
    const normalizedPurchaseOrderId = normalizePurchaseIdentifier(
      sessionIdentifiers.orderId
    );
    const normalizedPurchaseOrderName = normalizePurchaseIdentifier(
      sessionIdentifiers.orderName
    );
    const consentForDestinations = {
      analytics: payload.consent.analyticsAllowed,
      marketing: payload.consent.marketingAllowed,
      saleOfData: payload.consent.saleOfDataAllowed,
    };
    const analyticsContextAllowed = shouldSendToDestination(
      workspace.consentMode,
      consentForDestinations,
      "GA4"
    );
    const marketingContextAllowed = shouldSendToDestination(
      workspace.consentMode,
      consentForDestinations,
      "META"
    );
    const internalAnalyticsOnly =
      payload.consent.analyticsAllowed === true &&
      explicitlyDeniedAdvertising;
    const sharedContextAllowed = analyticsContextAllowed || marketingContextAllowed;
    const hasExplicitConsentDecision =
      payload.consent.analyticsAllowed !== undefined ||
      payload.consent.marketingAllowed !== undefined ||
      payload.consent.saleOfDataAllowed !== undefined;
    // Consent denial is a deletion boundary, not merely a delivery filter.
    // Timestamped tombstones stop older email/cart/order keys from restoring
    // identifiers after a later opt-in. Missing consent categories still fail
    // closed for STRICT delivery, but only an explicit false materializes a
    // category tombstone. Shared context is cleared only when both categories
    // were explicitly denied.
    if (hasExplicitConsentDenial) {
      await clearSessionContextForIdentifiers(workspace.id, sessionIdentifiers, {
        marketing: explicitlyDeniedMarketing,
        saleOfData: explicitlyDeniedSaleOfData,
        analytics: explicitlyDeniedAnalytics,
        shared: explicitlyDeniedAdvertising && explicitlyDeniedAnalytics,
        observedAt: payload.timestamp,
      });
    }

    if (
      workspace.id &&
      (sessionIdentifiers.email ||
        sessionIdentifiers.trackclearSessionId ||
        sessionIdentifiers.checkoutToken ||
        sessionIdentifiers.cartToken ||
        sessionIdentifiers.orderId ||
        sessionIdentifiers.orderName) &&
      ((marketingContextAllowed &&
        (payload.fbp || resolvedFbc || payload.ttclid || payload.ttp || payload.rdtCid ||
         payload.epik || payload.gclid || payload.gbraid || payload.wbraid)) ||
       (analyticsContextAllowed && payload.gaClientId) ||
       (sharedContextAllowed &&
        (payload.utmSource || payload.utmMedium || payload.utmCampaign || payload.utmContent ||
         payload.utmTerm || payload.attributionTimestamp || payload.attributionSource ||
         (clientIp && clientIp !== "unknown") || userAgent || payload.url)) ||
       hasExplicitConsentDecision)
    ) {
      await storeSessionContextForIdentifiers(workspace.id, sessionIdentifiers, {
        fbp: marketingContextAllowed ? payload.fbp : null,
        fbc: marketingContextAllowed ? resolvedFbc : null,
        ttclid: marketingContextAllowed ? payload.ttclid : null,
        ttp: marketingContextAllowed ? payload.ttp : null,
        rdtCid: marketingContextAllowed ? payload.rdtCid : null,
        epik: marketingContextAllowed ? payload.epik : null,
        gaClientId: analyticsContextAllowed ? payload.gaClientId : null,
        gbraid: marketingContextAllowed ? payload.gbraid : null,
        wbraid: marketingContextAllowed ? payload.wbraid : null,
        clientIp: sharedContextAllowed ? clientIp : null,
        userAgent: sharedContextAllowed ? userAgent : null,
        url: sharedContextAllowed ? payload.url : null,
        utmSource: sharedContextAllowed ? payload.utmSource : null,
        utmMedium: sharedContextAllowed ? payload.utmMedium : null,
        utmCampaign: sharedContextAllowed ? payload.utmCampaign : null,
        utmContent: sharedContextAllowed ? payload.utmContent : null,
        utmTerm: sharedContextAllowed ? payload.utmTerm : null,
        gclid: marketingContextAllowed ? payload.gclid : null,
        attributionTimestamp: sharedContextAllowed ? payload.attributionTimestamp : null,
        attributionSource: sharedContextAllowed ? payload.attributionSource : null,
        observedAt: payload.timestamp,
        consent: payload.consent,
      });
    }

    // Keep the durable outbox and retry envelope within the same consent
    // boundary as live delivery. A GA4-only event must not retain advertising
    // identifiers or checkout PII merely because those fields were submitted.
    const consentScopedContext = {
      url: sharedContextAllowed ? payload.url : "",
      referrer: sharedContextAllowed ? payload.referrer : "",
      trackclearSessionId: marketingContextAllowed
        ? sessionIdentifiers.trackclearSessionId
        : null,
      fbp: marketingContextAllowed ? payload.fbp : null,
      fbc: marketingContextAllowed ? resolvedFbc : null,
      fbclid: marketingContextAllowed ? payload.fbclid : null,
      gbraid: marketingContextAllowed ? payload.gbraid : null,
      wbraid: marketingContextAllowed ? payload.wbraid : null,
      ttclid: marketingContextAllowed ? payload.ttclid : null,
      ttp: marketingContextAllowed ? payload.ttp : null,
      gclid: marketingContextAllowed ? payload.gclid : null,
      rdtCid: marketingContextAllowed ? payload.rdtCid : null,
      epik: marketingContextAllowed ? payload.epik : null,
      gaClientId: analyticsContextAllowed ? payload.gaClientId : null,
      userData: marketingContextAllowed ? payload.userData : {},
      clientIp: sharedContextAllowed ? clientIp : "unknown",
      userAgent: sharedContextAllowed ? userAgent : "",
      utmSource: sharedContextAllowed ? payload.utmSource : null,
      utmMedium: sharedContextAllowed ? payload.utmMedium : null,
      utmCampaign: sharedContextAllowed ? payload.utmCampaign : null,
      utmContent: sharedContextAllowed ? payload.utmContent : null,
      utmTerm: sharedContextAllowed ? payload.utmTerm : null,
    };

    // 8. Check the event toggle only after consent cleanup has been persisted.
    const eventToggleMap: Record<string, boolean> = {
      PageView: workspace.enablePageView,
      ViewContent: workspace.enableViewContent,
      AddToCart: workspace.enableAddToCart,
      InitiateCheckout: workspace.enableInitiateCheckout,
      Purchase: workspace.enablePurchase,
    };
    if (!eventToggleMap[payload.eventName]) {
      return NextResponse.json({ success: true, eventId: effectiveEventId, skipped: true }, { status: 200, headers: corsHeaders });
    }

    // 9. Consent is checked per-destination after building the destinations list.

    // 9b. The snippet remains a server-side fallback even after webhook
    // verification. Deterministic EventLog IDs plus the durable webhook's
    // per-destination reconciliation deduplicate healthy dual delivery, while
    // preserving Purchase tracking if orders/paid later stops arriving.

    // 10. Monetary fields were extracted before Purchase dedup so deterministic
    // Shopify IDs can be normalized.
    // 10b. Acquire a short Purchase contention lock. Durable dedup remains
    // destination-specific below so a partial fan-out can repair its missing
    // destination instead of being hidden by the first EventLog row.
    let purchaseOrderId: string | null = null;
    let purchaseLockAcquired: string | null = "OK";
    if (payload.eventName === "Purchase") {
      purchaseOrderId = extracted.orderId;
      if (purchaseOrderId) {
        // Atomic orderId dedup lock (prevents race between snippet and webhook)
        const dedupLockKey = `dedup:purchase:${workspace.id}:${
          normalizedPurchaseOrderId ?? purchaseOrderId
        }`;
        purchaseLockAcquired = await getSharedRedis()
          .set(dedupLockKey, "snippet", "EX", 300, "NX")
          .catch(() => "OK");
      }
    }

    // 11. Build the list of enabled destinations
    const destinations: Array<{
      destination: keyof typeof DESTINATION_EVENT_MAP;
      queue: Queue;
      jobName: string;
    }> = [];

    // Meta (if credentials are configured - preserves existing behavior)
    if (hasMetaCredentials) {
      destinations.push({
        destination: "META",
        queue: getEventQueue(),
        jobName: "send-meta-event",
      });
    }

    // TikTok
    if (hasTiktokCredentials) {
      destinations.push({
        destination: "TIKTOK",
        queue: getTiktokQueue(),
        jobName: "send-tiktok-event",
      });
    }

    // GA4
    if (hasGA4Credentials) {
      destinations.push({
        destination: "GA4",
        queue: getGA4Queue(),
        jobName: "send-ga4-event",
      });
    }

    // Klaviyo (skip PageView - too noisy for email platform)
    if (hasKlaviyoCredentials && payload.eventName !== "PageView" && (payload.userData?.email || payload.userData?.phone)) {
      destinations.push({
        destination: "KLAVIYO",
        queue: getKlaviyoQueue(),
        jobName: "send-klaviyo-event",
      });
    }

    // Reddit
    if (hasRedditCredentials) {
      destinations.push({
        destination: "REDDIT",
        queue: getRedditQueue(),
        jobName: "send-reddit-event",
      });
    }

    // Pinterest
    if (hasPinterestCredentials) {
      destinations.push({
        destination: "PINTEREST",
        queue: getPinterestQueue(),
        jobName: "send-pinterest-event",
      });
    }

    // Google Ads (no encryption -- Conversion ID and Labels are public)
    if (hasGoogleAdsCredentials) {
      destinations.push({
        destination: "GOOGLE_ADS",
        queue: getGoogleAdsQueue(),
        jobName: "send-google-ads-event",
      });
    }

    // Filter out destinations where this event type is not mapped (null)
    const filteredDestinations = destinations.filter((dest) => {
      const map = DESTINATION_EVENT_MAP[dest.destination as keyof typeof DESTINATION_EVENT_MAP];
      if (!map) return true; // unknown destination, allow
      return map[payload.eventName as keyof typeof map] !== null;
    });

    // Filter to specific destinations if requested (used by checkout_contact_info_submitted for Klaviyo-only)
    let targetDestinations = payload.onlyDestinations
      ? filteredDestinations.filter((d) => payload.onlyDestinations!.includes(d.destination))
      : filteredDestinations;

    // Exclude specific destinations if requested (used by checkout_started to defer META enrichment)
    if (payload.excludeDestinations) {
      targetDestinations = targetDestinations.filter(
        (d) => !payload.excludeDestinations!.includes(d.destination)
      );
    }

    targetDestinations = filterDestinationsForWorkspace(workspace, targetDestinations);

    // 11b. Filter destinations by per-destination consent
    const consentFilteredDestinations = targetDestinations.filter((dest) =>
      shouldSendToDestination(
        workspace.consentMode,
        consentForDestinations,
        dest.destination
      )
    );

    // A verified normal-Shopify webhook is the authoritative Purchase source.
    // Shopify documents order.id on checkout_completed and checkout.token as
    // the cross-system key to the order webhook. If both (plus every other
    // durable alias) are absent, a random browser event ID cannot be safely
    // reconciled and may double-count the same order when the webhook arrives.
    // Fail closed for this malformed V1 browser event; legacy/headless callers
    // retain their existing fallback behavior.
    const isAliasFreeVerifiedWebhookPurchase =
      payload.eventName === "Purchase" &&
      workspace.hasVerifiedShopifyWebhook &&
      resolveWorkspaceProductMode(workspace) === SHOPIFY_META_TIKTOK_V1 &&
      resolveWorkspaceInstallType(workspace) === SHOPIFY_CUSTOM_PIXEL &&
      !normalizedPurchaseOrderId &&
      !normalizedPurchaseOrderName &&
      !sessionIdentifiers.checkoutToken &&
      !sessionIdentifiers.cartToken;
    if (isAliasFreeVerifiedWebhookPurchase) {
      log.warn("Skipping alias-free browser Purchase for verified Shopify webhook", {
        workspaceId: workspace.id,
        eventId: effectiveEventId,
      });
      return NextResponse.json(
        {
          success: true,
          eventId: effectiveEventId,
          skipped: true,
          reason: "missing_shopify_purchase_identity",
        },
        { status: 200, headers: corsHeaders }
      );
    }

    if (consentFilteredDestinations.length === 0) {
      // Shopify classifies attribution under analytics processing. When that
      // category is allowed but marketing is denied, preserve only anonymous
      // first-party reporting fields. This row is never queued to a platform,
      // never consumes a Purchase billing unit, and contains no raw shopper,
      // click, browser, session, cart, checkout, order, or event identifiers.
      // Destination-specific follow-up calls are excluded so a Meta/Klaviyo
      // enrichment request cannot create a second internal funnel event.
      if (internalAnalyticsOnly && !payload.onlyDestinations?.length) {
        await persistInternalAttributionEvent({
          workspaceId: workspace.id,
          eventName: payload.eventName as EventName,
          eventId: effectiveEventId,
          dedupKey:
            normalizedPurchaseOrderName ??
            normalizedPurchaseOrderId ??
            sessionIdentifiers.checkoutToken ??
            sessionIdentifiers.cartToken ??
            effectiveEventId,
          url: payload.url,
          referrer: payload.referrer,
          utmSource: payload.utmSource,
          utmMedium: payload.utmMedium,
          utmCampaign: payload.utmCampaign,
          utmContent: payload.utmContent,
          utmTerm: payload.utmTerm,
          value: extracted.value,
          currency: extracted.currency,
          numItems: extracted.numItems,
        });
        return NextResponse.json(
          {
            success: true,
            eventId: effectiveEventId,
            skipped: true,
            reason: "internal_analytics_only",
            internalAnalytics: true,
            destinations: [],
          },
          { status: 200, headers: corsHeaders }
        );
      }

      return NextResponse.json(
        { success: true, eventId: effectiveEventId, skipped: true },
        { status: 200, headers: corsHeaders }
      );
    }

    let purchaseAlreadyCounted = false;
    let destinationsToCreate = consentFilteredDestinations;
    if (payload.eventName === "Purchase") {
      const existingRows = await db.eventLog.findMany({
        where: {
          workspaceId: workspace.id,
          eventName: "Purchase",
          OR: [
            { eventId: effectiveEventId },
            ...(purchaseOrderId
              ? [{
                  orderId: {
                    in: Array.from(new Set([
                      purchaseOrderId,
                      normalizedPurchaseOrderId,
                    ].filter((value): value is string => !!value))),
                  },
                }]
              : []),
            ...(sessionIdentifiers.orderName
              ? [{
                  orderName: {
                    in: Array.from(new Set([
                      sessionIdentifiers.orderName,
                      normalizedPurchaseOrderName,
                    ].filter((value): value is string => !!value))),
                  },
                }]
              : []),
            ...(sessionIdentifiers.checkoutToken
              ? [{ checkoutToken: sessionIdentifiers.checkoutToken }]
              : []),
            ...(sessionIdentifiers.cartToken
              ? [{ cartToken: sessionIdentifiers.cartToken }]
              : []),
          ] as any,
          // FAILED canonical rows remain reserved for deterministic replay. A
          // later browser fallback must not create a second event ID for that
          // destination while the canonical retry can still deliver.
          status: { in: ["SENT", "PENDING", "RETRYING", "FAILED"] },
          destination: {
            in: consentFilteredDestinations.map((dest) => dest.destination),
          },
        },
        select: { destination: true },
      });
      purchaseAlreadyCounted = existingRows.length > 0;
      const durableDestinations = new Set<string>(
        existingRows.map((row) => row.destination)
      );
      destinationsToCreate = consentFilteredDestinations.filter(
        (dest) => !durableDestinations.has(dest.destination)
      );

      if (!purchaseLockAcquired && existingRows.length === 0) {
        // Lock contention without a durable row is not deduplication proof.
        // Continue into idempotent EventLog creation so a crashed first
        // claimant cannot create a five-minute Purchase blind spot.
        log.warn("Purchase dedup lock held without durable owner; continuing", {
          workspaceId: workspace.id,
          eventId: effectiveEventId,
          orderId: purchaseOrderId,
        });
      }

      if (destinationsToCreate.length === 0) {
        return NextResponse.json(
          {
            success: true,
            eventId: effectiveEventId,
            deduplicated: true,
            destinations: [],
          },
          { status: 200, headers: corsHeaders }
        );
      }
    }

    // 12. Apply abuse throttling before reserving a monthly billing unit. A
    // rejected request must not consume usage permanently.
    if (payload.eventName === "Purchase" && !purchaseAlreadyCounted) {
      const purchaseRL = await checkPurchaseRateLimit(workspace.id);
      if (!purchaseRL.allowed) {
        return NextResponse.json({ error: "Purchase rate limited" }, { status: 429, headers: corsHeaders });
      }
    }

    // 12b. Check order limits (only Purchase events count; others are always free)
    // Placed here so billing is only charged when the event will actually be processed
    // (after dedup, toggle, destination, and consent checks have all passed).
    const purchaseBillingIdentity = payload.eventName === "Purchase"
      ? {
          workspaceId: workspace.id,
          eventId: effectiveEventId,
          aliases: buildPurchaseBillingAliases({
            workspaceId: workspace.id,
            shopifyOrderId: sessionIdentifiers.orderId,
            orderName: sessionIdentifiers.orderName,
            checkoutToken: sessionIdentifiers.checkoutToken,
            cartToken: sessionIdentifiers.cartToken,
          }),
        }
      : undefined;
    const purchaseOutboxIdentity = payload.eventName === "Purchase"
      ? {
          workspaceId: workspace.id,
          eventId: effectiveEventId,
          orderId: normalizedPurchaseOrderId,
          orderName: normalizedPurchaseOrderName,
          checkoutToken: sessionIdentifiers.checkoutToken,
          cartToken: sessionIdentifiers.cartToken,
        }
      : undefined;
    let billing: BillingCheck = { allowed: true };
    if (!purchaseAlreadyCounted) {
      billing = await checkOrderLimits(
        workspace.userId,
        payload.eventName,
        purchaseBillingIdentity
      );
    }
    if (!billing.allowed) {
      return NextResponse.json(
        { error: billing.reason || "Order limit reached", limit: billing.limit, used: billing.used },
        { status: 402, headers: corsHeaders }
      );
    }

    // 13. Persist every destination delivery before queueing it. Top-funnel
    // events use the same short plan-based retention as conversions, which
    // makes delivery failures visible and recoverable instead of fire-and-forget.

    const retryEvent: EventRetryEnvelope["event"] = {
      eventName: payload.eventName,
      eventId: effectiveEventId,
      timestamp: payload.timestamp,
      url: consentScopedContext.url,
      referrer: consentScopedContext.referrer,
      trackclearSessionId: consentScopedContext.trackclearSessionId,
      fbp: consentScopedContext.fbp,
      fbc: consentScopedContext.fbc,
      fbclid: consentScopedContext.fbclid,
      gbraid: consentScopedContext.gbraid,
      wbraid: consentScopedContext.wbraid,
      ttclid: consentScopedContext.ttclid,
      ttp: consentScopedContext.ttp,
      gclid: consentScopedContext.gclid,
      rdtCid: consentScopedContext.rdtCid,
      epik: consentScopedContext.epik,
      gaClientId: consentScopedContext.gaClientId,
      userData: consentScopedContext.userData,
      customData: normalizedCustomData,
      clientIp: consentScopedContext.clientIp,
      userAgent: consentScopedContext.userAgent,
    };
    const retryEnvelopeColumns = encryptEventRetryEnvelope({ version: 1, event: retryEvent });

    const eventLogBaseData = {
      workspaceId: workspace.id,
      eventName: payload.eventName as any,
      eventId: effectiveEventId,
      status: "PENDING" as const,
      payload: buildEventLogPayload({
        eventName: payload.eventName,
        customData: normalizedCustomData,
        userData: consentScopedContext.userData,
        fbp: consentScopedContext.fbp,
        fbc: consentScopedContext.fbc,
        fbclid: consentScopedContext.fbclid,
        gbraid: consentScopedContext.gbraid,
        wbraid: consentScopedContext.wbraid,
        ttclid: consentScopedContext.ttclid,
        ttp: consentScopedContext.ttp,
        rdtCid: consentScopedContext.rdtCid,
        epik: consentScopedContext.epik,
        gclid: consentScopedContext.gclid,
      }) as any,
      customerIp: consentScopedContext.clientIp === "unknown" ? null : consentScopedContext.clientIp,
      userAgent: consentScopedContext.userAgent || null,
      fbp: consentScopedContext.fbp || null,
      fbc: consentScopedContext.fbc || null,
      pageUrl: consentScopedContext.url || null,
      value: extracted.value,
      currency: extracted.currency,
      numItems: extracted.numItems,
      orderId: normalizedPurchaseOrderId,
      orderName: normalizedPurchaseOrderName,
      checkoutToken: sessionIdentifiers.checkoutToken,
      cartToken: sessionIdentifiers.cartToken,
      utmSource: consentScopedContext.utmSource || null,
      utmMedium: consentScopedContext.utmMedium || null,
      utmCampaign: consentScopedContext.utmCampaign || null,
      utmContent: consentScopedContext.utmContent || null,
      utmTerm: consentScopedContext.utmTerm || null,
      gclid: consentScopedContext.gclid || null,
      ttclid: consentScopedContext.ttclid || null,
      rdtCid: consentScopedContext.rdtCid || null,
      epik: consentScopedContext.epik || null,
      ...retryEnvelopeColumns,
    };
    const {
      workspaceId: _workspaceId,
      eventName: _eventName,
      eventId: _eventId,
      status: _status,
      ...checkoutEnrichmentData
    } = eventLogBaseData;

    // EventLogs are the delivery outbox. Persist the entire destination fan-out
    // in one database transaction so a single write failure cannot permanently
    // omit one platform. Upsert makes concurrent identical ingests idempotent.
    const eventLogEntries = await (async () => {
      try {
        return await db.$transaction((tx) =>
          Promise.all(
            destinationsToCreate.map(async (dest) => {
              const entry = await tx.eventLog.upsert({
                where: {
                  workspaceId_eventId_destination: {
                    workspaceId: workspace.id,
                    eventId: effectiveEventId,
                    destination: dest.destination as any,
                  },
                },
                create: {
                  ...eventLogBaseData,
                  destination: dest.destination as any,
                },
                update: {},
              });
              let shouldQueue = true;

              // checkout_started creates one delayed outbox row per enrichment
              // destination (Meta/TikTok). Shopify's contact-info event reuses
              // that event ID and may add email/phone a moment later. Refresh
              // only an unclaimed PENDING row so the worker either reads the
              // richer encrypted envelope or has already fixed the immutable
              // payload it will send. Terminal/in-flight rows are never
              // reopened and the retained deterministic job stays singular.
              if (
                isCheckoutEnrichmentRequest &&
                CHECKOUT_ENRICHMENT_DESTINATIONS.includes(dest.destination)
              ) {
                const refreshed = await tx.eventLog.updateMany({
                  where: {
                    id: entry.id,
                    status: "PENDING",
                    deliveryClaimToken: null,
                    deliveryClaimOwner: null,
                    deliveryClaimedAt: null,
                    deliveryClaimExpiresAt: null,
                  },
                  data: checkoutEnrichmentData,
                });
                shouldQueue = refreshed.count === 1;
              }

              return { entry, destination: dest, shouldQueue };
            })
          )
        );
      } catch (error) {
        if (billing.reservation && purchaseOutboxIdentity) {
          const recovery =
            await recoverPurchaseBillingReservationAfterOutboxFailure(
              billing.reservation,
              purchaseOutboxIdentity
            );
          log.warn("Purchase outbox write failed after billing reservation", {
            workspaceId: workspace.id,
            eventId: effectiveEventId,
            billingRecovery: recovery,
          });
        }
        throw error;
      }
    })();

    const validEventLogEntries = eventLogEntries.filter(
      (result) => result.shouldQueue
    );
    const validEntries = validEventLogEntries.map((result) => result.entry);
    const validDestinations = validEventLogEntries.map(
      (result) => result.destination
    );
    const queueDelayForDestination = (destination: string) => {
      if (
        CHECKOUT_ENRICHMENT_DESTINATIONS.includes(destination) &&
        payload.eventName === "InitiateCheckout" &&
        !isCheckoutEnrichmentRequest
      ) {
        return CHECKOUT_ENRICHMENT_DELAY_MS;
      }
      return payload.eventName === "Purchase" && workspace.hasVerifiedShopifyWebhook
        ? VERIFIED_WEBHOOK_PURCHASE_GRACE_MS
        : undefined;
    };

    if (validEntries.length === 0) {
      return NextResponse.json(
        { success: true, eventId: effectiveEventId, deduplicated: true },
        { status: 200, headers: corsHeaders }
      );
    }

    // Queue jobs for all destinations in parallel (credentials looked up by workers from DB)
    await Promise.all(
      validDestinations.map((dest, idx) => {
        const eventLogId = validEntries[idx].id;
        const queueDelay = queueDelayForDestination(dest.destination);

        if (dest.destination === "META") {
          return dest.queue.add(
            dest.jobName,
            {
              workspaceId: workspace.id,
              requestId,
              event: {
                eventName: payload.eventName,
                eventId: effectiveEventId,
                timestamp: payload.timestamp,
                url: consentScopedContext.url,
                referrer: consentScopedContext.referrer,
                trackclearSessionId: consentScopedContext.trackclearSessionId,
                fbp: consentScopedContext.fbp,
                fbc: consentScopedContext.fbc,
                fbclid: consentScopedContext.fbclid,
                gbraid: consentScopedContext.gbraid,
                wbraid: consentScopedContext.wbraid,
                userData: consentScopedContext.userData,
                customData: normalizedCustomData,
                clientIp: consentScopedContext.clientIp,
                userAgent: consentScopedContext.userAgent,
              },
              eventLogId,
            } satisfies MetaEventJob,
            {
              jobId: `event-${eventLogId}`,
              ...(queueDelay ? { delay: queueDelay } : {}),
            }
          );
        } else {
          return dest.queue.add(
            dest.jobName,
            {
              workspaceId: workspace.id,
              destination: dest.destination,
              requestId,
              eventLogId,
              event: {
                eventName: payload.eventName,
                eventId: effectiveEventId,
                timestamp: payload.timestamp,
                url: consentScopedContext.url,
                referrer: consentScopedContext.referrer,
                trackclearSessionId: consentScopedContext.trackclearSessionId,
                fbp: consentScopedContext.fbp,
                fbc: consentScopedContext.fbc,
                fbclid: consentScopedContext.fbclid,
                gbraid: consentScopedContext.gbraid,
                wbraid: consentScopedContext.wbraid,
                ttclid: consentScopedContext.ttclid,
                ttp: consentScopedContext.ttp,
                gclid: consentScopedContext.gclid,
                rdtCid: consentScopedContext.rdtCid,
                epik: consentScopedContext.epik,
                gaClientId: consentScopedContext.gaClientId,
                userData: consentScopedContext.userData,
                customData: normalizedCustomData,
                clientIp: consentScopedContext.clientIp,
                userAgent: consentScopedContext.userAgent,
              },
            } satisfies DestinationEventJob,
            {
              jobId: `event-${eventLogId}`,
              ...(queueDelay ? { delay: queueDelay } : {}),
            }
          );
        }
      })
    );

    if (!payload.onlyDestinations?.length) {
      await supersedeInternalAttributionEvent({
        workspaceId: workspace.id,
        eventName: payload.eventName as EventName,
        eventId: effectiveEventId,
        dedupKey:
          normalizedPurchaseOrderName ??
          normalizedPurchaseOrderId ??
          sessionIdentifiers.checkoutToken ??
          sessionIdentifiers.cartToken ??
          effectiveEventId,
      });
    }

    // 13. Return success
    const response: any = {
      success: true,
      eventId: effectiveEventId,
      destinations: validDestinations.map((d) => d.destination),
    };
    if (billing.upgraded) {
      response.upgraded = true;
      response.newPlan = billing.newPlan;
    }
    return NextResponse.json(response, { status: 200, headers: { ...corsHeaders, "X-Request-ID": requestId } });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid payload", details: error.errors }, { status: 422, headers: corsHeaders });
    }
    log.error("Ingest error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: corsHeaders });
  }
}
