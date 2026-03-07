"use client";

import { useEffect, useState } from "react";

const EVENTS = [
  { name: "Purchase", id: "a1b2c3d4", value: "$127.50", status: "FORWARDED_7x" },
  { name: "AddToCart", id: "e5f6g7h8", value: "$49.99", status: "FORWARDED_7x" },
  { name: "PageView", id: "i9j0k1l2", value: "--", status: "FORWARDED_7x" },
  { name: "InitiateCheckout", id: "m3n4o5p6", value: "$89.00", status: "FORWARDED_7x" },
  { name: "Purchase", id: "q7r8s9t0", value: "$234.00", status: "FORWARDED_7x" },
  { name: "ViewContent", id: "u1v2w3x4", value: "--", status: "FORWARDED_7x" },
  { name: "AddToCart", id: "y5z6a7b8", value: "$67.50", status: "FORWARDED_7x" },
  { name: "Purchase", id: "c9d0e1f2", value: "$312.99", status: "FORWARDED_7x" },
];

export function AnimatedEventFeed() {
  const [visibleEvents, setVisibleEvents] = useState<number[]>([]);

  useEffect(() => {
    let idx = 0;
    const interval = setInterval(() => {
      setVisibleEvents((prev) => {
        const next = [idx % EVENTS.length, ...prev].slice(0, 5);
        return next;
      });
      idx++;
    }, 2000);
    // Show first event immediately
    setVisibleEvents([0]);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="pn-mock-terminal">
      <div className="pn-mock-terminal-header">
        <span className="pn-mock-dot pn-mock-dot--red" />
        <span className="pn-mock-dot pn-mock-dot--yellow" />
        <span className="pn-mock-dot pn-mock-dot--green" />
        <span className="pn-mock-terminal-title">event_capture.log</span>
      </div>
      <div className="pn-mock-terminal-body">
        {visibleEvents.map((eventIdx, i) => {
          const event = EVENTS[eventIdx];
          return (
            <div
              key={`${eventIdx}-${i}`}
              className="pn-event-row"
              style={{
                animation: i === 0 ? "pn-slide-in 0.4s ease-out" : undefined,
                opacity: 1 - i * 0.15,
              }}
            >
              <div className="pn-event-row-top">
                <span className="pn-event-method">POST</span>
                <span className="pn-event-name">{event.name}</span>
                <span className="pn-event-id">{event.id}...</span>
              </div>
              <div className="pn-event-row-bottom">
                <span className="pn-event-value">{event.value}</span>
                <span className="pn-event-status">{event.status}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
