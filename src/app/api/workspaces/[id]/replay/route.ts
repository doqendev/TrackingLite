import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
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
import { checkReplayCooldown } from "@/lib/replay-rate-limit";
import { createLogger } from "@/lib/logger";
import { getAllowedDestinationsForWorkspace } from "@/lib/workspace-mode";
import {
  enqueueReplayJob,
  type ReplayJobData,
} from "@/lib/event-replay-queue";
import {
  clearedEventRetryEnvelope,
  decryptEventRetryEnvelope,
  type EventRetryEnvelope,
} from "@/lib/event-retry-envelope";
import type { Queue } from "bullmq";

const DEST_QUEUE_MAP: Record<string, { queue: () => Queue; jobName: string }> = {
  META: { queue: getEventQueue, jobName: "send-meta-event" },
  TIKTOK: { queue: getTiktokQueue, jobName: "send-tiktok-event" },
  GA4: { queue: getGA4Queue, jobName: "send-ga4-event" },
  KLAVIYO: { queue: getKlaviyoQueue, jobName: "send-klaviyo-event" },
  REDDIT: { queue: getRedditQueue, jobName: "send-reddit-event" },
  PINTEREST: { queue: getPinterestQueue, jobName: "send-pinterest-event" },
  GOOGLE_ADS: { queue: getGoogleAdsQueue, jobName: "send-google-ads-event" },
};

function workspaceHasCredentials(
  workspace: Record<string, unknown>,
  destination: string
): boolean {
  switch (destination) {
    case "META":
      return !!(workspace.enableMeta && workspace.metaAccessTokenEncrypted);
    case "TIKTOK":
      return !!(workspace.enableTikTok && workspace.tiktokAccessTokenEncrypted);
    case "GA4":
      return !!(workspace.enableGA4 && workspace.ga4ApiSecretEncrypted);
    case "KLAVIYO":
      return !!(workspace.enableKlaviyo && workspace.klaviyoApiKeyEncrypted);
    case "REDDIT":
      return !!(workspace.enableReddit && workspace.redditAccessTokenEncrypted);
    case "PINTEREST":
      return !!(workspace.enablePinterest && workspace.pinterestConversionTokenEncrypted);
    case "GOOGLE_ADS":
      return !!(workspace.enableGoogleAds && workspace.googleAdsConversionId);
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
    where: { id, userId: session.user.id, isActive: true },
    select: {
      id: true,
      productMode: true,
      installType: true,
      enableMeta: true,
      metaAccessTokenEncrypted: true,
      enableTikTok: true,
      tiktokAccessTokenEncrypted: true,
      enableGA4: true,
      ga4ApiSecretEncrypted: true,
      enableKlaviyo: true,
      klaviyoApiKeyEncrypted: true,
      enableReddit: true,
      redditAccessTokenEncrypted: true,
      enablePinterest: true,
      pinterestConversionTokenEncrypted: true,
      enableGoogleAds: true,
      googleAdsConversionId: true,
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
    destination: { in: [...getAllowedDestinationsForWorkspace(workspace)] },
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
      ttclid: true,
      gclid: true,
      rdtCid: true,
      epik: true,
      pageUrl: true,
      value: true,
      currency: true,
      createdAt: true,
      retryCount: true,
      lastAttemptAt: true,
      nextRetryAt: true,
      errorMessage: true,
      retryPayloadEncrypted: true,
      retryPayloadIv: true,
      retryPayloadTag: true,
      retryPayloadExpiresAt: true,
    },
  });

  if (failedEvents.length === 0) {
    return NextResponse.json({ replayed: 0, message: "No failed events found" });
  }

  // 6. Atomically claim and re-queue each event to the correct destination queue.
  //    A short-lived encrypted envelope preserves the original identity/event data.
  //    After it expires, legacy rows fall back to durable attribution columns and
  //    sanitized customData without reconstructing removed email/phone/address data.
  //    Workers look up credentials from DB themselves; we only pass workspaceId + event data.
  let replayed = 0;

  for (const event of failedEvents) {
    let claimed = false;
    try {
      const destConfig = DEST_QUEUE_MAP[event.destination];
      if (!destConfig) continue;

      // Destination allowlisting is handled in the query; also require the
      // integration to remain explicitly enabled and configured at replay time.
      if (!workspaceHasCredentials(workspace as unknown as Record<string, unknown>, event.destination)) {
        continue;
      }

      // Compare-and-set prevents the automatic retry worker and two manual
      // requests from queueing the same failed EventLog concurrently.
      const claim = await db.eventLog.updateMany({
        where: {
          id: event.id,
          workspaceId: workspace.id,
          status: "FAILED",
          retryCount: event.retryCount,
        },
        data: {
          status: "RETRYING",
          errorMessage: null,
          retryCount: { increment: 1 },
          lastAttemptAt: new Date(),
          nextRetryAt: null,
        },
      });
      if (claim.count !== 1) continue;
      claimed = true;

      const payload = (event.payload as Record<string, unknown>) || {};
      const legacyEventData: EventRetryEnvelope["event"] = {
        eventName: event.eventName,
        eventId: event.eventId,
        timestamp: event.createdAt.getTime(),
        url: event.pageUrl ?? "",
        referrer: "",
        fbp: event.fbp,
        fbc: event.fbc,
        ttclid: event.ttclid,
        gclid: event.gclid,
        rdtCid: event.rdtCid,
        epik: event.epik,
        userData: (payload.userData as Record<string, unknown>) || {},
        customData: (payload.customData as Record<string, unknown>) || {},
        clientIp: event.customerIp || "unknown",
        userAgent: event.userAgent || "",
      };
      const retryEnvelope = decryptEventRetryEnvelope(event);
      const eventData =
        retryEnvelope?.event.eventId === event.eventId &&
        retryEnvelope.event.eventName === event.eventName
          ? retryEnvelope.event
          : legacyEventData;

      let jobData: ReplayJobData;
      if (event.destination === "META") {
        jobData = {
          workspaceId: workspace.id,
          event: eventData,
          eventLogId: event.id,
        } satisfies MetaEventJob;
      } else {
        jobData = {
          workspaceId: workspace.id,
          destination: event.destination,
          eventLogId: event.id,
          event: {
            ...eventData,
            ttclid: event.ttclid ?? eventData.ttclid ?? null,
            gclid: event.gclid ?? eventData.gclid ?? null,
            rdtCid: event.rdtCid ?? eventData.rdtCid ?? null,
            epik: event.epik ?? eventData.epik ?? null,
          },
        } satisfies DestinationEventJob;
      }

      const enqueueResult = await enqueueReplayJob(
        destConfig.queue(),
        destConfig.jobName,
        event.id,
        jobData
      );

      if (enqueueResult === "completed") {
        // Retained completed jobs must not be duplicated. Repair the stale DB
        // state that allowed this replay request instead.
        await db.eventLog.updateMany({
          where: {
            id: event.id,
            workspaceId: workspace.id,
            status: "RETRYING",
            retryCount: event.retryCount + 1,
          },
          data: {
            status: "SENT",
            errorMessage: null,
            nextRetryAt: null,
            ...clearedEventRetryEnvelope(),
          },
        });
      }

      if (enqueueResult === "active") {
        // The existing worker already captured its data. Keep the row leased as
        // RETRYING; the scheduled stale-RETRYING reconciliation will repair it
        // if that worker does not produce a terminal state.
        continue;
      }

      replayed++;
    } catch (err) {
      log.error("Failed to requeue event", { eventId: event.id, error: err instanceof Error ? err.message : String(err) });
      if (claimed) {
        await db.eventLog.updateMany({
          where: {
            id: event.id,
            workspaceId: workspace.id,
            status: "RETRYING",
            retryCount: event.retryCount + 1,
          },
          data: {
            status: "FAILED",
            retryCount: event.retryCount,
            errorMessage: event.errorMessage,
            lastAttemptAt: event.lastAttemptAt,
            nextRetryAt: event.nextRetryAt,
          },
        }).catch(() => {});
      }
    }
  }

  return NextResponse.json({
    replayed,
    message: `${replayed} event(s) queued for replay`,
  });
}
