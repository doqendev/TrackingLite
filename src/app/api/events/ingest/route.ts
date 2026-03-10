import { NextRequest, NextResponse } from "next/server";
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
import { checkRateLimit, checkPurchaseRateLimit } from "@/lib/rate-limit";
import { checkOrderLimits } from "@/lib/billing";
import { extractCustomData } from "@/lib/extract-custom-data";
import { DESTINATION_EVENT_MAP } from "@/lib/destinations";
import { storeSessionContext } from "@/lib/session-enrichment";
import { getSharedRedis } from "@/lib/redis";
import { z } from "zod";
import type { Queue } from "bullmq";

const IngestPayloadSchema = z.object({
  eventName: z.enum(["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase"]),
  eventId: z.string().min(1),
  timestamp: z.number().positive(),
  url: z.string().optional().default(""),
  referrer: z.string().optional().default(""),
  fbp: z.string().nullable().optional(),
  fbc: z.string().nullable().optional(),
  ttclid: z.string().nullable().optional(),
  utmSource: z.string().nullable().optional(),
  utmMedium: z.string().nullable().optional(),
  utmCampaign: z.string().nullable().optional(),
  utmContent: z.string().nullable().optional(),
  utmTerm: z.string().nullable().optional(),
  gclid: z.string().nullable().optional(),
  rdtCid: z.string().nullable().optional(),
  epik: z.string().nullable().optional(),
  gaClientId: z.string().nullable().optional(),
  consent: z.object({
    analyticsAllowed: z.boolean().optional(),
    marketingAllowed: z.boolean().optional(),
  }).optional().default({}),
  userData: z.object({
    email: z.string().max(254).nullable().optional(),
    phone: z.string().max(30).nullable().optional(),
    firstName: z.string().max(100).nullable().optional(),
    lastName: z.string().max(100).nullable().optional(),
    city: z.string().max(100).nullable().optional(),
    state: z.string().max(100).nullable().optional(),
    zip: z.string().max(20).nullable().optional(),
    countryCode: z.string().max(10).nullable().optional(),
    customerId: z.string().max(100).nullable().optional(),
  }).optional().default({}),
  customData: z.record(z.unknown()).optional().default({}),
  onlyDestinations: z.array(z.string()).optional(),
  excludeDestinations: z.array(z.string()).optional(),
});

// CORS headers for cross-origin snippet requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-TL-API-Key",
};

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

    // 5. Parse and validate payload (need eventName before billing check)
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

    // 6b. Cross-source dedup: when Shopify webhook is active, skip snippet
    // Purchase events. The webhook has the orderId and is strictly more reliable
    // for purchases (catches PayPal, off-site payments). Without this, the same
    // order gets tracked twice — once by the snippet (no orderId) and once by
    // the webhook (with orderId) — and our dedup can't match them.
    if (payload.eventName === "Purchase" && workspace.hasShopifyWebhookSecret) {
      log.info("Skipping snippet Purchase — Shopify webhook active", { workspaceId: workspace.id, eventId: payload.eventId });
      return NextResponse.json(
        { success: true, eventId: payload.eventId, skipped: true, reason: "webhook_active" },
        { status: 200, headers: corsHeaders }
      );
    }

    // 7. Check event toggle
    const eventToggleMap: Record<string, boolean> = {
      PageView: workspace.enablePageView,
      ViewContent: workspace.enableViewContent,
      AddToCart: workspace.enableAddToCart,
      InitiateCheckout: workspace.enableInitiateCheckout,
      Purchase: workspace.enablePurchase,
    };
    if (!eventToggleMap[payload.eventName]) {
      return NextResponse.json({ success: true, eventId: payload.eventId, skipped: true }, { status: 200, headers: corsHeaders });
    }

    // 8. Consent is now checked per-destination after building the destinations list (step 11b)

    // 9. Extract IP and User-Agent from request
    // Validate IP format and truncate to 45 chars (max IPv6 length)
    const clientIp = (request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown").slice(0, 45);
    const userAgent = request.headers.get("user-agent") || "";

    // Store browser context for session enrichment (all events with email, including Purchase)
    if (
      payload.userData?.email &&
      workspace.id &&
      (payload.fbp || payload.fbc || payload.ttclid || payload.rdtCid ||
       payload.epik || payload.gaClientId || (clientIp && clientIp !== "unknown") || userAgent)
    ) {
      storeSessionContext(workspace.id, payload.userData.email, {
        fbp: payload.fbp,
        fbc: payload.fbc,
        ttclid: payload.ttclid,
        rdtCid: payload.rdtCid,
        epik: payload.epik,
        gaClientId: payload.gaClientId,
        clientIp,
        userAgent,
        url: payload.url,
        utmSource: payload.utmSource,
        utmMedium: payload.utmMedium,
        utmCampaign: payload.utmCampaign,
        utmContent: payload.utmContent,
        utmTerm: payload.utmTerm,
        gclid: payload.gclid,
        consent: payload.consent,
      });
    }

    // 10. Extract monetary fields from customData
    const extracted = extractCustomData(payload.customData);
    // 10b. Dedup: if this Purchase orderId was already tracked (e.g. by webhook), skip
    if (payload.eventName === "Purchase") {
      const orderId = extracted.orderId;
      if (orderId) {
        // Atomic orderId dedup lock (prevents race between snippet and webhook)
        const dedupLockKey = `dedup:purchase:${workspace.id}:${orderId}`;
        const lockAcquired = await getSharedRedis().set(dedupLockKey, "snippet", "EX", 300, "NX").catch(() => "OK");
        if (!lockAcquired) {
          // Another path (webhook) already claimed this orderId
          return NextResponse.json({ success: true, eventId: payload.eventId, deduplicated: true }, { status: 200, headers: corsHeaders });
        }
        const existingOrder = await db.eventLog.findFirst({
          where: {
            workspaceId: workspace.id,
            orderId,
            eventName: "Purchase",
            status: { in: ["SENT", "PENDING", "RETRYING"] },
          },
        });
        if (existingOrder) {
          return NextResponse.json(
            { success: true, eventId: payload.eventId, deduplicated: true, destinations: [] },
            { status: 200, headers: corsHeaders }
          );
        }
      }
    }

    // 11. Build the list of enabled destinations
    const destinations: Array<{
      destination: string;
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

    // 11b. Filter destinations by per-destination consent
    const consentFilteredDestinations = targetDestinations.filter((dest) =>
      shouldSendToDestination(
        workspace.consentMode,
        { analytics: payload.consent?.analyticsAllowed, marketing: payload.consent?.marketingAllowed },
        dest.destination
      )
    );

    if (consentFilteredDestinations.length === 0) {
      return NextResponse.json(
        { success: true, eventId: payload.eventId, skipped: true },
        { status: 200, headers: corsHeaders }
      );
    }

    // 12. Check order limits (only Purchase events count; others are always free)
    // Placed here so billing is only charged when the event will actually be processed
    // (after dedup, toggle, destination, and consent checks have all passed).
    const billing = await checkOrderLimits(workspace.userId, payload.eventName);
    if (!billing.allowed) {
      return NextResponse.json(
        { error: billing.reason || "Order limit reached", limit: billing.limit, used: billing.used },
        { status: 402, headers: corsHeaders }
      );
    }

    // 12b. Purchase-specific rate limit (prevents billing manipulation via fake events)
    if (payload.eventName === "Purchase") {
      const purchaseRL = await checkPurchaseRateLimit(workspace.id);
      if (!purchaseRL.allowed) {
        return NextResponse.json({ error: "Purchase rate limited" }, { status: 429, headers: corsHeaders });
      }
    }

    // 13. Create EventLog entries (only for conversions) and queue jobs for each destination
    const CONVERSION_EVENTS = new Set(["AddToCart", "InitiateCheckout", "Purchase"]);
    const isConversion = CONVERSION_EVENTS.has(payload.eventName);

    const eventLogBaseData = {
      workspaceId: workspace.id,
      eventName: payload.eventName as any,
      eventId: payload.eventId,
      status: "PENDING" as const,
      payload: {
        eventName: payload.eventName,
        customData: payload.customData,
        userData: payload.userData || {},
      } as any,
      customerIp: clientIp,
      userAgent,
      fbp: payload.fbp || null,
      fbc: payload.fbc || null,
      pageUrl: payload.url || null,
      value: extracted.value,
      currency: extracted.currency,
      numItems: extracted.numItems,
      orderId: extracted.orderId,
      utmSource: payload.utmSource || null,
      utmMedium: payload.utmMedium || null,
      utmCampaign: payload.utmCampaign || null,
      utmContent: payload.utmContent || null,
      utmTerm: payload.utmTerm || null,
      gclid: payload.gclid || null,
      ttclid: payload.ttclid || null,
      rdtCid: payload.rdtCid || null,
      epik: payload.epik || null,
    };

    // Create EventLog entries ONLY for conversion events (AddToCart, InitiateCheckout, Purchase)
    // PageView and ViewContent are fire-and-forget: sent to APIs but not stored
    let validEntries: Array<{ id: string }> = [];
    let validDestinations = consentFilteredDestinations;

    if (isConversion) {
      // Create all EventLog entries (one per destination), skip duplicates
      const eventLogEntries = await Promise.all(
        consentFilteredDestinations.map(async (dest) => {
          try {
            return await db.eventLog.create({
              data: {
                ...eventLogBaseData,
                destination: dest.destination as any,
              },
            });
          } catch (err: any) {
            // P2002 = unique constraint violation (duplicate eventId+destination)
            if (err?.code === "P2002") {
              return null;
            }
            throw err;
          }
        })
      );

      // Filter out duplicates (null entries)
      validEntries = eventLogEntries.filter((e): e is NonNullable<typeof e> => e !== null);
      validDestinations = consentFilteredDestinations.filter((_, idx) => eventLogEntries[idx] !== null);

      if (validEntries.length === 0) {
        return NextResponse.json(
          { success: true, eventId: payload.eventId, deduplicated: true },
          { status: 200, headers: corsHeaders }
        );
      }
    }

    // Queue jobs for all destinations in parallel (credentials looked up by workers from DB)
    await Promise.all(
      validDestinations.map((dest, idx) => {
        const eventLogId = isConversion ? validEntries[idx].id : null;

        if (dest.destination === "META") {
          return dest.queue.add(dest.jobName, {
            workspaceId: workspace.id,
            requestId,
            event: {
              eventName: payload.eventName,
              eventId: payload.eventId,
              timestamp: payload.timestamp,
              url: payload.url,
              referrer: payload.referrer,
              fbp: payload.fbp,
              fbc: payload.fbc,
              userData: payload.userData,
              customData: payload.customData,
              clientIp,
              userAgent,
            },
            eventLogId,
          } satisfies MetaEventJob);
        } else {
          return dest.queue.add(dest.jobName, {
            workspaceId: workspace.id,
            destination: dest.destination,
            requestId,
            eventLogId,
            event: {
              eventName: payload.eventName,
              eventId: payload.eventId,
              timestamp: payload.timestamp,
              url: payload.url,
              referrer: payload.referrer,
              fbp: payload.fbp,
              fbc: payload.fbc,
              ttclid: payload.ttclid,
              gclid: payload.gclid || null,
              rdtCid: payload.rdtCid || null,
              epik: payload.epik || null,
              gaClientId: payload.gaClientId || null,
              userData: payload.userData,
              customData: payload.customData,
              clientIp,
              userAgent,
            },
          } satisfies DestinationEventJob);
        }
      })
    );

    // 13. Return success
    const response: any = {
      success: true,
      eventId: payload.eventId,
      destinations: validDestinations.map((d) => d.destination),
    };
    if (billing.upgraded) {
      response.upgraded = true;
      response.newPlan = billing.newPlan;
    }
    return NextResponse.json(response, { status: 200, headers: { ...corsHeaders, "X-Request-ID": requestId } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload", details: error.errors }, { status: 422, headers: corsHeaders });
    }
    log.error("Ingest error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: corsHeaders });
  }
}
