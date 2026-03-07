import Link from "next/link";

export interface PricingTierProps {
  file: string;
  tier: string;
  name: string;
  price: string;
  orders: string;
  features: string[];
  cta: string;
  ctaHref: string;
  highlight?: boolean;
}

export function PricingTier({
  file,
  tier,
  name,
  price,
  orders,
  features,
  cta,
  ctaHref,
  highlight,
}: PricingTierProps) {
  return (
    <div className={`pn-pricing-card ${highlight ? "pn-pricing-card--highlight" : ""}`}>
      <div className="pn-card-header">
        <div className="pn-card-header-main">
          <span>{file}</span>
          <span>***</span>
        </div>
        <span>[ {tier} ]</span>
      </div>
      <div className="pn-card-body">
        <div>
          <h3 className="pn-card-title">{name}</h3>
          <div className="pn-price">
            {price}
            <span className="pn-dim" style={{ fontSize: "1rem", marginLeft: 4 }}>/mo</span>
          </div>
          <p className="pn-card-desc" style={{ marginTop: 8 }}>{orders}</p>
        </div>
        <div className="pn-scan-line" />
        <ul className="pn-feature-list">
          {features.map((f) => (
            <li key={f}>&gt; {f}</li>
          ))}
        </ul>
        <Link href={ctaHref} className="pn-btn" style={{ marginTop: 16, width: "100%", justifyContent: "center" }}>
          {cta}
        </Link>
      </div>
    </div>
  );
}
