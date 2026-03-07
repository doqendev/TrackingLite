"use client";

import type { RevenueMetrics } from "@/types/app";

interface PnRevenueCardsProps {
  revenue: RevenueMetrics;
  currency: string;
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function getDelta(today: number, yesterday: number): { text: string; className: string } {
  if (yesterday === 0 && today === 0) return { text: "-- NO CHANGE", className: "pn-text-dim" };
  if (yesterday === 0) return { text: "+NEW TODAY", className: "pn-text-green" };
  const pct = ((today - yesterday) / yesterday) * 100;
  const rounded = Math.round(pct * 10) / 10;
  if (rounded > 0) return { text: `+${rounded}% vs YESTERDAY`, className: "pn-text-green" };
  if (rounded < 0) return { text: `${rounded}% vs YESTERDAY`, className: "pn-text-red" };
  return { text: "0% vs YESTERDAY", className: "pn-text-dim" };
}

const cards = [
  { file: "REV_ATC.LOG", label: "ADD TO CART", key: "addToCartValue" as const },
  { file: "REV_CHK.LOG", label: "CHECKOUT", key: "checkoutValue" as const },
  { file: "REV_PUR.LOG", label: "PURCHASES", key: "purchaseValue" as const },
];

export function PnRevenueCards({ revenue, currency }: PnRevenueCardsProps) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
      {cards.map(({ file, label, key }) => {
        const data = revenue[key];
        const delta = getDelta(data.today, data.yesterday);

        return (
          <div key={key} className="pn-dash-card">
            <div className="pn-dash-card-header">
              <span>{file}</span>
              <span>{label}</span>
            </div>
            <div className="pn-dash-card-body">
              <div className="pn-scan-line" />
              <div
                style={{
                  fontFamily: "var(--pn-font-display), 'Chakra Petch', sans-serif",
                  fontSize: "2rem",
                  color: "var(--pn-accent)",
                  lineHeight: 1,
                }}
              >
                {formatCurrency(data.today, currency)}
              </div>
              <div style={{ fontSize: "0.65rem", color: "var(--pn-text-dim)", marginTop: 4 }}>
                {currency}
              </div>
              <div className="pn-scan-line" />
              <div style={{ fontSize: "0.7rem" }} className={delta.className}>
                {delta.text}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
