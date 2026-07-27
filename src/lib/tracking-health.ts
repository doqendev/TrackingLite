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

function attributionSourcesFromPayload(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return ["none"];
  const sourcePayload = payload as {
    attributionSource?: unknown;
    attributionSources?: unknown;
  };
  if (Array.isArray(sourcePayload.attributionSources)) {
    const sources = sourcePayload.attributionSources.filter(
      (source): source is string => typeof source === "string" && source.length > 0
    );
    if (sources.length > 0) return sources;
  }
  const source = sourcePayload.attributionSource;
  return [typeof source === "string" && source ? source : "none"];
}

function attributionBreakdownDetail(counts: Record<string, number>, total: number): string {
  return `Source breakdown last ${total}: cart attributes ${counts.cart_attributes ?? 0}, session enrichment ${counts.session_enrichment ?? 0}, landing-site ${counts.landing_site ?? 0}, none ${counts.none ?? 0}.`;
}

export function buildCartAttributionCheck(input: {
  attributionCounts: Record<string, number>;
  recentWebhookPurchaseCount: number;
  latestAttributedPurchaseAt?: Date | null;
  latestPurchaseAt?: Date | null;
}): TrackingHealthCheck {
  const {
    attributionCounts,
    recentWebhookPurchaseCount,
    latestAttributedPurchaseAt,
    latestPurchaseAt,
  } = input;
  const cartAttributeCount = attributionCounts.cart_attributes ?? 0;
  const nonCartAttributionCount =
    (attributionCounts.session_enrichment ?? 0) + (attributionCounts.landing_site ?? 0);
  const breakdown =
    recentWebhookPurchaseCount > 0
      ? ` ${attributionBreakdownDetail(attributionCounts, recentWebhookPurchaseCount)}`
      : "";

  if (!latestPurchaseAt) {
    return {
      key: "attribution",
      label: "Cart helper attribution",
      severity: "warning",
      detail: "No webhook Purchase is available to inspect cart-helper attribution.",
      timestamp: null,
    };
  }

  if (cartAttributeCount > 0) {
    return {
      key: "attribution",
      label: "Cart helper attribution",
      severity: "ok",
      detail: `Excellent: the Cart Attribution Helper is doing its job. Recent webhook Purchases used durable cart_attributes.${breakdown}`,
      timestamp: latestAttributedPurchaseAt ?? latestPurchaseAt,
    };
  }

  if (nonCartAttributionCount > 0) {
    return {
      key: "attribution",
      label: "Cart helper attribution",
      severity: "warning",
      detail: `Warning: attribution survived, but not through durable cart attributes. Recent webhook Purchases used session_enrichment or landing_site only. Install and verify the Cart Attribution Helper.${breakdown}`,
      timestamp: latestAttributedPurchaseAt ?? latestPurchaseAt,
    };
  }

  return {
    key: "attribution",
    label: "Cart helper attribution",
    severity: "error",
    detail: `Error: purchase attribution is weak or missing. Recent webhook Purchases have no attribution context. Verify Custom Pixel, Shopify webhook, and Cart Attribution Helper installation.${breakdown}`,
    timestamp: latestPurchaseAt,
  };
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
      shopifyWebhookVerifiedAt: true,
      shopifyWebhookLastReceivedAt: true,
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
    lastSnippetEvent,
    lastWebhookPurchase,
    lastMetaEvent,
    lastTikTokEvent,
    lastFailedEvent,
    recentFailedCount,
    duplicateOrders,
    latestAttributedPurchase,
    latestPurchase,
    recentWebhookPurchases,
    recentDlqEntry,
    retryingWebhookInbox,
  ] = await Promise.all([
    db.eventLog.findFirst({
      where: { workspaceId, source: "snippet", createdAt: { gte: since24h } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    db.eventLog.findFirst({
      where: {
        workspaceId,
        source: "webhook",
        eventName: "Purchase",
        status: { not: "SUPERSEDED" },
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, status: true },
    }),
    db.eventLog.findFirst({
      where: {
        workspaceId,
        destination: "META",
        status: { not: "SUPERSEDED" },
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, status: true, errorMessage: true },
    }),
    db.eventLog.findFirst({
      where: {
        workspaceId,
        destination: "TIKTOK",
        status: { not: "SUPERSEDED" },
      },
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
        status: "SENT",
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
        status: { not: "SUPERSEDED" },
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
        status: { not: "SUPERSEDED" },
        destination: { in: ["META", "TIKTOK"] },
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    db.eventLog.findMany({
      where: {
        workspaceId,
        source: "webhook",
        eventName: "Purchase",
        status: { not: "SUPERSEDED" },
        destination: { in: ["META", "TIKTOK"] },
        createdAt: { gte: since7d },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { payload: true },
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
    db.shopifyWebhookInbox.findFirst({
      where: {
        workspaceId,
        status: { in: ["PENDING", "PROCESSING"] },
        attempts: { gt: 0 },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        updatedAt: true,
        topic: true,
        attempts: true,
        lastError: true,
      },
    }),
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
  const webhookVerified = !!workspace.shopifyWebhookVerifiedAt;
  const attributionCounts = recentWebhookPurchases.reduce<Record<string, number>>((counts, purchase) => {
    for (const source of attributionSourcesFromPayload(purchase.payload)) {
      counts[source] = (counts[source] ?? 0) + 1;
    }
    return counts;
  }, {});
  const attributionCheck = buildCartAttributionCheck({
    attributionCounts,
    recentWebhookPurchaseCount: recentWebhookPurchases.length,
    latestAttributedPurchaseAt: latestAttributedPurchase?.createdAt ?? null,
    latestPurchaseAt: latestPurchase?.createdAt ?? null,
  });

  const checks: TrackingHealthCheck[] = [
    {
      key: "snippet_activity",
      label: "Recent snippet event",
      severity: lastSnippetEvent ? "ok" : "warning",
      detail: lastSnippetEvent
        ? `Snippet event received ${formatAge(lastSnippetEvent.createdAt)}.`
        : "No stored snippet event in the last 24h. This is an activity check, not a pixel-install heartbeat.",
      timestamp: lastSnippetEvent?.createdAt ?? null,
    },
    {
      key: "webhook",
      label: "Webhook active",
      severity: !webhookConfigured || !webhookVerified || retryingWebhookInbox ? "error" : "ok",
      detail: !webhookConfigured
        ? "Shopify webhook signing secret is not configured."
        : !webhookVerified
          ? "Webhook secret is saved, but Track Clear has not verified a signed Shopify delivery. Snippet Purchase remains enabled as a safety fallback."
          : retryingWebhookInbox
            ? `A ${retryingWebhookInbox.topic} webhook is retrying after ${retryingWebhookInbox.attempts} attempt(s): ${retryingWebhookInbox.lastError ?? "processing failed"}`
            : lastWebhookPurchase
              ? `Last webhook Purchase was ${lastWebhookPurchase.status} ${formatAge(lastWebhookPurchase.createdAt)}.`
              : `Signed webhook verified ${formatAge(workspace.shopifyWebhookVerifiedAt!)}; waiting for the first Purchase.`,
      timestamp:
        retryingWebhookInbox?.updatedAt ??
        lastWebhookPurchase?.createdAt ??
        workspace.shopifyWebhookLastReceivedAt ??
        workspace.shopifyWebhookVerifiedAt ??
        null,
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
    attributionCheck,
    {
      key: "errors",
      label: "Last error",
      severity: recentFailedCount > 0 || recentDlqEntry || retryingWebhookInbox ? "error" : "ok",
      detail: retryingWebhookInbox
        ? `Webhook inbox retrying ${retryingWebhookInbox.topic}: ${retryingWebhookInbox.lastError ?? "processing failed"}`
        : recentDlqEntry
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
