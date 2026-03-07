import type { ReactNode } from "react";

export interface FeatureBlockProps {
  refCode: string;
  title: string;
  titleAccent: string;
  description: string;
  bullets: string[];
  visual: ReactNode;
  reverse?: boolean;
}

export function FeatureBlock({
  refCode,
  title,
  titleAccent,
  description,
  bullets,
  visual,
  reverse,
}: FeatureBlockProps) {
  return (
    <section className={`pn-feature-section ${reverse ? "pn-feature-section--reverse" : ""}`}>
      <div className="pn-feature-content">
        <span className="pn-sys-code">* {refCode}</span>
        <h3 className="pn-section-title">
          {title} <span className="pn-accent">{titleAccent}</span>
        </h3>
        <p className="pn-card-desc" style={{ marginTop: 16, maxWidth: 480 }}>
          {description}
        </p>
        <ul className="pn-feature-list">
          {bullets.map((b) => (
            <li key={b}>&gt; {b}</li>
          ))}
        </ul>
      </div>
      <div className="pn-feature-visual">{visual}</div>
    </section>
  );
}
