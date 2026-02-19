import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import { computeDashboardAnalytics } from "@/lib/analytics";
import { getCachedAnalytics } from "@/lib/analytics-cache";
import { OrderUsageBar } from "@/components/dashboard/order-usage-bar";
import { RevenueCards } from "@/components/dashboard/revenue-cards";
import { EventFunnel } from "@/components/dashboard/event-funnel";
import { DeliveryStats } from "@/components/dashboard/delivery-stats";
import { RecentEvents } from "@/components/dashboard/recent-events";
import { ConversionAccuracy } from "@/components/dashboard/conversion-accuracy";
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

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const workspace = await db.workspace.findFirst({
    where: { userId: session.user.id, isActive: true },
    select: {
      id: true,
      name: true,
      domain: true,
      metaPixelId: true,
      metaAccessTokenEncrypted: true,
    },
  });

  if (!workspace) {
    redirect("/onboarding");
  }

  const hasMetaCredentials = !!(workspace.metaPixelId && workspace.metaAccessTokenEncrypted);

  const analytics = await getCachedAnalytics(workspace.id, () =>
    computeDashboardAnalytics(workspace.id, session.user!.id!)
  );

  const healthConfig = HEALTH_CONFIG[analytics.health.status];

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

      {/* Setup banner -- shown when Meta credentials are missing */}
      {!hasMetaCredentials && (
        <Alert className="border-amber-500/20 bg-amber-500/5 border-l-2 border-l-amber-500/40 flex items-start gap-4">
          <div className="flex-shrink-0 p-1.5 bg-amber-500/10 rounded-md">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          </div>
          <AlertDescription className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-400">Meta credentials not configured</p>
            <p className="text-sm text-amber-400/80 mt-0.5">
              Add your Meta Pixel ID and Access Token to start forwarding events.
            </p>
          </AlertDescription>
          <Button variant="outline" size="sm" className="border-amber-500/20 text-amber-400 hover:bg-amber-500/10 flex-shrink-0" asChild>
            <Link href="/settings">Configure now</Link>
          </Button>
        </Alert>
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
      <ConversionAccuracy conversionAccuracy={analytics.conversionAccuracy} />

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
