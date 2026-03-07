"use client";

import { useEffect, useState } from "react";

function useCountUp(target: number, duration: number = 2000) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let start = 0;
    const increment = target / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setValue(target);
        clearInterval(timer);
      } else {
        setValue(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return value;
}

const FUNNEL = [
  { name: "AddToCart", count: 847, width: 65 },
  { name: "Checkout", count: 412, width: 45 },
  { name: "Purchase", count: 298, width: 35 },
];

const CAMPAIGNS = [
  { source: "facebook", name: "summer_sale_2026", events: 1247, revenue: 18420 },
  { source: "google", name: "brand_search_q1", events: 893, revenue: 12890 },
  { source: "tiktok", name: "viral_product_v2", events: 456, revenue: 8750 },
];

const SOURCE_COLORS: Record<string, string> = {
  facebook: "#3b82f6",
  google: "#f59e0b",
  tiktok: "#ec4899",
};

export function AnimatedDashboardPreview() {
  const revenue = useCountUp(48291);
  const deliveryRate = useCountUp(997, 1500);
  const events24h = useCountUp(12847, 1800);
  const [barsVisible, setBarsVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBarsVisible(true), 500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="pn-dashboard-preview">
      {/* Revenue cards row */}
      <div className="pn-preview-cards">
        <div className="pn-preview-card">
          <div className="pn-preview-card-label">EVENTS 24H</div>
          <div className="pn-preview-card-value">{events24h.toLocaleString()}</div>
          <div className="pn-preview-card-delta pn-preview-card-delta--up">+12%</div>
        </div>
        <div className="pn-preview-card">
          <div className="pn-preview-card-label">DELIVERY</div>
          <div className="pn-preview-card-value">{(deliveryRate / 10).toFixed(1)}%</div>
          <div className="pn-preview-card-delta pn-preview-card-delta--up">+0.2%</div>
        </div>
        <div className="pn-preview-card pn-preview-card--accent">
          <div className="pn-preview-card-label">REVENUE 30D</div>
          <div className="pn-preview-card-value">${revenue.toLocaleString()}</div>
          <div className="pn-preview-card-delta pn-preview-card-delta--up">+23%</div>
        </div>
      </div>

      {/* Funnel */}
      <div className="pn-preview-section">
        <div className="pn-preview-section-title">CONVERSION FUNNEL</div>
        {FUNNEL.map((item) => (
          <div key={item.name} className="pn-preview-funnel-row">
            <span className="pn-preview-funnel-label">{item.name}</span>
            <div className="pn-preview-funnel-bar-track">
              <div
                className="pn-preview-funnel-bar"
                style={{
                  width: barsVisible ? `${item.width}%` : "0%",
                  transition: "width 1s ease-out",
                }}
              />
            </div>
            <span className="pn-preview-funnel-count">{item.count}</span>
          </div>
        ))}
      </div>

      {/* Campaigns mini-table */}
      <div className="pn-preview-section">
        <div className="pn-preview-section-title">TOP CAMPAIGNS</div>
        {CAMPAIGNS.map((c) => (
          <div key={c.name} className="pn-preview-campaign-row">
            <span
              className="pn-preview-campaign-dot"
              style={{ background: SOURCE_COLORS[c.source] }}
            />
            <span className="pn-preview-campaign-name">{c.name}</span>
            <span className="pn-preview-campaign-revenue">
              ${(c.revenue / 1000).toFixed(1)}k
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
