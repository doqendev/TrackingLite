"use client";

import type { EventBreakdown } from "@/types/app";

interface PnEventFunnelProps {
  eventBreakdown: EventBreakdown;
}

const ROWS = [
  { key: "AddToCart" as const, label: "ADD_TO_CART" },
  { key: "InitiateCheckout" as const, label: "CHECKOUT" },
  { key: "Purchase" as const, label: "PURCHASE" },
];

function getDeltaText(today: number, yesterday: number): string {
  if (yesterday === 0 && today === 0) return "--";
  if (yesterday === 0) return "+new";
  const pct = Math.round(((today - yesterday) / yesterday) * 100);
  if (pct > 0) return `+${pct}%`;
  if (pct < 0) return `${pct}%`;
  return "0%";
}

function getDeltaColor(today: number, yesterday: number): string {
  if (yesterday === 0 && today === 0) return "pn-text-dim";
  if (yesterday === 0) return "pn-text-green";
  if (today > yesterday) return "pn-text-green";
  if (today < yesterday) return "pn-text-red";
  return "pn-text-dim";
}

export function PnEventFunnel({ eventBreakdown }: PnEventFunnelProps) {
  const maxCount = Math.max(...ROWS.map((r) => eventBreakdown[r.key].today), 1);

  return (
    <div className="pn-dash-card">
      <div className="pn-dash-card-header">
        <span>FUNNEL.LOG</span>
        <span>CONVERSION_FUNNEL</span>
      </div>
      <div className="pn-dash-card-body">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {ROWS.map(({ key, label }) => {
            const data = eventBreakdown[key];
            const barPct = Math.max((data.today / maxCount) * 100, data.today > 0 ? 3 : 0);

            return (
              <div key={key}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 4,
                    fontSize: "0.7rem",
                  }}
                >
                  <span className="pn-text-dim">{label}</span>
                  <div style={{ display: "flex", gap: 12 }}>
                    <span style={{ color: "var(--pn-text-main)" }}>
                      {data.today.toLocaleString()}
                    </span>
                    <span className={getDeltaColor(data.today, data.yesterday)} style={{ width: 48, textAlign: "right" }}>
                      {getDeltaText(data.today, data.yesterday)}
                    </span>
                  </div>
                </div>
                <div className="pn-dash-progress">
                  <div
                    className="pn-dash-progress-fill"
                    style={{ width: `${barPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
