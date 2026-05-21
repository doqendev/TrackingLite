import { db } from "@/lib/db";

export type TrackingHealthSeverity = "ok" | "warning" | "error";

export interface TrackingHealthCheck {
  key: string;
  label: string;
  severity: TrackingHealthSeverity;
  detail: string;
  timestamp?: Date | null;
}

export interface TrackingHealthSummary {
  status: TrackingHealthSeverity;
  checks: TrackingHealthCheck[];
}

function statusFromChecks(checks: TrackingHealthCheck[]): TrackingHealthSeverity {
  if (checks.some((check) => check.severity === "error")) return "error";
  if (checks.some((check) => check.severity === "warning")) return "warning";
  return "ok";
}

function formatAge(date: Date | null | undefined): string {
  if (!date) return "Never";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export async function getTrackingHealth(
  workspaceId: string
): Promise<TrackingHealthSummary> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      enableMeta: true,
      metaPixelId: true,
      metaAccessTokenEncrypted: true,
      enableTikTok: true,
      tiktokPixelId: true,
      tiktokAccessTokenEncrypted: true,
      shopifyWebhookSecretEncrypted: true,
      shopifyDomain: true,
    },
  });

  if (!workspace) {
    return {
      status: "error",
      checks: [
        {
          key: "workspace",
          label: "Workspace",
          severity: "error",
          detail: "Workspace not found.",
        },
      ],
    };
  }

  const [
    lastBrowserEvent,
    lastWebhookPurchase,
    lastMetaEvent,
    lastTikTokEvent,
    lastFailedEvent,
    recentFailedCount,
    duplicateOrders,
    latestAttributedPurchase,
    latestPurchase,
    recentDlqEntry,
  ] = await Promise.all([
    db.eventLog.findFirst({
      where: { workspaceId, source: "snippet", createdAt: { gte: since24h } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    db.eventLog.findFirst({
      where: { workspaceId, source: "webhook", eventName: "Purchase" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, status: true },
    }),
    db.eventLog.findFirst({
      where: { workspaceId, destination: "META" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, status: true, errorMessage: true },
    }),
    db.eventLog.findFirst({
      where: { workspaceId, destination: "TIKTOK" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, status: true, errorMessage: true },
    }),
    db.eventLog.findFirst({
      where: {
        workspaceId,
        destination: { in: ["META", "TIKTOK"] },
        status: "FAILED",
        createdAt: { gte: since24h },
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, destination: true, errorMessage: true },
    }),
    db.eventLog.count({
      where: {
        workspaceId,
        destination: { in: ["META", "TIKTOK"] },
        status: "FAILED",
        createdAt: { gte: since24h },
      },
    }),
    db.eventLog.groupBy({
      by: ["orderId", "destination"],
      where: {
        workspaceId,
        eventName: "Purchase",
        orderId: { not: null },
        destination: { in: ["META", "TIKTOK"] },
        createdAt: { gte: since7d },
      },
      _count: { _all: true },
    }),
    db.eventLog.findFirst({
      where: {
        workspaceId,
        source: "webhook",
        eventName: "Purchase",
        destination: { in: ["META", "TIKTOK"] },
        OR: [
          { fbp: { not: null } },
          { fbc: { not: null } },
          { ttclid: { not: null } },
          { utmSource: { not: null } },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    db.eventLog.findFirst({
      where: {
        workspaceId,
        source: "webhook",
        eventName: "Purchase",
        destination: { in: ["META", "TIKTOK"] },
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    workspace.shopifyDomain
      ? db.webhookDeadLetter.findFirst({
          where: {
            shopDomain: workspace.shopifyDomain,
            createdAt: { gte: since24h },
            resolvedAt: null,
          },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, error: true },
        })
      : Promise.resolve(null),
  ]);

  const metaConfigured = !!(
    workspace.enableMeta &&
    workspace.metaPixelId &&
    workspace.metaAccessTokenEncrypted
  );
  const tikTokConfigured = !!(
    workspace.enableTikTok &&
    workspace.tiktokPixelId &&
    workspace.tiktokAccessTokenEncrypted
  );
  const webhookConfigured = !!workspace.shopifyWebhookSecretEncrypted;

  const checks: TrackingHealthCheck[] = [
    {
      key: "pixel",
      label: "Pixel installed",
      severity: lastBrowserEvent ? "ok" : "warning",
      detail: lastBrowserEvent
        ? `Browser event received ${formatAge(lastBrowserEvent.createdAt)}.`
        : "No stored browser conversion event in the last 24h.",
      timestamp: lastBrowserEvent?.createdAt ?? null,
    },
    {
      key: "webhook",
      label: "Webhook active",
      severity: !webhookConfigured ? "error" : lastWebhookPurchase ? "ok" : "warning",
      detail: !webhookConfigured
        ? "Shopify webhook signing secret is not configured."
        : lastWebhookPurchase
          ? `Last webhook Purchase was ${lastWebhookPurchase.status} ${formatAge(lastWebhookPurchase.createdAt)}.`
          : "Webhook secret is saved, but no webhook Purchase has been logged yet.",
      timestamp: lastWebhookPurchase?.createdAt ?? null,
    },
    {
      key: "meta",
      label: "Meta connected",
      severity: !metaConfigured ? "error" : lastMetaEvent?.status === "FAILED" ? "warning" : "ok",
      detail: !metaConfigured
        ? "Meta Pixel ID or CAPI token is missing."
        : lastMetaEvent
          ? `Last Meta event is ${lastMetaEvent.status} from ${formatAge(lastMetaEvent.createdAt)}.`
          : "Meta credentials are saved; waiting for the first event.",
      timestamp: lastMetaEvent?.createdAt ?? null,
    },
    {
      key: "tiktok",
      label: "TikTok connected",
      severity: !tikTokConfigured ? "error" : lastTikTokEvent?.status === "FAILED" ? "warning" : "ok",
      detail: !tikTokConfigured
        ? "TikTok Pixel ID or Events API token is missing."
        : lastTikTokEvent
          ? `Last TikTok event is ${lastTikTokEvent.status} from ${formatAge(lastTikTokEvent.createdAt)}.`
          : "TikTok credentials are saved; waiting for the first event.",
      timestamp: lastTikTokEvent?.createdAt ?? null,
    },
    {
      key: "purchase",
      label: "Purchase received",
      severity: lastWebhookPurchase ? "ok" : "warning",
      detail: lastWebhookPurchase
        ? `Webhook Purchase logged ${formatAge(lastWebhookPurchase.createdAt)}.`
        : "No Shopify webhook Purchase has been logged yet.",
      timestamp: lastWebhookPurchase?.createdAt ?? null,
    },
    {
      key: "dedup",
      label: "Dedup active",
      severity: duplicateOrders.filter((group) => group._count._all > 1).length === 0 ? "ok" : "error",
      detail: duplicateOrders.filter((group) => group._count._all > 1).length === 0
        ? "No duplicate Meta/TikTok Purchase order IDs found in the last 7 days."
        : `${duplicateOrders.filter((group) => group._count._all > 1).length} duplicate order/destination group(s) found in the last 7 days.`,
    },
    {
      key: "attribution",
      label: "Attribution present",
      severity: latestAttributedPurchase ? "ok" : latestPurchase ? "warning" : "warning",
      detail: latestAttributedPurchase
        ? `Recent webhook Purchase includes attribution context from ${formatAge(latestAttributedPurchase.createdAt)}.`
        : latestPurchase
          ? "A webhook Purchase was logged, but recent purchases lack fbp/fbc, ttclid, or UTM context."
          : "No webhook Purchase is available to inspect attribution context.",
      timestamp: latestAttributedPurchase?.createdAt ?? latestPurchase?.createdAt ?? null,
    },
    {
      key: "errors",
      label: "Last error",
      severity: recentFailedCount > 0 || recentDlqEntry ? "error" : "ok",
      detail: recentDlqEntry
        ? `Webhook dead-letter entry ${formatAge(recentDlqEntry.createdAt)}: ${recentDlqEntry.error}`
        : lastFailedEvent
          ? `${recentFailedCount} Meta/TikTok failure(s) in 24h. Latest ${lastFailedEvent.destination}: ${lastFailedEvent.errorMessage ?? "Unknown error"}`
          : "No unresolved Meta/TikTok or webhook errors in the last 24h.",
      timestamp: recentDlqEntry?.createdAt ?? lastFailedEvent?.createdAt ?? null,
    },
  ];

  return {
    status: statusFromChecks(checks),
    checks,
  };
}
