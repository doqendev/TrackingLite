import { db } from "@/lib/db";
import { EventStatus, Destination } from "@prisma/client";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

interface RecentEventsProps {
  workspaceId: string;
}

function formatRelativeTime(date: Date): string {
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

const destinationLabels: Record<Destination, { label: string; className: string }> = {
  META: { label: "Meta", className: "text-blue-400" },
  TIKTOK: { label: "TikTok", className: "text-pink-400" },
  GA4: { label: "GA4", className: "text-green-400" },
  KLAVIYO: { label: "Klaviyo", className: "text-emerald-400" },
  REDDIT: { label: "Reddit", className: "text-orange-400" },
  PINTEREST: { label: "Pinterest", className: "text-red-500" },
};

export async function RecentEvents({ workspaceId }: RecentEventsProps) {
  const t = await getTranslations("dashboard");
  const tc = await getTranslations("common");

  const statusConfig: Record<EventStatus, { label: string; className: string }> = {
    PENDING: { label: t("pending"), className: "bg-yellow-500/10 text-yellow-400" },
    SENT: { label: t("sent"), className: "bg-green-500/10 text-green-400" },
    FAILED: { label: t("failed"), className: "bg-red-500/10 text-red-400" },
    RETRYING: { label: t("retrying"), className: "bg-orange-500/10 text-orange-400" },
  };

  type EventRow = {
    id: string;
    eventName: string;
    eventId: string;
    status: EventStatus;
    destination: Destination;
    pageUrl: string | null;
    errorMessage: string | null;
    value: number | null;
    currency: string | null;
    createdAt: Date;
  };

  let events: EventRow[];
  try {
    events = await db.eventLog.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        eventName: true,
        eventId: true,
        status: true,
        destination: true,
        pageUrl: true,
        errorMessage: true,
        value: true,
        currency: true,
        createdAt: true,
      },
    });
  } catch (error) {
    console.error("RecentEvents data fetch failed:", error);
    events = [];
  }

  if (events.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm font-medium text-muted-foreground">{t("noEventsYet")}</p>
        <p className="text-xs text-muted-foreground mt-1">{t("eventsAppearHere")}</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between px-5 py-4">
        <h3 className="text-sm font-semibold text-foreground">{t("recentEvents")}</h3>
        <Link href="/events" className="text-xs text-brand-500 hover:text-brand-400 font-medium inline-flex items-center gap-1 group">
          {tc("viewAll")} <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </CardHeader>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs font-normal text-muted-foreground/60 uppercase tracking-wider px-5 py-3">{t("time")}</TableHead>
              <TableHead className="text-xs font-normal text-muted-foreground/60 uppercase tracking-wider px-5 py-3">{t("event")}</TableHead>
              <TableHead className="text-xs font-normal text-muted-foreground/60 uppercase tracking-wider px-5 py-3">{t("eventId")}</TableHead>
              <TableHead className="text-xs font-normal text-muted-foreground/60 uppercase tracking-wider px-5 py-3">{t("dest")}</TableHead>
              <TableHead className="text-xs font-normal text-muted-foreground/60 uppercase tracking-wider px-5 py-3">{t("status")}</TableHead>
              <TableHead className="text-xs font-normal text-muted-foreground/60 uppercase tracking-wider px-5 py-3">{t("value")}</TableHead>
              <TableHead className="text-xs font-normal text-muted-foreground/60 uppercase tracking-wider px-5 py-3">{t("page")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => {
              const status = statusConfig[event.status];
              const pageHost = event.pageUrl
                ? (() => {
                    try {
                      return new URL(event.pageUrl).pathname;
                    } catch {
                      return event.pageUrl;
                    }
                  })()
                : "—";

              return (
                <TableRow key={event.id} className="transition-colors hover:bg-white/[0.02]">
                  <TableCell className="px-5 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {formatRelativeTime(event.createdAt)}
                  </TableCell>
                  <TableCell className="px-5 py-3">
                    <span className="font-medium text-foreground">{event.eventName}</span>
                  </TableCell>
                  <TableCell className="px-5 py-3">
                    <code className="text-xs text-muted-foreground font-mono">
                      {event.eventId.slice(0, 8)}...
                    </code>
                  </TableCell>
                  <TableCell className="px-5 py-3">
                    <span className={`text-xs font-medium ${destinationLabels[event.destination].className}`}>
                      {destinationLabels[event.destination].label}
                    </span>
                  </TableCell>
                  <TableCell className="px-5 py-3">
                    <Badge className={status.className}>
                      {status.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-5 py-3">
                    {event.value != null ? (
                      <span className="text-xs font-medium text-foreground tabular-nums">
                        {event.currency ?? "USD"} {event.value.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="px-5 py-3 max-w-[200px]">
                    <span className="text-xs text-muted-foreground truncate block" title={event.pageUrl ?? ""}>
                      {pageHost.length > 30 ? pageHost.slice(0, 30) + "…" : pageHost}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
