import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getEventQueue,
  getGoogleQueue,
  getTiktokQueue,
  getGA4Queue,
  getKlaviyoQueue,
} from "@/lib/queue";
import type { MetaEventJob, DestinationEventJob } from "@/lib/queue";
import { shouldSendEvent } from "@/lib/consent";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkOrderLimits, incrementOrderCount } from "@/lib/billing";
import { extractCustomData } from "@/lib/extract-custom-data";
import { DESTINATION_EVENT_MAP } from "@/lib/destinations";
import { z } from "zod";
import type { Queue } from "bullmq";

const IngestPayloadSchema = z.object({
  eventName: z.enum(["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase"]),
  eventId: z.string().min(1),
  timestamp: z.number(),
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
  consent: z.object({
    analyticsAllowed: z.boolean().optional(),
    marketingAllowed: z.boolean().optional(),
  }).optional().default({}),
  userData: z.object({
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    firstName: z.string().nullable().optional(),
    lastName: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
    zip: z.string().nullable().optional(),
    countryCode: z.string().nullable().optional(),
  }).optional().default({}),
  customData: z.record(z.unknown()).optional().default({}),
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
  try {
    // 1. Extract and validate API key
    const apiKey = request.headers.get("X-TL-API-Key");
    if (!apiKey) {
      return NextResponse.json({ error: "Missing API key" }, { status: 401, headers: corsHeaders });
    }

    // 2. Look up workspace by API key (include all destination fields)
    const workspace = await db.workspace.findUnique({
      where: { apiKey },
      select: {
        id: true,
        userId: true,
        isActive: true,
        // Meta fields
        metaPixelId: true,
        metaAccessTokenEncrypted: true,
        metaAccessTokenIv: true,
        metaAccessTokenTag: true,
        metaTestEventCode: true,
        enableMeta: true,
        // Google Ads fields
        enableGoogleAds: true,
        googleAdsConversionId: true,
        googleAdsViewContentLabel: true,
        googleAdsAddToCartLabel: true,
        googleAdsCheckoutLabel: true,
        googleAdsPurchaseLabel: true,
        // TikTok fields
        enableTikTok: true,
        tiktokPixelId: true,
        tiktokAccessTokenEncrypted: true,
        tiktokAccessTokenIv: true,
        tiktokAccessTokenTag: true,
        // GA4 fields
        enableGA4: true,
        ga4MeasurementId: true,
        ga4ApiSecretEncrypted: true,
        ga4ApiSecretIv: true,
        ga4ApiSecretTag: true,
        // Klaviyo fields
        enableKlaviyo: true,
        klaviyoApiKeyEncrypted: true,
        klaviyoApiKeyIv: true,
        klaviyoApiKeyTag: true,
        // Event toggles and consent
        consentMode: true,
        enablePageView: true,
        enableViewContent: true,
        enableAddToCart: true,
        enableInitiateCheckout: true,
        enablePurchase: true,
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401, headers: corsHeaders });
    }

    if (!workspace.isActive) {
      return NextResponse.json({ error: "Workspace inactive" }, { status: 403, headers: corsHeaders });
    }

    // 3. Check that at least one destination has credentials configured
    const hasMetaCredentials = !!(workspace.enableMeta && workspace.metaPixelId && workspace.metaAccessTokenEncrypted);
    const hasGoogleAdsCredentials = !!(workspace.enableGoogleAds && workspace.googleAdsConversionId);
    const hasTiktokCredentials = !!(workspace.enableTikTok && workspace.tiktokAccessTokenEncrypted);
    const hasGA4Credentials = !!(workspace.enableGA4 && workspace.ga4ApiSecretEncrypted);
    const hasKlaviyoCredentials = !!(workspace.enableKlaviyo && workspace.klaviyoApiKeyEncrypted);

    if (!hasMetaCredentials && !hasGoogleAdsCredentials && !hasTiktokCredentials && !hasGA4Credentials && !hasKlaviyoCredentials) {
      return NextResponse.json({ error: "No destination credentials configured" }, { status: 422, headers: corsHeaders });
    }

    // 4. Rate limit check
    const rateLimit = await checkRateLimit(workspace.id);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: corsHeaders });
    }

    // 5. Parse and validate payload (need eventName before billing check)
    const body = await request.json();
    const payload = IngestPayloadSchema.parse(body);

    // 6. Check order limits (only Purchase events count; others are always free)
    const billing = await checkOrderLimits(workspace.userId, payload.eventName);
    if (!billing.allowed) {
      return NextResponse.json(
        { error: billing.reason || "Order limit reached", limit: billing.limit, used: billing.used },
        { status: 402, headers: corsHeaders }
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

    // 8. Check consent
    const customerConsent = {
      analytics: payload.consent?.analyticsAllowed,
      marketing: payload.consent?.marketingAllowed,
    };
    if (!shouldSendEvent(workspace.consentMode, customerConsent)) {
      return NextResponse.json({ success: true, eventId: payload.eventId, skipped: true }, { status: 200, headers: corsHeaders });
    }

    // 9. Extract IP and User-Agent from request
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                     request.headers.get("x-real-ip") ||
                     "unknown";
    const userAgent = request.headers.get("user-agent") || "";

    // 10. Extract monetary fields from customData
    const extracted = extractCustomData(payload.customData);

    // 11. Build the list of enabled destinations
    const destinations: Array<{
      destination: string;
      queue: Queue;
      jobName: string;
      credentials: Record<string, string>;
    }> = [];

    // Meta (if credentials are configured - preserves existing behavior)
    if (hasMetaCredentials) {
      destinations.push({
        destination: "META",
        queue: getEventQueue(),
        jobName: "send-meta-event",
        credentials: {
          pixelId: workspace.metaPixelId!,
          accessToken: workspace.metaAccessTokenEncrypted!,
          accessTokenIv: workspace.metaAccessTokenIv!,
          accessTokenTag: workspace.metaAccessTokenTag!,
          testEventCode: workspace.metaTestEventCode || "",
        },
      });
    }

    // Google Ads
    if (hasGoogleAdsCredentials) {
      destinations.push({
        destination: "GOOGLE_ADS",
        queue: getGoogleQueue(),
        jobName: "send-google-event",
        credentials: {
          conversionId: workspace.googleAdsConversionId || "",
          viewContentLabel: workspace.googleAdsViewContentLabel || "",
          addToCartLabel: workspace.googleAdsAddToCartLabel || "",
          checkoutLabel: workspace.googleAdsCheckoutLabel || "",
          purchaseLabel: workspace.googleAdsPurchaseLabel || "",
        },
      });
    }

    // TikTok
    if (hasTiktokCredentials) {
      destinations.push({
        destination: "TIKTOK",
        queue: getTiktokQueue(),
        jobName: "send-tiktok-event",
        credentials: {
          pixelId: workspace.tiktokPixelId || "",
          accessToken: workspace.tiktokAccessTokenEncrypted!,
          accessTokenIv: workspace.tiktokAccessTokenIv!,
          accessTokenTag: workspace.tiktokAccessTokenTag!,
        },
      });
    }

    // GA4
    if (hasGA4Credentials) {
      destinations.push({
        destination: "GA4",
        queue: getGA4Queue(),
        jobName: "send-ga4-event",
        credentials: {
          measurementId: workspace.ga4MeasurementId || "",
          apiSecret: workspace.ga4ApiSecretEncrypted!,
          apiSecretIv: workspace.ga4ApiSecretIv!,
          apiSecretTag: workspace.ga4ApiSecretTag!,
        },
      });
    }

    // Klaviyo (skip PageView - too noisy for email platform)
    if (hasKlaviyoCredentials && payload.eventName !== "PageView") {
      destinations.push({
        destination: "KLAVIYO",
        queue: getKlaviyoQueue(),
        jobName: "send-klaviyo-event",
        credentials: {
          apiKey: workspace.klaviyoApiKeyEncrypted!,
          apiKeyIv: workspace.klaviyoApiKeyIv!,
          apiKeyTag: workspace.klaviyoApiKeyTag!,
        },
      });
    }

    // Filter out destinations where this event type is not mapped (null)
    const filteredDestinations = destinations.filter((dest) => {
      const map = DESTINATION_EVENT_MAP[dest.destination as keyof typeof DESTINATION_EVENT_MAP];
      if (!map) return true; // unknown destination, allow
      return map[payload.eventName as keyof typeof map] !== null;
    });

    // 12. Create EventLog entries and queue jobs for each destination
    const eventLogBaseData = {
      workspaceId: workspace.id,
      eventName: payload.eventName as any,
      eventId: payload.eventId,
      status: "PENDING" as const,
      payload: {
        eventName: payload.eventName,
        customData: payload.customData,
        hasUserData: !!(payload.userData?.email || payload.userData?.phone),
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
    };

    // Create all EventLog entries (one per destination)
    const eventLogEntries = await Promise.all(
      filteredDestinations.map((dest) =>
        db.eventLog.create({
          data: {
            ...eventLogBaseData,
            destination: dest.destination as any,
          },
        })
      )
    );

    // Queue jobs for all destinations in parallel
    await Promise.all(
      filteredDestinations.map((dest, idx) => {
        const eventLogId = eventLogEntries[idx].id;

        if (dest.destination === "META") {
          // Use existing MetaEventJob format for backward compatibility
          return dest.queue.add(dest.jobName, {
            workspaceId: workspace.id,
            pixelId: dest.credentials.pixelId,
            accessToken: dest.credentials.accessToken,
            accessTokenIv: dest.credentials.accessTokenIv,
            accessTokenTag: dest.credentials.accessTokenTag,
            testEventCode: dest.credentials.testEventCode || undefined,
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
          // Use generic DestinationEventJob format
          return dest.queue.add(dest.jobName, {
            workspaceId: workspace.id,
            destination: dest.destination,
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
              userData: payload.userData,
              customData: payload.customData,
              clientIp,
              userAgent,
            },
            credentials: dest.credentials,
          } satisfies DestinationEventJob);
        }
      })
    );

    // 13. Increment order count only for Purchase events
    if (payload.eventName === "Purchase") {
      await incrementOrderCount(workspace.userId);
    }

    // 14. Return success
    const response: any = {
      success: true,
      eventId: payload.eventId,
      destinations: filteredDestinations.map((d) => d.destination),
    };
    if (billing.upgraded) {
      response.upgraded = true;
      response.newPlan = billing.newPlan;
    }
    return NextResponse.json(response, { status: 200, headers: corsHeaders });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload", details: error.errors }, { status: 422, headers: corsHeaders });
    }
    console.error("[Ingest] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: corsHeaders });
  }
}
