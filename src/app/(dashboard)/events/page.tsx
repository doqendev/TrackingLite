import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { EventName, EventStatus, Destination } from "@prisma/client";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ClipboardList } from "lucide-react";
import { ReplayButton } from "@/components/dashboard/replay-button";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const statusConfig: Record<EventStatus, { label: string; className: string }> = {
  PENDING: { label: "Pending", className: "bg-yellow-500/10 text-yellow-400" },
  SENT: { label: "Sent", className: "bg-green-500/10 text-green-400" },
  FAILED: { label: "Failed", className: "bg-red-500/10 text-red-400" },
  RETRYING: { label: "Retrying", className: "bg-orange-500/10 text-orange-400" },
};

const destinationLabels: Record<Destination, { label: string; className: string }> = {
  META: { label: "Meta", className: "text-blue-400" },
  GOOGLE_ADS: { label: "Google", className: "text-amber-400" },
  TIKTOK: { label: "TikTok", className: "text-pink-400" },
  GA4: { label: "GA4", className: "text-orange-400" },
  KLAVIYO: { label: "Klaviyo", className: "text-emerald-400" },
};

const EVENT_NAMES = ["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase"] as const;

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

interface SearchParams {
  eventName?: string;
  status?: string;
  page?: string;
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const params = searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const filterEventName = params.eventName as EventName | undefined;
  const filterStatus = params.status as EventStatus | undefined;

  const workspace = await db.workspace.findFirst({
    where: { userId: session.user.id, isActive: true },
    select: { id: true, name: true },
  });

  if (!workspace) redirect("/onboarding");

  const where = {
    workspaceId: workspace.id,
    ...(filterEventName && EVENT_NAMES.includes(filterEventName as (typeof EVENT_NAMES)[number])
      ? { eventName: filterEventName }
      : {}),
    ...(filterStatus && Object.values(EventStatus).includes(filterStatus as EventStatus)
      ? { status: filterStatus as EventStatus }
      : {}),
  };

  const [events, total, failedCount] = await Promise.all([
    db.eventLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        eventName: true,
        eventId: true,
        status: true,
        destination: true,
        pageUrl: true,
        utmSource: true,
        utmCampaign: true,
        errorMessage: true,
        retryCount: true,
        value: true,
        currency: true,
        createdAt: true,
      },
    }),
    db.eventLog.count({ where }),
    db.eventLog.count({ where: { workspaceId: workspace.id, status: "FAILED" } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Build query string helper
  function buildHref(overrides: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    if (params.eventName) q.set("eventName", params.eventName);
    if (params.status) q.set("status", params.status);
    if (params.page) q.set("page", params.page);
    Object.entries(overrides).forEach(([k, v]) => {
      if (v === undefined || v === "") q.delete(k);
      else q.set(k, v);
    });
    const str = q.toString();
    return `/events${str ? `?${str}` : ""}`;
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Event Log</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total.toLocaleString()} total events
          </p>
        </div>
        <ReplayButton workspaceId={workspace.id} failedCount={failedCount} />
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <span className="text-sm font-medium text-foreground">Filter:</span>

          {/* Event type filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              variant={!filterEventName ? "brand" : "secondary"}
              size="sm"
              className="rounded-full"
              asChild
            >
              <Link href={buildHref({ eventName: undefined, page: "1" })}>
                All Events
              </Link>
            </Button>
            {EVENT_NAMES.map((name) => (
              <Button
                key={name}
                variant={filterEventName === name ? "brand" : "secondary"}
                size="sm"
                className="rounded-full"
                asChild
              >
                <Link href={buildHref({ eventName: name, page: "1" })}>
                  {name}
                </Link>
              </Button>
            ))}
          </div>

          <Separator orientation="vertical" className="h-5" />

          {/* Status filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              variant={!filterStatus ? "brand" : "secondary"}
              size="sm"
              className="rounded-full"
              asChild
            >
              <Link href={buildHref({ status: undefined, page: "1" })}>
                All
              </Link>
            </Button>
            {(["SENT", "PENDING", "FAILED", "RETRYING"] as EventStatus[]).map((s) => {
              const cfg = statusConfig[s];
              return (
                <Button
                  key={s}
                  variant={filterStatus === s ? "brand" : "secondary"}
                  size="sm"
                  className="rounded-full"
                  asChild
                >
                  <Link href={buildHref({ status: s, page: "1" })}>
                    {cfg.label}
                  </Link>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Events table */}
      {events.length === 0 ? (
        <Card className="p-12 text-center">
          <ClipboardList className="h-14 w-14 text-brand-500/30 mx-auto mb-4" />
          <p className="text-base font-semibold text-foreground">No events found</p>
          <p className="text-sm text-muted-foreground mt-1">
            {filterEventName || filterStatus
              ? "Try adjusting your filters"
              : "Events will appear here once your JS snippet receives traffic"}
          </p>
          {(filterEventName || filterStatus) && (
            <Link
              href="/events"
              className="mt-4 inline-flex items-center gap-1 text-sm text-brand-500 hover:text-brand-400 font-medium underline underline-offset-4"
            >
              Clear filters
            </Link>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Time</TableHead>
                  <TableHead className="whitespace-nowrap">Event Type</TableHead>
                  <TableHead className="whitespace-nowrap">Event ID</TableHead>
                  <TableHead className="whitespace-nowrap">Dest</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="whitespace-nowrap">Value</TableHead>
                  <TableHead className="whitespace-nowrap">Page URL</TableHead>
                  <TableHead className="whitespace-nowrap">Source</TableHead>
                  <TableHead className="whitespace-nowrap">Campaign</TableHead>
                  <TableHead className="whitespace-nowrap">Error</TableHead>
                  <TableHead className="whitespace-nowrap">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => {
                  const status = statusConfig[event.status];
                  let pagePath = "—";
                  if (event.pageUrl) {
                    try {
                      pagePath = new URL(event.pageUrl).pathname;
                    } catch {
                      pagePath = event.pageUrl.slice(0, 40);
                    }
                  }

                  return (
                    <TableRow key={event.id} className="transition-colors hover:bg-white/[0.02]">
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatRelativeTime(event.createdAt)}
                      </TableCell>
                      <TableCell className="font-medium text-foreground whitespace-nowrap">
                        {event.eventName}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs text-muted-foreground font-mono" title={event.eventId}>
                          {event.eventId.slice(0, 12)}...
                        </code>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className={`text-xs font-medium ${destinationLabels[event.destination].className}`}>
                          {destinationLabels[event.destination].label}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge className={`inline-flex items-center gap-1 ${status.className}`}>
                          {status.label}
                          {event.retryCount > 0 && (
                            <span className="opacity-70">({event.retryCount}x)</span>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {event.value !== null ? (
                          <span className="text-sm font-medium text-foreground tabular-nums">
                            {event.currency ? `${event.currency} ` : '$'}
                            {event.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <span
                          className="text-xs text-muted-foreground truncate block"
                          title={event.pageUrl ?? ""}
                        >
                          {pagePath.length > 35 ? pagePath.slice(0, 35) + "…" : pagePath}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span
                          className="text-xs text-muted-foreground"
                          title={event.utmSource ?? ""}
                        >
                          {event.utmSource
                            ? event.utmSource.length > 15
                              ? event.utmSource.slice(0, 15) + "..."
                              : event.utmSource
                            : "--"}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[160px]">
                        <span
                          className="text-xs text-muted-foreground truncate block"
                          title={event.utmCampaign ?? ""}
                        >
                          {event.utmCampaign
                            ? event.utmCampaign.length > 20
                              ? event.utmCampaign.slice(0, 20) + "..."
                              : event.utmCampaign
                            : "--"}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        {event.errorMessage ? (
                          <span
                            className="text-xs text-red-400 truncate block"
                            title={event.errorMessage}
                          >
                            {event.errorMessage.length > 35
                              ? event.errorMessage.slice(0, 35) + "…"
                              : event.errorMessage}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {event.status === "FAILED" && (
                          <ReplayButton
                            workspaceId={workspace.id}
                            failedCount={0}
                            eventId={event.id}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06] bg-card/50">
            <p className="text-xs text-muted-foreground">
              Page {page} of {totalPages} &middot; {total.toLocaleString()} events
            </p>
            <div className="flex items-center gap-2">
              {page > 1 ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={buildHref({ page: String(page - 1) })}>
                    Previous
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  Previous
                </Button>
              )}
              {page < totalPages ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={buildHref({ page: String(page + 1) })}>
                    Next
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  Next
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
