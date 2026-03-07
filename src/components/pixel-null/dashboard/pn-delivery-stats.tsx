"use client";

import type { HealthMetrics } from "@/types/app";

interface PnDeliveryStatsProps {
  health: HealthMetrics;
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

function getRateColor(rate: number): string {
  if (rate >= 95) return "pn-text-cyan";
  if (rate >= 80) return "pn-text-amber";
  return "pn-text-red";
}

export function PnDeliveryStats({ health }: PnDeliveryStatsProps) {
  const deliveredPct = health.totalEvents24h > 0
    ? Math.round((health.sentEvents24h / health.totalEvents24h) * 1000) / 10
    : 0;
  const failedPct = health.totalEvents24h > 0
    ? Math.round((health.failedEvents24h / health.totalEvents24h) * 1000) / 10
    : 0;

  const deliveredBar = Math.round(deliveredPct / 5);
  const failedBar = Math.round(failedPct / 5);

  return (
    <div className="pn-dash-card">
      <div className="pn-dash-card-header">
        <span>DELIVERY.LOG</span>
        <span>24H_METRICS</span>
      </div>
      <div className="pn-dash-card-body" style={{ fontFamily: "var(--pn-font-mono), monospace", fontSize: "0.75rem" }}>
        <div style={{ marginBottom: 16 }}>
          <span className="pn-text-dim">TOTAL_EVENTS_24H:</span>{" "}
          <span style={{ color: "var(--pn-text-main)" }}>{health.totalEvents24h.toLocaleString()}</span>
        </div>

        <div style={{ marginBottom: 8 }}>
          <span className="pn-text-dim">SUCCESS_RATE:</span>{" "}
          <span
            className={getRateColor(health.successRate)}
            style={{ fontFamily: "var(--pn-font-display), sans-serif", fontSize: "1.8rem" }}
          >
            {health.successRate}%
          </span>
        </div>

        <div className="pn-dash-progress" style={{ marginBottom: 16 }}>
          <div
            className="pn-dash-progress-fill"
            style={{ width: `${health.totalEvents24h > 0 ? health.successRate : 0}%` }}
          />
        </div>

        <div style={{ marginBottom: 6 }}>
          <span className="pn-text-cyan">DELIVERED:</span>{" "}
          {health.sentEvents24h.toLocaleString()}{" "}
          <span className="pn-text-dim">[{"#".repeat(deliveredBar)}{"_".repeat(Math.max(0, 20 - deliveredBar))}]</span>{" "}
          <span className="pn-text-cyan">{deliveredPct}%</span>
        </div>

        <div style={{ marginBottom: 12 }}>
          <span className={health.failedEvents24h > 0 ? "pn-text-red" : "pn-text-dim"}>FAILED:</span>{" "}
          <span className={health.failedEvents24h > 0 ? "pn-text-red" : ""}>{health.failedEvents24h.toLocaleString()}</span>{" "}
          <span className="pn-text-dim">[{"#".repeat(failedBar)}{"_".repeat(Math.max(0, 20 - failedBar))}]</span>{" "}
          <span className={health.failedEvents24h > 0 ? "pn-text-red" : "pn-text-dim"}>{failedPct}%</span>
        </div>

        {health.lastEventAt && (
          <div className="pn-scan-line" style={{ margin: "12px 0" }} />
        )}
        {health.lastEventAt && (
          <div>
            <span className="pn-text-dim">LAST_EVENT:</span>{" "}
            <span className="pn-text-cyan">{formatRelativeTime(health.lastEventAt)}</span>
          </div>
        )}
        {health.totalEvents24h === 0 && (
          <div style={{ marginTop: 8 }}>
            <span className="pn-text-dim">{"// NO EVENTS IN LAST 24H"}</span>
          </div>
        )}
      </div>
    </div>
  );
}
