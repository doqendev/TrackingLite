import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { computeDashboardAnalytics } from "@/lib/analytics";
import { getCachedAnalytics } from "@/lib/analytics-cache";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: NextRequest,
  { params }: RouteContext
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const workspace = await db.workspace.findFirst({
    where: { id, userId: session.user.id, isActive: true },
    select: { id: true, userId: true },
  });

  if (!workspace) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const analytics = await getCachedAnalytics(workspace.id, () =>
    computeDashboardAnalytics(workspace.id, session.user!.id!)
  );

  return NextResponse.json(analytics);
}
