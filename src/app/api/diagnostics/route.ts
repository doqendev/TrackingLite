import { NextRequest, NextResponse } from "next/server";
import type { Destination as PrismaDestination } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getAllowedDestinationsForWorkspace,
  resolveWorkspaceInstallType,
  resolveWorkspaceProductMode,
} from "@/lib/workspace-mode";

const FUNNEL_ORDER = [
  "PageView",
  "ViewContent",
  "AddToCart",
  "InitiateCheckout",
  "Purchase",
] as const;

// PageView and ViewContent are fire-and-forget (no EventLog records).
// They ARE sent to platforms but not stored in the database to save space.
const FIRE_AND_FORGET_EVENTS = new Set(["PageView", "ViewContent"]);

const ALL_DESTINATIONS = [
  "META",
  "TIKTOK",
  "GA4",
  "KLAVIYO",
  "REDDIT",
  "PINTEREST",
  "GOOGLE_ADS",
] as const satisfies readonly PrismaDestination[];

type Destination = (typeof ALL_DESTINATIONS)[number];

function hasCredentials(workspace: Record<string, unknown>, dest: Destination): boolean {
  switch (dest) {
    case "META":
      return !!(workspace.metaPixelId && workspace.metaAccessTokenEncrypted);
    case "TIKTOK":
      return !!(workspace.tiktokPixelId && workspace.tiktokAccessTokenEncrypted);
    case "GA4":
      return !!(workspace.ga4MeasurementId && workspace.ga4ApiSecretEncrypted);
    case "KLAVIYO":
      return !!(workspace.klaviyoApiKeyEncrypted);
    case "REDDIT":
      return !!(workspace.redditAccountId && workspace.redditAccessTokenEncrypted);
    case "PINTEREST":
      return !!(workspace.pinterestAdAccountId && workspace.pinterestConversionTokenEncrypted);
    case "GOOGLE_ADS":
      return !!(workspace.googleAdsConversionId);
  }
}

function isEnabled(workspace: Record<string, unknown>, dest: Destination): boolean {
  switch (dest) {
    case "META":
      return !!(workspace.enableMeta);
    case "TIKTOK":
      return !!(workspace.enableTikTok);
    case "GA4":
      return !!(workspace.enableGA4);
    case "KLAVIYO":
      return !!(workspace.enableKlaviyo);
    case "REDDIT":
      return !!(workspace.enableReddit);
    case "PINTEREST":
      return !!(workspace.enablePinterest);
    case "GOOGLE_ADS":
      return !!(workspace.enableGoogleAds);
  }
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId query param is required" }, { status: 400 });
  }

  // Verify the workspace belongs to the authenticated user
  const workspace = await db.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
    select: {
      id: true,
      name: true,
      isActive: true,
      productMode: true,
      installType: true,
      enableMeta: true,
      enableTikTok: true,
      enableGA4: true,
      enableKlaviyo: true,
      enableReddit: true,
      enablePinterest: true,
      metaPixelId: true,
      metaAccessTokenEncrypted: true,
      tiktokPixelId: true,
      tiktokAccessTokenEncrypted: true,
      ga4MeasurementId: true,
      ga4ApiSecretEncrypted: true,
      klaviyoApiKeyEncrypted: true,
      redditAccountId: true,
      redditAccessTokenEncrypted: true,
      pinterestAdAccountId: true,
      pinterestConversionTokenEncrypted: true,
      enableGoogleAds: true,
      googleAdsConversionId: true,
    },
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const allowedDestinations = getAllowedDestinationsForWorkspace(workspace);
  const allowedDestinationList = [...allowedDestinations];
  const destinationWhere = { destination: { in: allowedDestinationList } };

  const now = new Date();
  const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const ago30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ago10m = new Date(now.getTime() - 10 * 60 * 1000);

  // Run all independent queries in parallel
  const [
    eventCoverage30dRaw,
    eventCoverage24hRaw,
    eventCoverage7dRaw,
    destinationHealthRaw,
    matrixRaw,
    dataQualityRaw,
    funnel7dRaw,
    recentFailures,
    stuckCount,
    oldestStuck,
    purchaseAuditRaw,
    addToCartAuditRaw,
    initiateCheckoutAuditRaw,
  ] = await Promise.all([
    // Event coverage 30d — for lastSeen (_max createdAt) and 30d totals
    db.eventLog.groupBy({
      by: ["eventName", "status"],
      where: { workspaceId, createdAt: { gte: ago30d }, ...destinationWhere },
      _count: { id: true },
      _max: { createdAt: true },
    }),

    // Event coverage 24h
    db.eventLog.groupBy({
      by: ["eventName", "status"],
      where: { workspaceId, createdAt: { gte: ago24h }, ...destinationWhere },
      _count: { id: true },
    }),

    // Event coverage 7d
    db.eventLog.groupBy({
      by: ["eventName", "status"],
      where: { workspaceId, createdAt: { gte: ago7d }, ...destinationWhere },
      _count: { id: true },
    }),

    // Destination health 24h — grouped by destination + status, with last seen createdAt
    db.eventLog.groupBy({
      by: ["destination", "status"],
      where: { workspaceId, createdAt: { gte: ago24h }, ...destinationWhere },
      _count: { id: true },
      _max: { createdAt: true },
    }),

    // Event×destination matrix 24h
    db.eventLog.groupBy({
      by: ["eventName", "destination", "status"],
      where: { workspaceId, createdAt: { gte: ago24h }, ...destinationWhere },
      _count: { id: true },
    }),

    // Data quality 7d — 7 parallel count queries
    Promise.all([
      db.eventLog.count({ where: { workspaceId, createdAt: { gte: ago7d }, ...destinationWhere } }),
      db.eventLog.count({ where: { workspaceId, eventName: "Purchase", createdAt: { gte: ago7d }, ...destinationWhere } }),
      db.eventLog.count({ where: { workspaceId, eventName: "Purchase", createdAt: { gte: ago7d }, value: { gt: 0 }, ...destinationWhere } }),
      db.eventLog.count({ where: { workspaceId, eventName: "Purchase", createdAt: { gte: ago7d }, currency: { not: null }, ...destinationWhere } }),
      db.eventLog.count({ where: { workspaceId, eventName: "Purchase", createdAt: { gte: ago7d }, orderId: { not: null }, ...destinationWhere } }),
      db.eventLog.count({ where: { workspaceId, createdAt: { gte: ago7d }, utmSource: { not: null }, ...destinationWhere } }),
      db.eventLog.count({ where: { workspaceId, createdAt: { gte: ago7d }, gclid: { not: null }, ...destinationWhere } }),
    ]),

    // Funnel 7d — total per event name
    db.eventLog.groupBy({
      by: ["eventName"],
      where: { workspaceId, createdAt: { gte: ago7d }, ...destinationWhere },
      _count: { id: true },
    }),

    // Recent failures — last 20 by createdAt desc
    db.eventLog.findMany({
      where: { workspaceId, status: "FAILED", ...destinationWhere },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        eventName: true,
        destination: true,
        status: true,
        createdAt: true,
        eventId: true,
      },
    }),

    // Stuck events count (PENDING older than 10 minutes)
    db.eventLog.count({
      where: { workspaceId, status: "PENDING", createdAt: { lt: ago10m }, ...destinationWhere },
    }),

    // Oldest stuck event
    db.eventLog.findFirst({
      where: { workspaceId, status: "PENDING", createdAt: { lt: ago10m }, ...destinationWhere },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),

    // Purchase event audit — last 10 unique purchases (fetch extra rows for multi-destination fan-out)
    db.eventLog.findMany({
      where: { workspaceId, eventName: "Purchase", ...destinationWhere },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        eventId: true,
        destination: true,
        status: true,
        createdAt: true,
        value: true,
        currency: true,
        numItems: true,
        orderId: true,
        fbp: true,
        fbc: true,
        pageUrl: true,
        customerIp: true,
        userAgent: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
        utmContent: true,
        utmTerm: true,
        gclid: true,
        ttclid: true,
        rdtCid: true,
        epik: true,
        errorMessage: true,
        retryCount: true,
      },
    }),

    // AddToCart event audit — last 10 unique events
    db.eventLog.findMany({
      where: { workspaceId, eventName: "AddToCart", ...destinationWhere },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        eventId: true,
        destination: true,
        status: true,
        createdAt: true,
        value: true,
        currency: true,
        numItems: true,
        orderId: true,
        fbp: true,
        fbc: true,
        pageUrl: true,
        customerIp: true,
        userAgent: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
        utmContent: true,
        utmTerm: true,
        gclid: true,
        ttclid: true,
        rdtCid: true,
        epik: true,
        errorMessage: true,
        retryCount: true,
      },
    }),

    // InitiateCheckout event audit — last 10 unique events
    db.eventLog.findMany({
      where: { workspaceId, eventName: "InitiateCheckout", ...destinationWhere },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        eventId: true,
        destination: true,
        status: true,
        createdAt: true,
        value: true,
        currency: true,
        numItems: true,
        orderId: true,
        fbp: true,
        fbc: true,
        pageUrl: true,
        customerIp: true,
        userAgent: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
        utmContent: true,
        utmTerm: true,
        gclid: true,
        ttclid: true,
        rdtCid: true,
        epik: true,
        errorMessage: true,
        retryCount: true,
      },
    }),
  ]);

  // --- Build eventCoverage ---
  type EventStatusRow = {
    eventName: string;
    status: string;
    _count: { id: number };
    _max?: { createdAt: Date | null };
  };

  function buildEventMap(rows: Array<{ eventName: string; status: string; _count: { id: number } }>) {
    const map: Record<string, Record<string, number>> = {};
    for (const row of rows) {
      const en = row.eventName as string;
      if (!map[en]) map[en] = {};
      map[en][row.status] = (map[en][row.status] ?? 0) + row._count.id;
    }
    return map;
  }

  const map24h = buildEventMap(eventCoverage24hRaw);
  const map7d = buildEventMap(eventCoverage7dRaw);
  const map30d = buildEventMap(eventCoverage30dRaw);

  // lastSeen per event — max createdAt across all status rows in 30d data
  const lastSeenMap: Record<string, Date | null> = {};
  for (const row of eventCoverage30dRaw) {
    const en = row.eventName as string;
    const ts = (row as EventStatusRow & { _max: { createdAt: Date | null } })._max?.createdAt ?? null;
    if (ts && (!lastSeenMap[en] || ts > lastSeenMap[en]!)) {
      lastSeenMap[en] = ts;
    }
  }

  const eventCoverage = FUNNEL_ORDER.map((eventName) => {
    const isFireAndForget = FIRE_AND_FORGET_EVENTS.has(eventName);
    const e24 = map24h[eventName] ?? {};
    const e7 = map7d[eventName] ?? {};
    const e30 = map30d[eventName] ?? {};

    const total24h = Object.values(e24).reduce((s, v) => s + v, 0);
    const total7d = Object.values(e7).reduce((s, v) => s + v, 0);
    const total30d = Object.values(e30).reduce((s, v) => s + v, 0);
    const sent24h = e24["SENT"] ?? 0;
    const failed24h = e24["FAILED"] ?? 0;
    const pending24h = (e24["PENDING"] ?? 0) + (e24["RETRYING"] ?? 0);
    const successRate24h = total24h > 0 ? Math.round((sent24h / total24h) * 100) : 0;
    const lastSeen = lastSeenMap[eventName]?.toISOString() ?? null;

    return {
      eventName,
      tracked: !isFireAndForget, // false = fire-and-forget (sent to platforms but not stored in DB)
      total24h,
      total7d,
      total30d,
      lastSeen,
      successRate24h,
      failedCount24h: failed24h,
      pendingCount24h: pending24h,
    };
  });

  // --- Build destinationHealth ---
  // EventLog has no updatedAt — use createdAt for last seen timestamps
  const destMap: Record<
    string,
    Record<string, { count: number; lastCreatedAt: Date | null }>
  > = {};
  for (const row of destinationHealthRaw) {
    const dest = row.destination as string;
    const status = row.status as string;
    if (!destMap[dest]) destMap[dest] = {};
    destMap[dest][status] = {
      count: row._count.id,
      lastCreatedAt: (row._max as { createdAt: Date | null }).createdAt,
    };
  }

  const ws = workspace as Record<string, unknown>;

  const destinationHealth = allowedDestinations.map((dest) => {
    const d = destMap[dest] ?? {};
    const sent24h = d["SENT"]?.count ?? 0;
    const failed24h = d["FAILED"]?.count ?? 0;
    const pending24h = d["PENDING"]?.count ?? 0;
    const retrying24h = d["RETRYING"]?.count ?? 0;
    const total24h = sent24h + failed24h + pending24h + retrying24h;
    const successRate24h = total24h > 0 ? Math.round((sent24h / total24h) * 100) : 0;
    const lastSuccess = d["SENT"]?.lastCreatedAt?.toISOString() ?? null;
    const lastFailure = d["FAILED"]?.lastCreatedAt?.toISOString() ?? null;

    return {
      destination: dest,
      enabled: isEnabled(ws, dest),
      hasCredentials: hasCredentials(ws, dest),
      total24h,
      sent24h,
      failed24h,
      pending24h,
      retrying24h,
      successRate24h,
      lastSuccess,
      lastFailure,
    };
  });

  // --- Build eventDestinationMatrix ---
  const matrixMap: Record<
    string,
    Record<string, { count: number; sent: number; failed: number }>
  > = {};

  for (const row of matrixRaw) {
    const eventName = row.eventName as string;
    const dest = row.destination as string;
    const status = row.status as string;
    if (!matrixMap[eventName]) matrixMap[eventName] = {};
    if (!matrixMap[eventName][dest]) matrixMap[eventName][dest] = { count: 0, sent: 0, failed: 0 };
    matrixMap[eventName][dest].count += row._count.id;
    if (status === "SENT") matrixMap[eventName][dest].sent += row._count.id;
    if (status === "FAILED") matrixMap[eventName][dest].failed += row._count.id;
  }

  const eventDestinationMatrix: Array<{
    eventName: string;
    destination: string;
    count: number;
    sent: number;
    failed: number;
  }> = [];
  for (const eventName of FUNNEL_ORDER) {
    for (const dest of allowedDestinations) {
      const cell = matrixMap[eventName]?.[dest];
      if (cell) {
        eventDestinationMatrix.push({ eventName, destination: dest, ...cell });
      }
    }
  }

  // --- Build dataQuality ---
  const [
    totalEvents7d,
    purchaseEvents7d,
    purchasesWithValue,
    purchasesWithCurrency,
    purchasesWithOrderId,
    eventsWithUtmSource,
    eventsWithGclid,
  ] = dataQualityRaw;

  const dataQuality = {
    totalEvents7d,
    purchaseEvents7d,
    purchasesWithValue,
    purchasesWithCurrency,
    purchasesWithOrderId,
    eventsWithUtmSource,
    eventsWithGclid,
  };

  // --- Build funnel ---
  const funnel7dMap: Record<string, number> = {};
  for (const row of funnel7dRaw) {
    funnel7dMap[row.eventName as string] = row._count.id;
  }

  const funnel = FUNNEL_ORDER.map((eventName, idx) => {
    const count7d = funnel7dMap[eventName] ?? 0;
    let dropOffPercent: number | null = null;
    if (idx > 0) {
      const prev = funnel7dMap[FUNNEL_ORDER[idx - 1]] ?? 0;
      if (prev > 0) {
        dropOffPercent = Math.round(((prev - count7d) / prev) * 100);
      }
    }
    return { eventName, count7d, dropOffPercent };
  });

  // --- Recent failures ---
  const recentFailuresMapped = recentFailures.map((e) => ({
    id: e.id,
    eventName: e.eventName as string,
    destination: e.destination as string,
    status: e.status as string,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.createdAt.toISOString(), // EventLog has no updatedAt; use createdAt
    eventId: e.eventId,
  }));

  // --- Stuck events ---
  const stuckEvents = {
    count: stuckCount,
    oldest: oldestStuck?.createdAt?.toISOString() ?? null,
  };

  // --- Event Audit (shared grouping logic) ---
  // Group rows by eventId so each event shows per-destination breakdown
  function groupAuditRows(rows: typeof purchaseAuditRaw, limit = 10) {
    const byEventId: Record<string, {
      eventId: string;
      createdAt: string;
      destinations: Array<{ destination: string; status: string; errorMessage: string | null; retryCount: number }>;
      value: number | null;
      currency: string | null;
      orderId: string | null;
      numItems: number | null;
      fbp: string | null;
      fbc: string | null;
      pageUrl: string | null;
      customerIp: string | null;
      userAgent: string | null;
      utmSource: string | null;
      utmMedium: string | null;
      utmCampaign: string | null;
      utmContent: string | null;
      utmTerm: string | null;
      gclid: string | null;
      ttclid: string | null;
      rdtCid: string | null;
      epik: string | null;
    }> = {};

    for (const row of rows) {
      const eid = row.eventId;
      if (!byEventId[eid] && Object.keys(byEventId).length >= limit) continue;
      if (!byEventId[eid]) {
        byEventId[eid] = {
          eventId: eid,
          createdAt: row.createdAt.toISOString(),
          destinations: [],
          value: row.value ? Number(row.value) : null,
          currency: row.currency,
          orderId: row.orderId,
          numItems: row.numItems,
          fbp: row.fbp,
          fbc: row.fbc,
          pageUrl: row.pageUrl,
          customerIp: row.customerIp ? "***" : null,
          userAgent: row.userAgent ? row.userAgent.substring(0, 60) + "..." : null,
          utmSource: row.utmSource,
          utmMedium: row.utmMedium,
          utmCampaign: row.utmCampaign,
          utmContent: row.utmContent,
          utmTerm: row.utmTerm,
          gclid: row.gclid,
          ttclid: row.ttclid,
          rdtCid: row.rdtCid,
          epik: row.epik,
        };
      }
      byEventId[eid].destinations.push({
        destination: row.destination as string,
        status: row.status as string,
        errorMessage: row.errorMessage,
        retryCount: row.retryCount,
      });
    }

    return Object.values(byEventId);
  }

  const purchaseAudit = groupAuditRows(purchaseAuditRaw);
  const addToCartAudit = groupAuditRows(addToCartAuditRaw);
  const initiateCheckoutAudit = groupAuditRows(initiateCheckoutAuditRaw);

  return NextResponse.json({
    generatedAt: now.toISOString(),
    workspace: {
      id: workspace.id,
      name: workspace.name,
      isActive: workspace.isActive,
      productMode: resolveWorkspaceProductMode(workspace),
      installType: resolveWorkspaceInstallType(workspace),
      allowedDestinations: allowedDestinationList,
    },
    eventCoverage,
    destinationHealth,
    eventDestinationMatrix,
    dataQuality,
    funnel,
    recentFailures: recentFailuresMapped,
    stuckEvents,
    purchaseAudit,
    addToCartAudit,
    initiateCheckoutAudit,
  });
}
