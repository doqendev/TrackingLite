import { db } from "@/lib/db";
import { EventStatus } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { Zap, CheckCircle2, AlertCircle, Clock } from "lucide-react";

interface StatsCardsProps {
  workspaceId: string;
}

function formatRelativeTime(date: Date | null): string {
  if (!date) return "Never";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export async function StatsCards({ workspaceId }: StatsCardsProps) {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [totalEvents, sentEvents, failedEvents, lastEvent] = await Promise.all([
    db.eventLog.count({
      where: { workspaceId, createdAt: { gte: since24h } },
    }),
    db.eventLog.count({
      where: { workspaceId, createdAt: { gte: since24h }, status: EventStatus.SENT },
    }),
    db.eventLog.count({
      where: { workspaceId, createdAt: { gte: since24h }, status: EventStatus.FAILED },
    }),
    db.eventLog.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  const successRate = totalEvents > 0 ? Math.round((sentEvents / totalEvents) * 100) : 0;
  const successRateColor =
    successRate >= 90 ? "text-green-600" : successRate >= 70 ? "text-yellow-600" : "text-red-600";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Events */}
      <Card className="transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10]">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-muted-foreground">Total Events (24h)</p>
            <span className="p-1.5 bg-brand-600/10 rounded-md">
              <Zap className="h-4 w-4 text-brand-500" />
            </span>
          </div>
          <p className="text-3xl font-bold text-foreground tabular-nums">{totalEvents.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">Events received in last 24 hours</p>
        </CardContent>
      </Card>

      {/* Success Rate */}
      <Card className="transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10]">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-muted-foreground">Success Rate</p>
            <span className="p-1.5 bg-green-500/10 rounded-md">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </span>
          </div>
          <p className={`text-3xl font-bold tabular-nums ${successRateColor}`}>{successRate}%</p>
          <p className="text-xs text-muted-foreground mt-1">{sentEvents} of {totalEvents} delivered to Meta</p>
        </CardContent>
      </Card>

      {/* Failed Events */}
      <Card className="transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10]">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-muted-foreground">Failed Events</p>
            <span className={`p-1.5 rounded-md ${failedEvents > 0 ? "bg-red-500/10" : "bg-muted"}`}>
              <AlertCircle className={`h-4 w-4 ${failedEvents > 0 ? "text-red-500" : "text-muted-foreground"}`} />
            </span>
          </div>
          <p className={`text-3xl font-bold tabular-nums ${failedEvents > 0 ? "text-red-600" : "text-foreground"}`}>
            {failedEvents.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {failedEvents > 0 ? "Check events log for details" : "No failures in last 24h"}
          </p>
        </CardContent>
      </Card>

      {/* Last Event */}
      <Card className="transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10]">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-muted-foreground">Last Event</p>
            <span className="p-1.5 bg-purple-500/10 rounded-md">
              <Clock className="h-4 w-4 text-purple-500" />
            </span>
          </div>
          <p className="text-3xl font-bold text-foreground tabular-nums">
            {formatRelativeTime(lastEvent?.createdAt ?? null)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {lastEvent ? lastEvent.createdAt.toLocaleDateString() : "No events yet"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
