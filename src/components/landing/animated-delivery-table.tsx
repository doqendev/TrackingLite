"use client";

import { useEffect, useState } from "react";

const PLATFORMS = [
  { name: "META", color: "#3b82f6", delay: 0 },
  { name: "TIKTOK", color: "#ec4899", delay: 200 },
  { name: "GA4", color: "#f59e0b", delay: 400 },
  { name: "KLAVIYO", color: "#22c55e", delay: 600 },
  { name: "REDDIT", color: "#f97316", delay: 800 },
  { name: "PINTEREST", color: "#ef4444", delay: 1000 },
  { name: "GOOGLE ADS", color: "#eab308", delay: 1200 },
];

export function AnimatedDeliveryTable() {
  const [sentPlatforms, setSentPlatforms] = useState<Set<string>>(new Set());
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    // Reset and replay every 8 seconds
    const resetInterval = setInterval(() => {
      setSentPlatforms(new Set());
      setCycle((c) => c + 1);
    }, 8000);

    return () => clearInterval(resetInterval);
  }, []);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    PLATFORMS.forEach((p) => {
      const t = setTimeout(() => {
        setSentPlatforms((prev) => {
          const next = new Set(Array.from(prev));
          next.add(p.name);
          return next;
        });
      }, p.delay + 300);
      timers.push(t);
    });
    return () => timers.forEach(clearTimeout);
  }, [cycle]);

  const allSent = sentPlatforms.size === PLATFORMS.length;

  return (
    <div className="pn-mock-terminal">
      <div className="pn-mock-terminal-header">
        <span className="pn-mock-dot pn-mock-dot--red" />
        <span className="pn-mock-dot pn-mock-dot--yellow" />
        <span className="pn-mock-dot pn-mock-dot--green" />
        <span className="pn-mock-terminal-title">fan_out.log</span>
      </div>
      <div className="pn-mock-terminal-body">
        <div className="pn-delivery-header">
          INGEST &gt; eventId: a1b2c3d4
        </div>
        {PLATFORMS.map((p) => {
          const isSent = sentPlatforms.has(p.name);
          return (
            <div key={p.name} className="pn-delivery-row">
              <span className="pn-delivery-platform">
                <span
                  className="pn-delivery-dot"
                  style={{
                    background: isSent ? p.color : "#333",
                    boxShadow: isSent ? `0 0 8px ${p.color}` : "none",
                  }}
                />
                {p.name}
              </span>
              <span className="pn-delivery-dots">
                {"..........".slice(0, 12 - p.name.length)}
              </span>
              <span
                className="pn-delivery-status"
                style={{ color: isSent ? p.color : "#333" }}
              >
                {isSent ? "SENT" : "----"}
              </span>
            </div>
          );
        })}
        <div className="pn-delivery-summary" style={{ opacity: allSent ? 1 : 0.3 }}>
          &gt; {allSent ? "7/7 DELIVERED" : "SENDING..."}
        </div>
      </div>
    </div>
  );
}
