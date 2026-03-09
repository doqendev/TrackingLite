import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAdminUser } from "@/lib/admin";
import { BILLING_PLANS } from "@/lib/constants";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email || !isAdminUser(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    new24h,
    new7d,
    new30d,
    verifiedUsers,
    subsByPlan,
    subsByStatus,
    totalWorkspaces,
    activeWorkspaces,
    workspacesByPlatform,
    events24h,
    events7d,
    eventsByDestination,
    eventsByStatus,
    eventsByEventName,
    recentSignups,
    topWorkspaceGroups,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: h24 } } }),
    db.user.count({ where: { createdAt: { gte: d7 } } }),
    db.user.count({ where: { createdAt: { gte: d30 } } }),
    db.user.count({ where: { emailVerified: { not: null } } }),
    db.subscription.groupBy({ by: ["plan"], _count: { plan: true } }),
    db.subscription.groupBy({ by: ["status"], _count: { status: true } }),
    db.workspace.count(),
    db.workspace.count({ where: { isActive: true } }),
    db.workspace.groupBy({ by: ["platform"], _count: { platform: true } }),
    db.eventLog.count({ where: { createdAt: { gte: h24 } } }),
    db.eventLog.count({ where: { createdAt: { gte: d7 } } }),
    db.eventLog.groupBy({
      by: ["destination"],
      where: { createdAt: { gte: d7 } },
      _count: { destination: true },
    }),
    db.eventLog.groupBy({
      by: ["status"],
      where: { createdAt: { gte: h24 } },
      _count: { status: true },
    }),
    db.eventLog.groupBy({
      by: ["eventName"],
      where: { createdAt: { gte: d7 } },
      _count: { eventName: true },
    }),
    db.user.findMany({
      take: 15,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        createdAt: true,
        subscription: { select: { plan: true, status: true } },
        _count: { select: { workspaces: true } },
      },
    }),
    db.eventLog.groupBy({
      by: ["workspaceId"],
      where: { createdAt: { gte: d7 } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),
  ]);

  // Compute MRR from active subscriptions
  const planPrices: Record<string, number> = {
    FREE: 0,
    STARTER: BILLING_PLANS.STARTER.priceMonthly,
    GROWTH: BILLING_PLANS.GROWTH.priceMonthly,
    SCALE: BILLING_PLANS.SCALE.priceMonthly,
  };

  const activeSubsByPlan = await db.subscription.groupBy({
    by: ["plan"],
    where: { status: "ACTIVE" },
    _count: { plan: true },
  });

  const mrr = activeSubsByPlan.reduce((sum, row) => {
    return sum + (planPrices[row.plan] ?? 0) * row._count.plan;
  }, 0);

  // Resolve top workspace details
  const topWsIds = topWorkspaceGroups.map((g) => g.workspaceId);
  const topWsDetails = topWsIds.length > 0
    ? await db.workspace.findMany({
        where: { id: { in: topWsIds } },
        select: {
          id: true,
          name: true,
          domain: true,
          user: { select: { email: true } },
        },
      })
    : [];

  const wsMap = new Map(topWsDetails.map((w) => [w.id, w]));
  const topWorkspaces = topWorkspaceGroups.map((g) => {
    const ws = wsMap.get(g.workspaceId);
    return {
      workspaceId: g.workspaceId,
      name: ws?.name ?? "Unknown",
      domain: ws?.domain ?? null,
      ownerEmail: ws?.user?.email ?? "Unknown",
      eventCount7d: g._count.id,
    };
  });

  const byPlan: Record<string, number> = {};
  for (const row of subsByPlan) byPlan[row.plan] = row._count.plan;

  const byStatus: Record<string, number> = {};
  for (const row of subsByStatus) byStatus[row.status] = row._count.status;

  const byPlatform: Record<string, number> = {};
  for (const row of workspacesByPlatform) byPlatform[row.platform] = row._count.platform;

  const byDestination: Record<string, number> = {};
  for (const row of eventsByDestination) byDestination[row.destination] = row._count.destination;

  const byEventStatus: Record<string, number> = {};
  for (const row of eventsByStatus) byEventStatus[row.status] = row._count.status;

  const byEventName: Record<string, number> = {};
  for (const row of eventsByEventName) byEventName[row.eventName] = row._count.eventName;

  return NextResponse.json({
    generatedAt: now.toISOString(),
    users: {
      total: totalUsers,
      new24h,
      new7d,
      new30d,
      verified: verifiedUsers,
    },
    subscriptions: {
      total: subsByPlan.reduce((s, r) => s + r._count.plan, 0),
      byPlan,
      byStatus,
      mrr,
    },
    workspaces: {
      total: totalWorkspaces,
      active: activeWorkspaces,
      byPlatform,
    },
    events: {
      total24h: events24h,
      total7d: events7d,
      byDestination,
      byStatus: byEventStatus,
      byEventName,
    },
    recentSignups: recentSignups.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      emailVerified: u.emailVerified,
      createdAt: u.createdAt,
      plan: u.subscription?.plan ?? "FREE",
      subscriptionStatus: u.subscription?.status ?? null,
      workspaceCount: u._count.workspaces,
    })),
    topWorkspaces,
  });
}
