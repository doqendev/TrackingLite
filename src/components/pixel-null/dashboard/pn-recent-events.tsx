import { db } from "@/lib/db";
import { EventStatus, Destination } from "@prisma/client";
import Link from "next/link";

interface PnRecentEventsProps {
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

export async function PnRecentEvents({ workspaceId }: PnRecentEventsProps) {
  let events: Array<{
    id: string;
    eventName: string;
    status: EventStatus;
    destination: Destination;
    value: number | null;
    currency: string | null;
    createdAt: Date;
  }>;

  try {
    events = await db.eventLog.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        eventName: true,
        status: true,
        destination: true,
        value: true,
        currency: true,
        createdAt: true,
      },
    });
  } catch {
    events = [];
  }

  if (events.length === 0) {
    return (
      <div className="pn-dash-card">
        <div className="pn-dash-card-header">
          <span>EVENTS.LOG</span>
          <span>RECENT // LIVE</span>
        </div>
        <div className="pn-dash-card-body">
          <span className="pn-text-dim" style={{ fontSize: "0.75rem" }}>
            {"// AWAITING FIRST EVENT"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="pn-dash-card">
      <div className="pn-dash-card-header">
        <span>EVENTS.LOG</span>
        <span>RECENT // LIVE</span>
      </div>
      <div style={{ padding: 0 }}>
        <table className="pn-dash-table">
          <thead>
            <tr>
              <th>TIME</th>
              <th>EVENT</th>
              <th>DEST</th>
              <th>STATUS</th>
              <th className="text-right">VALUE</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td style={{ whiteSpace: "nowrap", fontSize: "0.7rem" }} className="pn-text-dim">
                  {formatRelativeTime(event.createdAt)}
                </td>
                <td>{event.eventName}</td>
                <td className="pn-text-dim">{DEST_LABELS[event.destination]}</td>
                <td className={STATUS_COLORS[event.status]}>{event.status}</td>
                <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {event.value != null ? (
                    <span className="pn-text-cyan">
                      {event.currency ?? "USD"} {event.value.toFixed(2)}
                    </span>
                  ) : (
                    <span className="pn-text-dim">--</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding: "10px 16px", borderTop: "1px solid var(--pn-border)" }}>
        <Link
          href="/pixel-null/events"
          style={{ fontSize: "0.7rem", color: "var(--pn-accent)", textDecoration: "none" }}
        >
          VIEW ALL &gt;&gt;
        </Link>
      </div>
    </div>
  );
}
