"use client";

import { useState } from "react";
import type { CampaignRow } from "@/types/app";

interface PnCampaignPerformanceProps {
  campaigns: CampaignRow[];
  currency: string;
}

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `$${value.toFixed(0)}`;
  }
}

function getUniqueSources(campaigns: CampaignRow[]): string[] {
  const sources = new Set<string>();
  for (const c of campaigns) {
    if (c.utmSource) sources.add(c.utmSource);
  }
  return Array.from(sources);
}

export function PnCampaignPerformance({ campaigns, currency }: PnCampaignPerformanceProps) {
  const [activeTab, setActiveTab] = useState("all");
  const sources = getUniqueSources(campaigns);

  const filtered = activeTab === "all"
    ? campaigns
    : campaigns.filter((c) => c.utmSource === activeTab);

  const maxRevenue = filtered.length > 0 ? Math.max(...filtered.map((c) => c.revenue)) : 0;

  return (
    <div className="pn-dash-card">
      <div className="pn-dash-card-header">
        <span>CAMPAIGNS.LOG</span>
        <span>30D_PERFORMANCE</span>
      </div>
      <div className="pn-dash-card-body">
        {campaigns.length === 0 ? (
          <div style={{ fontSize: "0.75rem" }} className="pn-text-dim">
            {"// NO CAMPAIGN DATA -- ADD UTM PARAMS TO YOUR ADS"}
          </div>
        ) : (
          <>
            <div className="pn-dash-filter" style={{ marginBottom: 16 }}>
              <button
                className={activeTab === "all" ? "pn-dash-filter--active" : ""}
                onClick={() => setActiveTab("all")}
              >
                ALL
              </button>
              {sources.map((source) => (
                <button
                  key={source}
                  className={activeTab === source ? "pn-dash-filter--active" : ""}
                  onClick={() => setActiveTab(source)}
                >
                  {source.toUpperCase()}
                </button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div style={{ fontSize: "0.75rem" }} className="pn-text-dim">
                {"// NO CAMPAIGNS FOR THIS SOURCE"}
              </div>
            ) : (
              <table className="pn-dash-table">
                <thead>
                  <tr>
                    {activeTab === "all" && <th>SOURCE</th>}
                    <th>CAMPAIGN</th>
                    <th className="text-right">EVENTS</th>
                    <th className="text-right">REVENUE</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c, i) => {
                    const barPct = maxRevenue > 0 ? (c.revenue / maxRevenue) * 100 : 0;
                    return (
                      <tr key={`${c.utmSource}-${c.utmCampaign}-${i}`}>
                        {activeTab === "all" && (
                          <td style={{ textTransform: "uppercase" }}>{c.utmSource}</td>
                        )}
                        <td
                          style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          title={c.utmCampaign}
                        >
                          {c.utmCampaign || "--"}
                        </td>
                        <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                          {c.events.toLocaleString()}
                        </td>
                        <td className="text-right" style={{ position: "relative" }}>
                          <div
                            style={{
                              position: "absolute",
                              inset: "2px 0",
                              right: 0,
                              width: `${barPct}%`,
                              background: "rgba(6, 182, 212, 0.08)",
                              marginLeft: "auto",
                            }}
                          />
                          <span style={{ position: "relative", fontVariantNumeric: "tabular-nums" }}>
                            {formatCurrency(c.revenue, currency)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
