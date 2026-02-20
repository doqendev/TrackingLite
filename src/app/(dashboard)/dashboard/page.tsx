import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import { Destination } from "@prisma/client";
import { computeDashboardAnalytics } from "@/lib/analytics";
import { getCachedAnalytics } from "@/lib/analytics-cache";
import { convertCurrency } from "@/lib/currency";
import { getOrderCount } from "@/lib/billing";
import { BILLING_PLANS } from "@/lib/constants";
import { OrderUsageBar } from "@/components/dashboard/order-usage-bar";
import { RevenueCards } from "@/components/dashboard/revenue-cards";
import { EventFunnel } from "@/components/dashboard/event-funnel";
import { DeliveryStats } from "@/components/dashboard/delivery-stats";
import { RecentEvents } from "@/components/dashboard/recent-events";
import { ConversionAccuracy } from "@/components/dashboard/conversion-accuracy";
import { CampaignPerformance } from "@/components/dashboard/campaign-performance";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Settings, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

const HEALTH_CONFIG = {
  healthy: { dot: "bg-green-500", label: "Healthy", labelColor: "text-green-400" },
  degraded: { dot: "bg-amber-500", label: "Degraded", labelColor: "text-amber-400" },
  down: { dot: "bg-red-500", label: "Down", labelColor: "text-red-400" },
  inactive: { dot: "bg-muted-foreground", label: "Inactive", labelColor: "text-muted-foreground" },
} as const;

const DESTINATION_LABELS: Record<string, string> = {
  META: "Meta",
  GOOGLE_ADS: "Google Ads",
  TIKTOK: "TikTok",
  GA4: "GA4",
  KLAVIYO: "Klaviyo",
};

const VALID_DESTINATIONS = new Set<string>(Object.values(Destination));

interface DashboardPageProps {
  searchParams: Promise<{ destination?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const resolvedParams = await searchParams;

  const workspace = await db.workspace.findFirst({
    where: { userId: session.user.id, isActive: true },
    select: {
      id: true,
      name: true,
      domain: true,
      metaPixelId: true,
      metaAccessTokenEncrypted: true,
      enableGoogleAds: true,
      enableTikTok: true,
      enableGA4: true,
      enableKlaviyo: true,
    },
  });

  if (!workspace) {
    redirect("/onboarding");
  }

  // Check which destinations have credentials configured
  const hasMetaCredentials = !!(workspace.metaPixelId && workspace.metaAccessTokenEncrypted);
  const hasAnyDestination = hasMetaCredentials || workspace.enableGoogleAds || workspace.enableTikTok || workspace.enableGA4 || workspace.enableKlaviyo;

  // Parse destination filter from URL
  const destParam = resolvedParams.destination;
  let destination: Destination | undefined;
  if (destParam && VALID_DESTINATIONS.has(destParam)) {
    destination = destParam as Destination;
  }

  // Get user's display currency
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { displayCurrency: true },
  });
  const displayCurrency = user?.displayCurrency ?? "USD";

  const analytics = await getCachedAnalytics(
    workspace.id,
    async () => {
      const data = await computeDashboardAnalytics(
        workspace.id,
        session.user!.id!,
        destination,
        displayCurrency
      );

      // Convert revenue values if display currency differs from event currency
      const eventCurrency = data.revenue.purchaseValue.currency;
      if (displayCurrency && displayCurrency !== eventCurrency) {
        const rate = await convertCurrency(1, eventCurrency, displayCurrency);
        data.revenue.addToCartValue = {
          today: data.revenue.addToCartValue.today * rate,
          yesterday: data.revenue.addToCartValue.yesterday * rate,
          currency: displayCurrency,
        };
        data.revenue.checkoutValue = {
          today: data.revenue.checkoutValue.today * rate,
          yesterday: data.revenue.checkoutValue.yesterday * rate,
          currency: displayCurrency,
        };
        data.revenue.purchaseValue = {
          today: data.revenue.purchaseValue.today * rate,
          yesterday: data.revenue.purchaseValue.yesterday * rate,
          currency: displayCurrency,
        };
        data.campaigns = data.campaigns.map((c) => ({
          ...c,
          revenue: c.revenue * rate,
        }));
        data.currency = displayCurrency;
      }

      return data;
    },
    destParam,
    displayCurrency
  );

  // Query billing data fresh (not from cache) so plan changes reflect immediately
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

  const healthConfig = HEALTH_CONFIG[analytics.health.status];
  const enabledDests = analytics.enabledDestinations;
  const activeTab = destination ?? "all";

  return (
    <div className="space-y-6">
      {/* Page header with health badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">{workspace.name}</h1>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-secondary">
                <span className={`w-2 h-2 rounded-full ${healthConfig.dot}`} />
                <span className={`text-xs font-medium ${healthConfig.labelColor}`}>
                  {healthConfig.label}
                </span>
              </div>
            </div>
            {workspace.domain && (
              <p className="text-sm text-muted-foreground mt-0.5">{workspace.domain}</p>
            )}
          </div>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/settings" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </Button>
      </div>

      {/* Setup banner -- shown when NO destinations are configured */}
      {!hasAnyDestination && (
        <Alert className="border-amber-500/20 bg-amber-500/5 border-l-2 border-l-amber-500/40 flex items-start gap-4">
          <div className="flex-shrink-0 p-1.5 bg-amber-500/10 rounded-md">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          </div>
          <AlertDescription className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-400">No destinations configured</p>
            <p className="text-sm text-amber-400/80 mt-0.5">
              Connect at least one platform (Meta, Google Ads, TikTok, GA4, or Klaviyo) to start forwarding events.
            </p>
          </AlertDescription>
          <Button variant="outline" size="sm" className="border-amber-500/20 text-amber-400 hover:bg-amber-500/10 flex-shrink-0" asChild>
            <Link href="/settings">Configure now</Link>
          </Button>
        </Alert>
      )}

      {/* Destination tabs */}
      {enabledDests.length > 1 && (
        <div className="flex items-center gap-1.5 bg-secondary rounded-lg p-1 flex-wrap">
          <Link
            href="/dashboard"
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === "all"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </Link>
          {enabledDests.map((dest) => (
            <Link
              key={dest}
              href={`/dashboard?destination=${dest}`}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === dest
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {DESTINATION_LABELS[dest] ?? dest}
            </Link>
          ))}
        </div>
      )}

      {/* Order usage progress bar */}
      <OrderUsageBar
        plan={analytics.billing.plan}
        ordersUsed={analytics.billing.ordersUsed}
        ordersLimit={analytics.billing.ordersLimit}
        usagePercent={analytics.billing.usagePercent}
        hasEvents={analytics.health.lastEventAt !== null}
      />

      {/* Revenue cards */}
      <RevenueCards revenue={analytics.revenue} />

      {/* Conversion accuracy */}
      <ConversionAccuracy
        conversionAccuracy={analytics.conversionAccuracy}
        activeDestination={analytics.activeDestination}
      />

      {/* Campaign performance */}
      <CampaignPerformance campaigns={analytics.campaigns} currency={analytics.currency} />

      {/* Event funnel + Delivery stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EventFunnel eventBreakdown={analytics.eventBreakdown} />
        <DeliveryStats
          health={analytics.health}
          eventBreakdown={analytics.eventBreakdown}
        />
      </div>

      {/* Recent events */}
      <RecentEvents workspaceId={workspace.id} />
    </div>
  );
}
