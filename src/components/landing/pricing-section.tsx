import { PricingTier } from "./pricing-tier";

const tiers = [
  {
    file: "FREE.CFG",
    tier: "FREE",
    name: "Free",
    orders: "50 orders / month",
    features: [
      "Meta + TikTok tracking",
      "Unlimited page views & events",
      "Tracking health dashboard",
      "No credit card needed",
    ],
    cta: "Start Free",
    ctaHref: "/signup",
    monthly: "$0",
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
    highlight: true,
  },
  {
    file: "SCALE.CFG",
    tier: "SCALE",
    name: "Scale",
    orders: "5,000 orders / month",
    features: [
      "Everything in Growth",
      "Shopify webhook sync",
      "Assisted custom setup",
      "Priority support",
    ],
    cta: "Subscribe",
    ctaHref: "/signup",
    monthly: "$99",
  },
];

export function PricingSection() {
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

      <div className="pn-pricing-grid">
        {tiers.map((t) => (
          <PricingTier
            key={t.tier}
            file={t.file}
            tier={t.tier}
            name={t.name}
            price={t.monthly}
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
