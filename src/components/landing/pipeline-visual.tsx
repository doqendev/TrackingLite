"use client";

import { useEffect, useState } from "react";

const destinations = [
  { name: "META", color: "#3b82f6" },
  { name: "TIKTOK", color: "#ec4899" },
  { name: "GA4", color: "#f59e0b" },
  { name: "KLAVIYO", color: "#22c55e" },
  { name: "REDDIT", color: "#f97316" },
  { name: "PINTEREST", color: "#ef4444" },
  { name: "G.ADS", color: "#eab308" },
];

export function PipelineVisual() {
  const [visibleDests, setVisibleDests] = useState(0);
  const [pulsePhase, setPulsePhase] = useState(0);

  useEffect(() => {
    // Stagger destination appearance
    const timer = setInterval(() => {
      setVisibleDests((prev) => {
        if (prev >= destinations.length) {
          clearInterval(timer);
          return prev;
        }
        return prev + 1;
      });
    }, 200);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Flowing pulse animation
    const timer = setInterval(() => {
      setPulsePhase((p) => (p + 1) % 3);
    }, 1200);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="pn-pipeline">
      <div className="pn-pipeline-node pn-pipeline-node--source">
        <span>SHOPIFY STORE</span>
      </div>

      <div className="pn-pipeline-line pn-pipeline-line--vertical">
        <div
          className="pn-pipeline-flow-dot"
          style={{ animation: "pn-flow-down 1.2s ease-in-out infinite" }}
        />
      </div>

      <div
        className="pn-pipeline-node pn-pipeline-node--server"
        style={{
          boxShadow: pulsePhase === 1
            ? "0 0 30px rgba(6,182,212,0.3), inset 0 0 15px rgba(6,182,212,0.1)"
            : "0 0 20px rgba(6,182,212,0.15)",
          transition: "box-shadow 0.6s ease",
        }}
      >
        <span>api.trackclear.io</span>
      </div>

      <div className="pn-pipeline-line pn-pipeline-line--vertical">
        <div
          className="pn-pipeline-flow-dot"
          style={{ animation: "pn-flow-down 1.2s ease-in-out infinite 0.3s" }}
        />
      </div>

      <div className="pn-pipeline-fanout">
        {destinations.map((dest, i) => (
          <div
            key={dest.name}
            className="pn-pipeline-dest"
            style={{
              opacity: i < visibleDests ? 1 : 0,
              transform: i < visibleDests ? "translateY(0)" : "translateY(8px)",
              transition: "opacity 0.3s ease, transform 0.3s ease",
            }}
          >
            <div
              className="pn-status-dot"
              style={{
                background: dest.color,
                boxShadow: `0 0 8px ${dest.color}`,
              }}
            />
            <span>{dest.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
