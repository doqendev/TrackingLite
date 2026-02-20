import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getEventQueue,
  getGoogleQueue,
  getTiktokQueue,
  getGA4Queue,
  getKlaviyoQueue,
} from "@/lib/queue";
import type { MetaEventJob, DestinationEventJob } from "@/lib/queue";
import { checkReplayCooldown } from "@/lib/replay-rate-limit";

// POST /api/workspaces/:id/replay
// Body: { eventIds: string[] } for specific events, or { all: true } for all failed in last 7 days
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 1. Auth check
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Verify workspace belongs to user
  const workspace = await db.workspace.findFirst({
    where: { id, userId: session.user.id },
    select: {
      id: true,
      enableMeta: true,
      metaPixelId: true,
      metaAccessTokenEncrypted: true,
      metaAccessTokenIv: true,
      metaAccessTokenTag: true,
      metaTestEventCode: true,
      enableGoogleAds: true,
      googleAdsConversionIdEncrypted: true,
      googleAdsConversionIdIv: true,
      googleAdsConversionIdTag: true,
      googleAdsViewContentLabelEncrypted: true,
      googleAdsViewContentLabelIv: true,
      googleAdsViewContentLabelTag: true,
      googleAdsAddToCartLabelEncrypted: true,
      googleAdsAddToCartLabelIv: true,
      googleAdsAddToCartLabelTag: true,
      googleAdsCheckoutLabelEncrypted: true,
      googleAdsCheckoutLabelIv: true,
      googleAdsCheckoutLabelTag: true,
      googleAdsPurchaseLabelEncrypted: true,
      googleAdsPurchaseLabelIv: true,
      googleAdsPurchaseLabelTag: true,
      enableTikTok: true,
      tiktokPixelId: true,
      tiktokAccessTokenEncrypted: true,
      tiktokAccessTokenIv: true,
      tiktokAccessTokenTag: true,
      enableGA4: true,
      ga4MeasurementId: true,
      ga4ApiSecretEncrypted: true,
      ga4ApiSecretIv: true,
      ga4ApiSecretTag: true,
      enableKlaviyo: true,
      klaviyoApiKeyEncrypted: true,
      klaviyoApiKeyIv: true,
      klaviyoApiKeyTag: true,
    },
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // 3. Replay cooldown: max 1 bulk replay per 5 minutes per workspace
  const cooldown = await checkReplayCooldown(workspace.id);
  if (!cooldown.allowed) {
    return NextResponse.json(
      { error: "Replay rate limited", retryAfter: cooldown.retryAfter },
      { status: 429 }
    );
  }

  // 4. Parse body
  const body = await request.json();
  const { eventIds, all } = body as { eventIds?: string[]; all?: boolean };

  // 5. Build query for failed events
  const where: Record<string, unknown> = {
    workspaceId: workspace.id,
    status: "FAILED",
  };

  if (eventIds && Array.isArray(eventIds) && eventIds.length > 0) {
    where.id = { in: eventIds };
  } else if (all) {
    // All failed events in last 7 days, capped at 500
    where.createdAt = {
      gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    };
  } else {
    return NextResponse.json(
      { error: "Provide eventIds array or all: true" },
      { status: 400 }
    );
  }

  const failedEvents = await db.eventLog.findMany({
    where,
    take: 500,
    select: {
      id: true,
      eventName: true,
      eventId: true,
      destination: true,
      payload: true,
      customerIp: true,
      userAgent: true,
      fbp: true,
      fbc: true,
      pageUrl: true,
      value: true,
      currency: true,
      createdAt: true,
    },
  });

  if (failedEvents.length === 0) {
    return NextResponse.json({ replayed: 0, message: "No failed events found" });
  }

  // 6. Re-queue each event to the correct destination queue and reset status to PENDING
  let replayed = 0;

  for (const event of failedEvents) {
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

      if (event.destination === "META" && workspace.enableMeta && workspace.metaAccessTokenEncrypted) {
        await getEventQueue().add("send-meta-event", {
          workspaceId: workspace.id,
          pixelId: workspace.metaPixelId!,
          accessToken: workspace.metaAccessTokenEncrypted!,
          accessTokenIv: workspace.metaAccessTokenIv!,
          accessTokenTag: workspace.metaAccessTokenTag!,
          testEventCode: workspace.metaTestEventCode || undefined,
          event: eventData,
          eventLogId: event.id,
        } satisfies MetaEventJob);
      } else if (event.destination === "GOOGLE_ADS" && workspace.googleAdsConversionIdEncrypted) {
        await getGoogleQueue().add("send-google-event", {
          workspaceId: workspace.id,
          destination: "GOOGLE_ADS",
          eventLogId: event.id,
          event: { ...eventData, ttclid: null },
          credentials: {
            conversionId: workspace.googleAdsConversionIdEncrypted!,
            conversionIdIv: workspace.googleAdsConversionIdIv!,
            conversionIdTag: workspace.googleAdsConversionIdTag!,
            viewContentLabel: workspace.googleAdsViewContentLabelEncrypted || "",
            viewContentLabelIv: workspace.googleAdsViewContentLabelIv || "",
            viewContentLabelTag: workspace.googleAdsViewContentLabelTag || "",
            addToCartLabel: workspace.googleAdsAddToCartLabelEncrypted || "",
            addToCartLabelIv: workspace.googleAdsAddToCartLabelIv || "",
            addToCartLabelTag: workspace.googleAdsAddToCartLabelTag || "",
            checkoutLabel: workspace.googleAdsCheckoutLabelEncrypted || "",
            checkoutLabelIv: workspace.googleAdsCheckoutLabelIv || "",
            checkoutLabelTag: workspace.googleAdsCheckoutLabelTag || "",
            purchaseLabel: workspace.googleAdsPurchaseLabelEncrypted || "",
            purchaseLabelIv: workspace.googleAdsPurchaseLabelIv || "",
            purchaseLabelTag: workspace.googleAdsPurchaseLabelTag || "",
          },
        } satisfies DestinationEventJob);
      } else if (event.destination === "TIKTOK" && workspace.tiktokAccessTokenEncrypted) {
        await getTiktokQueue().add("send-tiktok-event", {
          workspaceId: workspace.id,
          destination: "TIKTOK",
          eventLogId: event.id,
          event: { ...eventData, ttclid: null },
          credentials: {
            pixelId: workspace.tiktokPixelId || "",
            accessToken: workspace.tiktokAccessTokenEncrypted!,
            accessTokenIv: workspace.tiktokAccessTokenIv!,
            accessTokenTag: workspace.tiktokAccessTokenTag!,
          },
        } satisfies DestinationEventJob);
      } else if (event.destination === "GA4" && workspace.ga4ApiSecretEncrypted) {
        await getGA4Queue().add("send-ga4-event", {
          workspaceId: workspace.id,
          destination: "GA4",
          eventLogId: event.id,
          event: { ...eventData, ttclid: null },
          credentials: {
            measurementId: workspace.ga4MeasurementId || "",
            apiSecret: workspace.ga4ApiSecretEncrypted!,
            apiSecretIv: workspace.ga4ApiSecretIv!,
            apiSecretTag: workspace.ga4ApiSecretTag!,
          },
        } satisfies DestinationEventJob);
      } else if (event.destination === "KLAVIYO" && workspace.klaviyoApiKeyEncrypted) {
        await getKlaviyoQueue().add("send-klaviyo-event", {
          workspaceId: workspace.id,
          destination: "KLAVIYO",
          eventLogId: event.id,
          event: { ...eventData, ttclid: null },
          credentials: {
            apiKey: workspace.klaviyoApiKeyEncrypted!,
            apiKeyIv: workspace.klaviyoApiKeyIv!,
            apiKeyTag: workspace.klaviyoApiKeyTag!,
          },
        } satisfies DestinationEventJob);
      } else {
        // Destination credentials missing or destination disabled -- skip
        continue;
      }

      await db.eventLog.update({
        where: { id: event.id },
        data: { status: "PENDING", errorMessage: null, retryCount: 0 },
      });

      replayed++;
    } catch (err) {
      console.error(`[Replay] Failed to requeue event ${event.id}:`, err);
    }
  }

  return NextResponse.json({
    replayed,
    message: `${replayed} event(s) queued for replay`,
  });
}
