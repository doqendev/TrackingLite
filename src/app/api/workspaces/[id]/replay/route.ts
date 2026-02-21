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
import { createLogger } from "@/lib/logger";
import type { Queue } from "bullmq";

const DEST_QUEUE_MAP: Record<string, { queue: () => Queue; jobName: string }> = {
  META: { queue: getEventQueue, jobName: "send-meta-event" },
  GOOGLE_ADS: { queue: getGoogleQueue, jobName: "send-google-event" },
  TIKTOK: { queue: getTiktokQueue, jobName: "send-tiktok-event" },
  GA4: { queue: getGA4Queue, jobName: "send-ga4-event" },
  KLAVIYO: { queue: getKlaviyoQueue, jobName: "send-klaviyo-event" },
};

function workspaceHasCredentials(
  workspace: Record<string, unknown>,
  destination: string
): boolean {
  switch (destination) {
    case "META":
      return !!(workspace.enableMeta && workspace.metaAccessTokenEncrypted);
    case "GOOGLE_ADS":
      return !!workspace.googleAdsConversionIdEncrypted;
    case "TIKTOK":
      return !!workspace.tiktokAccessTokenEncrypted;
    case "GA4":
      return !!workspace.ga4ApiSecretEncrypted;
    case "KLAVIYO":
      return !!workspace.klaviyoApiKeyEncrypted;
    default:
      return false;
  }
}

const log = createLogger({ component: "replay" });

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

  // 2. Verify workspace belongs to user (only need credential-check fields, not actual encrypted values)
  const workspace = await db.workspace.findFirst({
    where: { id, userId: session.user.id },
    select: {
      id: true,
      enableMeta: true,
      metaAccessTokenEncrypted: true,
      googleAdsConversionIdEncrypted: true,
      tiktokAccessTokenEncrypted: true,
      ga4ApiSecretEncrypted: true,
      klaviyoApiKeyEncrypted: true,
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
  //    Workers look up credentials from DB themselves; we only pass workspaceId + event data
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

      const destConfig = DEST_QUEUE_MAP[event.destination];
      if (!destConfig) continue;

      // Check workspace has credentials for this destination
      if (!workspaceHasCredentials(workspace as unknown as Record<string, unknown>, event.destination)) {
        continue;
      }

      if (event.destination === "META") {
        await destConfig.queue().add(destConfig.jobName, {
          workspaceId: workspace.id,
          event: eventData,
          eventLogId: event.id,
        } satisfies MetaEventJob);
      } else {
        await destConfig.queue().add(destConfig.jobName, {
          workspaceId: workspace.id,
          destination: event.destination,
          eventLogId: event.id,
          event: { ...eventData, ttclid: null },
        } satisfies DestinationEventJob);
      }

      await db.eventLog.update({
        where: { id: event.id },
        data: { status: "PENDING", errorMessage: null, retryCount: 0 },
      });

      replayed++;
    } catch (err) {
      log.error("Failed to requeue event", { eventId: event.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({
    replayed,
    message: `${replayed} event(s) queued for replay`,
  });
}
