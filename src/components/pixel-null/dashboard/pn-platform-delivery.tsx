"use client";

import type { DestinationDeliveryRow } from "@/types/app";

interface PnPlatformDeliveryProps {
  destinationDelivery: DestinationDeliveryRow[];
}

const DEST_CONFIG: Record<string, { label: string }> = {
  META: { label: "META" },
  TIKTOK: { label: "TIKTOK" },
  GA4: { label: "GA4" },
  KLAVIYO: { label: "KLAVIYO" },
  REDDIT: { label: "REDDIT" },
  PINTEREST: { label: "PINTEREST" },
  GOOGLE_ADS: { label: "GOOGLE_ADS" },
};

function getRateColor(rate: number): string {
  if (rate >= 95) return "pn-text-cyan";
  if (rate >= 80) return "pn-text-amber";
  return "pn-text-red";
}

function getStatusDot(row: DestinationDeliveryRow): { color: string; pulse: boolean } {
  if (row.failed > 0 && row.successRate < 80) return { color: "var(--pn-accent-danger)", pulse: true };
  if (row.total === 0) return { color: "var(--pn-text-dim)", pulse: false };
  return { color: "var(--pn-accent)", pulse: true };
}

export function PnPlatformDelivery({ destinationDelivery }: PnPlatformDeliveryProps) {
  if (destinationDelivery.length === 0) {
    return (
      <div className="pn-dash-card">
        <div className="pn-dash-card-header">
          <span>PLATFORM_MATRIX.LOG</span>
          <span>DELIVERY_STATUS</span>
        </div>
        <div className="pn-dash-card-body">
          <span className="pn-text-dim" style={{ fontSize: "0.75rem" }}>
            {"// NO DELIVERY DATA AVAILABLE"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="pn-dash-card">
      <div className="pn-dash-card-header">
        <span>PLATFORM_MATRIX.LOG</span>
        <span>DELIVERY_STATUS</span>
      </div>
      <div className="pn-dash-card-body" style={{ padding: 0 }}>
        <table className="pn-dash-table">
          <thead>
            <tr>
              <th>PLATFORM</th>
              <th className="text-right">DELIVERED</th>
              <th className="text-right">FAILED</th>
              <th className="text-right">RATE</th>
            </tr>
          </thead>
          <tbody>
            {destinationDelivery.map((row) => {
              const config = DEST_CONFIG[row.destination] ?? { label: row.destination };
              const dot = getStatusDot(row);

              return (
                <tr key={row.destination}>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          background: dot.color,
                          boxShadow: dot.pulse ? `0 0 8px ${dot.color}` : "none",
                          animation: dot.pulse ? "pn-pulse 2s ease-in-out infinite" : "none",
                          flexShrink: 0,
                        }}
                      />
                      {config.label}
                    </span>
                  </td>
                  <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {row.sent.toLocaleString()}
                  </td>
                  <td
                    className="text-right"
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      color: row.failed > 0 ? "var(--pn-accent-danger)" : undefined,
                    }}
                  >
                    {row.failed.toLocaleString()}
                  </td>
                  <td className={`text-right ${getRateColor(row.successRate)}`} style={{ fontVariantNumeric: "tabular-nums" }}>
                    {row.successRate.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
