"use client";

interface PnOrderUsageProps {
  plan: string;
  ordersUsed: number;
  ordersLimit: number;
  usagePercent: number;
}

function getBarClass(pct: number): string {
  if (pct >= 90) return "pn-dash-progress-fill--danger";
  if (pct >= 70) return "pn-dash-progress-fill--warn";
  return "";
}

export function PnOrderUsage({ plan, ordersUsed, ordersLimit, usagePercent }: PnOrderUsageProps) {
  const filled = Math.round((ordersUsed / Math.max(ordersLimit, 1)) * 20);
  const empty = 20 - filled;
  const bar = "=".repeat(filled) + "-".repeat(empty);

  return (
    <div className="pn-dash-card">
      <div className="pn-dash-card-header">
        <span>ORDERS.LOG</span>
        <span className="pn-dash-badge pn-dash-badge--cyan">{plan}</span>
      </div>
      <div className="pn-dash-card-body">
        <div style={{ fontFamily: "var(--pn-font-mono), monospace", fontSize: "0.75rem", marginBottom: 12 }}>
          <span className="pn-text-cyan">ORDERS:</span>{" "}
          {ordersUsed.toLocaleString()}/{ordersLimit.toLocaleString()}{" "}
          <span className="pn-text-dim">[{bar}]</span>{" "}
          <span className={usagePercent >= 90 ? "pn-text-red" : usagePercent >= 70 ? "pn-text-amber" : "pn-text-cyan"}>
            {usagePercent}%
          </span>
        </div>
        <div className="pn-dash-progress">
          <div
            className={`pn-dash-progress-fill ${getBarClass(usagePercent)}`}
            style={{ width: `${usagePercent}%` }}
          />
        </div>
        <div style={{ marginTop: 8, fontSize: "0.65rem", color: "var(--pn-text-dim)" }}>
          BILLING_MODEL: PURCHASE_EVENTS_ONLY
        </div>
      </div>
    </div>
  );
}
