import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getEventQueue } from "@/lib/queue";
import { checkReplayCooldown } from "@/lib/replay-rate-limit";

// POST /api/workspaces/:id/replay
// Body: { eventIds: string[] } for specific events, or { all: true } for all failed in last 7 days
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // 1. Auth check
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Verify workspace belongs to user
  const workspace = await db.workspace.findFirst({
    where: { id: params.id, userId: session.user.id },
    select: {
      id: true,
      metaPixelId: true,
      metaAccessTokenEncrypted: true,
      metaAccessTokenIv: true,
      metaAccessTokenTag: true,
      metaTestEventCode: true,
      enableMeta: true,
    },
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  if (!workspace.enableMeta || !workspace.metaPixelId || !workspace.metaAccessTokenEncrypted) {
    return NextResponse.json(
      { error: "Meta credentials not configured" },
      { status: 422 }
    );
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

  // 6. Re-queue each event and reset its status to PENDING
  const queue = getEventQueue();
  let replayed = 0;

  for (const event of failedEvents) {
    const payload = (event.payload as Record<string, unknown>) || {};

    await queue.add("send-meta-event", {
      workspaceId: workspace.id,
      pixelId: workspace.metaPixelId!,
      accessToken: workspace.metaAccessTokenEncrypted!,
      accessTokenIv: workspace.metaAccessTokenIv!,
      accessTokenTag: workspace.metaAccessTokenTag!,
      testEventCode: workspace.metaTestEventCode,
      event: {
        eventName: event.eventName,
        eventId: event.eventId,
        timestamp: event.createdAt.getTime(),
        url: event.pageUrl ?? "",
        referrer: "",
        fbp: event.fbp,
        fbc: event.fbc,
        userData: payload.userData || {},
        customData: payload.customData || {},
        clientIp: event.customerIp || "unknown",
        userAgent: event.userAgent || "",
      },
      eventLogId: event.id,
    });

    await db.eventLog.update({
      where: { id: event.id },
      data: { status: "PENDING", errorMessage: null, retryCount: 0 },
    });

    replayed++;
  }

  return NextResponse.json({
    replayed,
    message: `${replayed} event(s) queued for replay`,
  });
}
