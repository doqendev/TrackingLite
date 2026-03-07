import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { computeDashboardAnalytics } from "@/lib/analytics";
import { getCachedAnalytics } from "@/lib/analytics-cache";
import { getOrderCount } from "@/lib/billing";
import { BILLING_PLANS } from "@/lib/constants";
import Link from "next/link";

import { PnOrderUsage } from "@/components/pixel-null/dashboard/pn-order-usage";
import { PnRevenueCards } from "@/components/pixel-null/dashboard/pn-revenue-cards";
import { PnEventFunnel } from "@/components/pixel-null/dashboard/pn-event-funnel";
import { PnDeliveryStats } from "@/components/pixel-null/dashboard/pn-delivery-stats";
import { PnPlatformDelivery } from "@/components/pixel-null/dashboard/pn-platform-delivery";
import { PnConversionAccuracy } from "@/components/pixel-null/dashboard/pn-conversion-accuracy";
import { PnCampaignPerformance } from "@/components/pixel-null/dashboard/pn-campaign-performance";
import { PnRecentEvents } from "@/components/pixel-null/dashboard/pn-recent-events";
import { PnReplayButton } from "@/components/pixel-null/dashboard/pn-replay-button";

export const dynamic = "force-dynamic";

const HEALTH_CONFIG = {
  healthy: { label: "ONLINE", className: "pn-text-cyan" },
  degraded: { label: "DEGRADED", className: "pn-text-amber" },
  down: { label: "OFFLINE", className: "pn-text-red" },
  no_data: { label: "AWAITING", className: "pn-text-dim" },
} as const;

export default async function PnDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const activeWs = await getActiveWorkspace(session.user.id);
  if (!activeWs) redirect("/onboarding");

  let workspace, analytics;
  try {
    workspace = await db.workspace.findUnique({
      where: { id: activeWs.id },
      select: {
        id: true,
        name: true,
        domain: true,
        enableMeta: true,
        enableTikTok: true,
        enableGA4: true,
        enableKlaviyo: true,
        enableReddit: true,
        enablePinterest: true,
      },
    });

    if (!workspace) redirect("/onboarding");

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { displayCurrency: true },
    });
    const displayCurrency = user?.displayCurrency ?? "USD";

    analytics = await getCachedAnalytics(
      workspace.id,
      async () => computeDashboardAnalytics(workspace!.id, session.user!.id!, displayCurrency),
      displayCurrency
    );

    const subscription = await db.subscription.findUnique({
      where: { userId: session.user.id },
      select: { plan: true },
    });
    const freshPlan = subscription?.plan ?? "FREE";
    const freshPlanConfig = BILLING_PLANS[freshPlan as keyof typeof BILLING_PLANS];
    const freshOrdersLimit = freshPlanConfig?.ordersPerMonth ?? 50;
    let freshOrdersUsed: number;
    try {
      freshOrdersUsed = await getOrderCount(session.user.id);
    } catch {
      freshOrdersUsed = 0;
    }
    analytics.billing = {
      plan: freshPlan,
      ordersUsed: freshOrdersUsed,
      ordersLimit: freshOrdersLimit,
      usagePercent: Math.min(100, Math.round((freshOrdersUsed / freshOrdersLimit) * 100)),
    };
  } catch {
    return (
      <div>
        <p className="pn-text-red" style={{ fontSize: "0.8rem" }}>
          {"// ERROR: FAILED TO LOAD DASHBOARD DATA"}
        </p>
        <p className="pn-text-dim" style={{ fontSize: "0.7rem", marginTop: 8 }}>
          PLEASE REFRESH THE PAGE
        </p>
      </div>
    );
  }

  const healthConfig = HEALTH_CONFIG[analytics.health.status];

  // Count failed events for replay
  let failedCount = 0;
  try {
    failedCount = await db.eventLog.count({
      where: { workspaceId: workspace.id, status: "FAILED" },
    });
  } catch {
    // ignore
  }

  return (
    <div>
      {/* Section Header */}
      <div className="pn-dash-section-header">
        <div>
          <span className="pn-ref-label">* SYSTEM_STATUS // DASHBOARD</span>
          <div className="pn-dash-section-title" style={{ marginTop: 4 }}>
            {workspace.name}
          </div>
          {workspace.domain && (
            <span className="pn-text-dim" style={{ fontSize: "0.7rem" }}>{workspace.domain}</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              className="pn-status-dot"
              style={{
                width: 8,
                height: 8,
                background: analytics.health.status === "healthy" ? "var(--pn-accent)"
                  : analytics.health.status === "degraded" ? "#f59e0b"
                  : analytics.health.status === "down" ? "var(--pn-accent-danger)"
                  : "var(--pn-text-dim)",
                boxShadow: analytics.health.status !== "no_data" ? `0 0 10px currentColor` : "none",
              }}
            />
            <span className={healthConfig.className} style={{ fontSize: "0.75rem", letterSpacing: 1 }}>
              {healthConfig.label}
            </span>
          </div>
          <Link
            href="/pixel-null/settings"
            style={{ fontSize: "0.7rem", color: "var(--pn-text-dim)", textDecoration: "none" }}
          >
            [ SETTINGS ]
          </Link>
        </div>
      </div>

      {/* Stat Strip */}
      <div className="pn-dash-stat-strip">
        <div className="pn-dash-stat-box">
          <div className="pn-dash-stat-val">
            {analytics.billing.ordersUsed}/{analytics.billing.ordersLimit}
          </div>
          <div className="pn-dash-stat-label">ORDERS USED</div>
        </div>
        <div className="pn-dash-stat-box">
          <div className="pn-dash-stat-val">{analytics.health.successRate}%</div>
          <div className="pn-dash-stat-label">SUCCESS RATE</div>
        </div>
        <div className="pn-dash-stat-box">
          <div className="pn-dash-stat-val">{analytics.health.totalEvents24h.toLocaleString()}</div>
          <div className="pn-dash-stat-label">EVENTS 24H</div>
        </div>
        <div className="pn-dash-stat-box">
          <div className="pn-dash-stat-val">
            {new Intl.NumberFormat("en-US", { style: "currency", currency: analytics.currency, maximumFractionDigits: 0 }).format(analytics.revenue.purchaseValue.today)}
          </div>
          <div className="pn-dash-stat-label">REVENUE TODAY</div>
        </div>
      </div>

      {/* Order Usage */}
      <div className="pn-dash-mb">
        <PnOrderUsage
          plan={analytics.billing.plan}
          ordersUsed={analytics.billing.ordersUsed}
          ordersLimit={analytics.billing.ordersLimit}
          usagePercent={analytics.billing.usagePercent}
        />
      </div>

      {/* Revenue + Funnel */}
      <div className="pn-dash-mb">
        <PnRevenueCards revenue={analytics.revenue} currency={analytics.currency} />
      </div>

      <div className="pn-dash-grid-2">
        <PnEventFunnel eventBreakdown={analytics.eventBreakdown} />
        <PnDeliveryStats health={analytics.health} />
      </div>

      {/* Platform Delivery */}
      <div className="pn-dash-section-header">
        <div>
          <span className="pn-ref-label">* DELIVERY_MATRIX // PLATFORMS</span>
          <div className="pn-dash-section-title" style={{ marginTop: 4 }}>Platform Status</div>
        </div>
        {failedCount > 0 && (
          <PnReplayButton workspaceId={workspace.id} failedCount={failedCount} />
        )}
      </div>
      <div className="pn-dash-mb">
        <PnPlatformDelivery destinationDelivery={analytics.destinationDelivery} />
      </div>

      {/* Conversion Accuracy + Campaign Performance */}
      <div className="pn-dash-grid-2">
        <PnConversionAccuracy conversionAccuracy={analytics.conversionAccuracy} />
        <div /> {/* Spacer for grid alignment */}
      </div>

      <div className="pn-dash-section-header">
        <div>
          <span className="pn-ref-label">* CAMPAIGN_DATA // 30D</span>
          <div className="pn-dash-section-title" style={{ marginTop: 4 }}>Campaign Performance</div>
        </div>
      </div>
      <div className="pn-dash-mb">
        <PnCampaignPerformance campaigns={analytics.campaigns} currency={analytics.currency} />
      </div>

      {/* Recent Events */}
      <div className="pn-dash-section-header">
        <div>
          <span className="pn-ref-label">* RECENT_EVENTS // LIVE</span>
          <div className="pn-dash-section-title" style={{ marginTop: 4 }}>Event Log</div>
        </div>
      </div>
      <PnRecentEvents workspaceId={workspace.id} />
    </div>
  );
}
