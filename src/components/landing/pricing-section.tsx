"use client";

import { useState } from "react";
import { PricingTier } from "./pricing-tier";

const tiers = [
  {
    file: "FREE.CFG",
    tier: "FREE",
    name: "Free",
    orders: "50 orders / month",
    features: [
      "All 7 ad platforms",
      "Unlimited page views & events",
      "Real-time dashboard",
      "No credit card needed",
    ],
    cta: "Start Free",
    ctaHref: "/signup",
    monthly: "$0",
    yearly: "$0",
  },
  {
    file: "STARTER.CFG",
    tier: "STARTER",
    name: "Starter",
    orders: "500 orders / month",
    features: [
      "Everything in Free",
      "Email alerts when issues occur",
      "Replay missed events",
      "Faster processing",
    ],
    cta: "Subscribe",
    ctaHref: "/signup",
    monthly: "$29",
    yearly: "$24",
  },
  {
    file: "GROWTH.CFG",
    tier: "GROWTH",
    name: "Growth",
    orders: "1,000 orders / month",
    features: [
      "Everything in Starter",
      "Campaign performance reports",
      "Multi-currency revenue tracking",
      "Auto-upgrade if you grow",
    ],
    cta: "Subscribe",
    ctaHref: "/signup",
    monthly: "$49",
    yearly: "$40",
    highlight: true,
  },
  {
    file: "SCALE.CFG",
    tier: "SCALE",
    name: "Scale",
    orders: "5,000 orders / month",
    features: [
      "Everything in Growth",
      "Unlimited stores",
      "Shopify webhook sync",
      "Priority support",
    ],
    cta: "Subscribe",
    ctaHref: "/signup",
    monthly: "$99",
    yearly: "$82",
  },
];

export function PricingSection() {
  const [cycle, setCycle] = useState<"monthly" | "yearly">("yearly");

  return (
    <>
      <div className="pn-section-header" id="pricing">
        <div>
          <span className="pn-ref-label">
            * PLANS {"// "}SIMPLE_PRICING
          </span>
          <h2 className="pn-section-title">Simple Pricing</h2>
        </div>
        <div className="pn-dim" style={{ fontSize: 12, textAlign: "right" }}>
          BILLING: PER_ORDER
          <br />
          PLANS: 04
        </div>
      </div>

      <div style={{ padding: "16px 48px", borderBottom: "1px solid #333333", display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <button
          onClick={() => setCycle("monthly")}
          className={cycle === "monthly" ? "pn-accent" : "pn-dim"}
          style={{
            background: "none",
            border: "none",
            fontFamily: "var(--font-mono), 'Space Mono', monospace",
            fontSize: "0.75rem",
            letterSpacing: 1,
            textTransform: "uppercase" as const,
          }}
        >
          Monthly
        </button>
        <button
          onClick={() => setCycle(cycle === "monthly" ? "yearly" : "monthly")}
          style={{
            position: "relative",
            width: 48,
            height: 24,
            background: cycle === "yearly" ? "rgba(6,182,212,0.2)" : "rgba(255,255,255,0.1)",
            border: `1px solid ${cycle === "yearly" ? "#06b6d4" : "#333"}`,
          }}
        >
          <div style={{
            position: "absolute",
            top: 3,
            width: 16,
            height: 16,
            background: "#06b6d4",
            transition: "left 0.2s",
            left: cycle === "yearly" ? 27 : 3,
          }} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setCycle("yearly")}
            className={cycle === "yearly" ? "pn-accent" : "pn-dim"}
            style={{
              background: "none",
              border: "none",
              fontFamily: "var(--font-mono), 'Space Mono', monospace",
              fontSize: "0.75rem",
              letterSpacing: 1,
              textTransform: "uppercase" as const,
            }}
          >
            Yearly
          </button>
          {cycle === "yearly" && (
            <span style={{
              border: "1px solid #06b6d4",
              color: "#06b6d4",
              padding: "2px 8px",
              fontSize: "0.6rem",
              fontFamily: "var(--font-mono), 'Space Mono', monospace",
              letterSpacing: 1,
            }}>
              2 MONTHS FREE
            </span>
          )}
        </div>
      </div>

      <div className="pn-pricing-grid">
        {tiers.map((t) => (
          <PricingTier
            key={t.tier}
            file={t.file}
            tier={t.tier}
            name={t.name}
            price={cycle === "yearly" ? t.yearly : t.monthly}
            orders={t.orders}
            features={t.features}
            cta={t.cta}
            ctaHref={t.ctaHref}
            highlight={t.highlight}
          />
        ))}
      </div>
    </>
  );
}
