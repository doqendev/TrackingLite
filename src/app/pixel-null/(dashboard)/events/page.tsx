import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { EventName, EventStatus, Destination } from "@prisma/client";
import Link from "next/link";
import { PnReplayButton } from "@/components/pixel-null/dashboard/pn-replay-button";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const EVENT_NAMES = ["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase"] as const;

const STATUS_COLORS: Record<EventStatus, string> = {
  SENT: "pn-text-cyan",
  FAILED: "pn-text-red",
  PENDING: "pn-text-amber",
  RETRYING: "pn-text-amber",
};

const DEST_LABELS: Record<Destination, string> = {
  META: "META",
  TIKTOK: "TIKTOK",
  GA4: "GA4",
  KLAVIYO: "KLAVIYO",
  REDDIT: "REDDIT",
  PINTEREST: "PINTEREST",
  GOOGLE_ADS: "G_ADS",
};

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

export default async function PnEventsPage({
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

  const activeWs = await getActiveWorkspace(session.user.id);
  if (!activeWs) redirect("/onboarding");

  let workspace, events, total, failedCount, totalPages;
  try {
    workspace = await db.workspace.findUnique({
      where: { id: activeWs.id },
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

    [events, total, failedCount] = await Promise.all([
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

    totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  } catch {
    return (
      <div>
        <p className="pn-text-red" style={{ fontSize: "0.8rem" }}>
          {"// ERROR: FAILED TO LOAD EVENT DATA"}
        </p>
      </div>
    );
  }

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
    return `/pixel-null/events${str ? `?${str}` : ""}`;
  }

  return (
    <div>
      {/* Header */}
      <div className="pn-dash-section-header">
        <div>
          <span className="pn-ref-label">* EVENT_LOG // {workspace.name.toUpperCase()}</span>
          <div className="pn-dash-section-title" style={{ marginTop: 4 }}>Event Log</div>
          <span className="pn-text-dim" style={{ fontSize: "0.7rem" }}>
            TOTAL: {total.toLocaleString()} EVENTS
          </span>
        </div>
        <PnReplayButton workspaceId={workspace.id} failedCount={failedCount} />
      </div>

      {/* Filters */}
      <div className="pn-dash-card pn-dash-mb">
        <div className="pn-dash-card-body" style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
          <span className="pn-text-dim" style={{ fontSize: "0.65rem", letterSpacing: 1 }}>EVENT_TYPE:</span>
          <div className="pn-dash-filter">
            <Link
              href={buildHref({ eventName: undefined, page: "1" })}
              className={!filterEventName ? "pn-dash-filter--active" : ""}
            >
              ALL
            </Link>
            {EVENT_NAMES.map((name) => (
              <Link
                key={name}
                href={buildHref({ eventName: name, page: "1" })}
                className={filterEventName === name ? "pn-dash-filter--active" : ""}
              >
                {name.toUpperCase()}
              </Link>
            ))}
          </div>

          <span className="pn-text-dim" style={{ fontSize: "0.65rem", letterSpacing: 1, marginLeft: 8 }}>STATUS:</span>
          <div className="pn-dash-filter">
            <Link
              href={buildHref({ status: undefined, page: "1" })}
              className={!filterStatus ? "pn-dash-filter--active" : ""}
            >
              ALL
            </Link>
            {(["SENT", "PENDING", "FAILED", "RETRYING"] as EventStatus[]).map((s) => (
              <Link
                key={s}
                href={buildHref({ status: s, page: "1" })}
                className={filterStatus === s ? "pn-dash-filter--active" : ""}
              >
                {s}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      {events.length === 0 ? (
        <div className="pn-dash-card">
          <div className="pn-dash-card-body" style={{ textAlign: "center", padding: "48px 20px" }}>
            <p style={{ fontSize: "0.8rem" }}>{"// NO EVENTS FOUND"}</p>
            <p className="pn-text-dim" style={{ fontSize: "0.7rem", marginTop: 8 }}>
              {filterEventName || filterStatus
                ? "ADJUST FILTERS OR"
                : "EVENTS WILL APPEAR ONCE YOUR SNIPPET IS INSTALLED"}
            </p>
            {(filterEventName || filterStatus) && (
              <Link
                href="/pixel-null/events"
                className="pn-text-cyan"
                style={{ fontSize: "0.7rem", display: "inline-block", marginTop: 12 }}
              >
                CLEAR FILTERS &gt;&gt;
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="pn-dash-card">
          <div style={{ overflowX: "auto" }}>
            <table className="pn-dash-table">
              <thead>
                <tr>
                  <th>TIME</th>
                  <th>EVENT</th>
                  <th>EVENT_ID</th>
                  <th>DEST</th>
                  <th>STATUS</th>
                  <th className="text-right">VALUE</th>
                  <th>SOURCE</th>
                  <th>CAMPAIGN</th>
                  <th>ERROR</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  return (
                    <tr key={event.id}>
                      <td style={{ whiteSpace: "nowrap" }} className="pn-text-dim">
                        {formatRelativeTime(event.createdAt)}
                      </td>
                      <td>{event.eventName}</td>
                      <td className="pn-text-dim" style={{ fontFamily: "var(--pn-font-mono), monospace" }}>
                        {event.eventId.slice(0, 12)}...
                      </td>
                      <td className="pn-text-dim">{DEST_LABELS[event.destination]}</td>
                      <td>
                        <span className={STATUS_COLORS[event.status]}>
                          {event.status}
                          {event.retryCount > 0 && <span className="pn-text-dim"> ({event.retryCount}x)</span>}
                        </span>
                      </td>
                      <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {event.value != null ? (
                          <span className="pn-text-cyan">
                            {event.currency ?? "USD"} {event.value.toFixed(2)}
                          </span>
                        ) : (
                          <span className="pn-text-dim">--</span>
                        )}
                      </td>
                      <td className="pn-text-dim">
                        {event.utmSource
                          ? event.utmSource.length > 12
                            ? event.utmSource.slice(0, 12) + "..."
                            : event.utmSource
                          : "--"}
                      </td>
                      <td className="pn-text-dim" style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {event.utmCampaign
                          ? event.utmCampaign.length > 18
                            ? event.utmCampaign.slice(0, 18) + "..."
                            : event.utmCampaign
                          : "--"}
                      </td>
                      <td style={{ maxWidth: 160 }}>
                        {event.errorMessage ? (
                          <span className="pn-text-red" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", maxWidth: 160 }} title={event.errorMessage}>
                            {event.errorMessage.length > 30 ? event.errorMessage.slice(0, 30) + "..." : event.errorMessage}
                          </span>
                        ) : (
                          <span className="pn-text-dim">--</span>
                        )}
                      </td>
                      <td>
                        {event.status === "FAILED" && (
                          <PnReplayButton workspaceId={workspace.id} failedCount={0} eventId={event.id} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="pn-dash-page-controls">
            <span>
              PAGE {String(page).padStart(2, "0")} of {String(totalPages).padStart(2, "0")}{" // "}{total.toLocaleString()} EVENTS
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              {page > 1 ? (
                <Link href={buildHref({ page: String(page - 1) })}>&lt;&lt; PREV</Link>
              ) : (
                <button disabled>&lt;&lt; PREV</button>
              )}
              {page < totalPages ? (
                <Link href={buildHref({ page: String(page + 1) })}>NEXT &gt;&gt;</Link>
              ) : (
                <button disabled>NEXT &gt;&gt;</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
