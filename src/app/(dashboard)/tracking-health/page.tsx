import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { db } from "@/lib/db";
import { getTrackingHealth } from "@/lib/tracking-health";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_CONFIG = {
  ok: {
    label: "Healthy",
    icon: CheckCircle2,
    badge: "bg-green-500/10 text-green-400",
    iconClass: "text-green-400",
  },
  warning: {
    label: "Needs attention",
    icon: AlertTriangle,
    badge: "bg-amber-500/10 text-amber-400",
    iconClass: "text-amber-400",
  },
  error: {
    label: "Action required",
    icon: XCircle,
    badge: "bg-red-500/10 text-red-400",
    iconClass: "text-red-400",
  },
} as const;

export default async function TrackingHealthPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const activeWs = await getActiveWorkspace(session.user.id);
  if (!activeWs) redirect("/onboarding");

  const workspace = await db.workspace.findUnique({
    where: { id: activeWs.id },
    select: { id: true, name: true, domain: true },
  });
  if (!workspace) redirect("/onboarding");

  const health = await getTrackingHealth(workspace.id);
  const summary = STATUS_CONFIG[health.status];
  const SummaryIcon = summary.icon;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tracking Health</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Operational status for {workspace.name}
            {workspace.domain ? ` · ${workspace.domain}` : ""}
          </p>
        </div>
        <Badge className={summary.badge}>
          <SummaryIcon className="mr-1.5 h-3.5 w-3.5" />
          {summary.label}
        </Badge>
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-foreground">Production Readiness</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {health.checks.map((check) => {
              const config = STATUS_CONFIG[check.severity];
              const Icon = config.icon;
              return (
                <div
                  key={check.key}
                  className="rounded-lg border border-white/[0.06] bg-card/60 p-4"
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${config.iconClass}`} />
                    <p className="text-sm font-semibold text-foreground">{check.label}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                    {check.detail}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
