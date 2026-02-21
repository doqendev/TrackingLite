import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const workspace = await db.workspace.findFirst({
    where: { id, userId: session.user.id, isActive: true },
    select: { id: true },
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [lastEvent, eventCount24h] = await Promise.all([
    db.eventLog.findFirst({
      where: { workspaceId: id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    db.eventLog.count({
      where: { workspaceId: id, createdAt: { gte: since24h } },
    }),
  ]);

  return NextResponse.json({
    active: eventCount24h > 0,
    lastEventAt: lastEvent?.createdAt?.toISOString() || null,
    eventCount24h,
  });
}
