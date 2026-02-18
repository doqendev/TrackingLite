import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { RecentEvents } from "@/components/dashboard/recent-events";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Settings, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

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
      apiKey: true,
      eventsForwardedCount: true,
      createdAt: true,
    },
  });

  if (!workspace) {
    redirect("/onboarding");
  }

  const hasMetaCredentials = !!(workspace.metaPixelId && workspace.metaAccessTokenEncrypted);
  const apiKeyPrefix = workspace.apiKey.slice(0, 8) + "...";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{workspace.name}</h1>
          {workspace.domain && (
            <p className="text-sm text-muted-foreground mt-0.5">{workspace.domain}</p>
          )}
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/settings" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </Button>
      </div>

      {/* Setup banner — shown when Meta credentials are missing */}
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

      {/* Stats cards */}
      <StatsCards workspaceId={workspace.id} />

      {/* Quick info row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10]">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">API Key</p>
            <p className="text-sm font-mono text-foreground mt-1">{apiKeyPrefix}</p>
          </CardContent>
        </Card>
        <Card className="transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10]">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Total Forwarded</p>
            <p className="text-sm font-semibold text-foreground mt-1">{workspace.eventsForwardedCount.toLocaleString()} events</p>
          </CardContent>
        </Card>
        <Card className="transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10]">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Workspace Since</p>
            <p className="text-sm font-semibold text-foreground mt-1">
              {workspace.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent events */}
      <RecentEvents workspaceId={workspace.id} />
    </div>
  );
}
