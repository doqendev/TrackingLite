import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEventQueue } from "@/lib/queue";
import { shouldSendEvent } from "@/lib/consent";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkOrderLimits, incrementOrderCount } from "@/lib/billing";
import { z } from "zod";

const IngestPayloadSchema = z.object({
  eventName: z.enum(["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase"]),
  eventId: z.string().min(1),
  timestamp: z.number(),
  url: z.string().optional().default(""),
  referrer: z.string().optional().default(""),
  fbp: z.string().nullable().optional(),
  fbc: z.string().nullable().optional(),
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

    // 2. Look up workspace by API key
    const workspace = await db.workspace.findUnique({
      where: { apiKey },
      select: {
        id: true,
        userId: true,
        isActive: true,
        metaPixelId: true,
        metaAccessTokenEncrypted: true,
        metaAccessTokenIv: true,
        metaAccessTokenTag: true,
        metaTestEventCode: true,
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

    // 3. Check Meta credentials configured
    if (!workspace.metaPixelId || !workspace.metaAccessTokenEncrypted) {
      return NextResponse.json({ error: "Meta credentials not configured" }, { status: 422, headers: corsHeaders });
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

    // 10. Create EventLog record
    const eventLog = await db.eventLog.create({
      data: {
        workspaceId: workspace.id,
        eventName: payload.eventName as any,
        eventId: payload.eventId,
        status: "PENDING",
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
      },
    });

    // 11. Queue Meta CAPI send
    await getEventQueue().add("send-meta-event", {
      workspaceId: workspace.id,
      pixelId: workspace.metaPixelId,
      accessToken: workspace.metaAccessTokenEncrypted,
      accessTokenIv: workspace.metaAccessTokenIv,
      accessTokenTag: workspace.metaAccessTokenTag,
      testEventCode: workspace.metaTestEventCode,
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
      eventLogId: eventLog.id,
    });

    // 12. Increment order count only for Purchase events
    if (payload.eventName === "Purchase") {
      await incrementOrderCount(workspace.userId);
    }

    // 13. Return success
    const response: any = { success: true, eventId: payload.eventId };
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
