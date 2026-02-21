"use client";

import { useEffect, useRef, useState } from "react";

const REVENUE_CARDS = [
  { label: "AddToCart", value: 1247, delta: "+12.4%" },
  { label: "Checkout", value: 3842, delta: "+5.1%" },
  { label: "Revenue", value: 12580, delta: "+8.2%" },
];

const FUNNEL_ROWS = [
  { label: "AddToCart", count: 847, width: 100, delta: "+8.2%" },
  { label: "Checkout", count: 423, width: 50, delta: "+5.1%" },
  { label: "Purchase", count: 312, width: 37, delta: "+12.4%" },
];

const LIVE_EVENTS = [
  { time: "12:04:32", event: "Purchase", dest: "Meta", status: "SENT" },
  { time: "12:04:28", event: "AddToCart", dest: "TikTok", status: "SENT" },
  { time: "12:04:21", event: "PageView", dest: "GA4", status: "SENT" },
  { time: "12:04:18", event: "Checkout", dest: "Klaviyo", status: "SENT" },
  { time: "12:04:11", event: "Purchase", dest: "Pinterest", status: "SENT" },
  { time: "12:04:05", event: "AddToCart", dest: "Reddit", status: "SENT" },
];

const DEST_COLORS: Record<string, string> = {
  Meta: "bg-blue-500/20 text-blue-400",
  TikTok: "bg-pink-500/20 text-pink-400",
  GA4: "bg-amber-500/20 text-amber-400",
  Klaviyo: "bg-emerald-500/20 text-emerald-400",
  Pinterest: "bg-red-500/20 text-red-400",
  Reddit: "bg-orange-500/20 text-orange-400",
};

function useCountUp(target: number, active: boolean, duration = 2000) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!active) return;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, active, duration]);

  return value;
}

function RevenueCard({
  label,
  target,
  delta,
  active,
  delay,
}: {
  label: string;
  target: number;
  delta: string;
  active: boolean;
  delay: number;
}) {
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(timer);
  }, [active, delay]);

  const value = useCountUp(target, started);

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="mb-1 text-[10px] text-muted-foreground/60">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="tabular-nums text-lg font-bold text-foreground">
          ${value.toLocaleString()}
        </span>
        <span
          className={`text-[10px] font-medium text-emerald-400 transition-opacity duration-300 ${
            started ? "opacity-100" : "opacity-0"
          }`}
          style={{
            animation: started ? "pop-in 0.4s ease-out 1.8s both" : "none",
          }}
        >
          {delta}
        </span>
      </div>
    </div>
  );
}

export function AnimatedDashboard() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="mx-auto max-w-4xl">
      {/* Glow behind the card */}
      <div className="relative">
        <div
          className="pointer-events-none absolute -inset-6 rounded-2xl"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(59,130,246,0.10) 0%, transparent 70%)",
          }}
        />

        <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02] shadow-2xl shadow-brand-500/[0.03] backdrop-blur-sm">
          {/* Mock header bar */}
          <div className="flex items-center gap-1 border-b border-white/[0.06] px-4 py-2.5">
            <div className="flex items-center gap-1.5 mr-4">
              <div className="h-2.5 w-2.5 rounded-full bg-white/[0.10]" />
              <div className="h-2.5 w-2.5 rounded-full bg-white/[0.10]" />
              <div className="h-2.5 w-2.5 rounded-full bg-white/[0.10]" />
            </div>
            {["Dashboard", "Events", "Settings"].map((tab, i) => (
              <span
                key={tab}
                className={`rounded-md px-3 py-1 text-[11px] font-medium ${
                  i === 0
                    ? "bg-white/[0.06] text-foreground"
                    : "text-muted-foreground/50"
                }`}
              >
                {tab}
              </span>
            ))}
          </div>

          <div className="flex">
            {/* Mock sidebar */}
            <div className="hidden w-10 shrink-0 border-r border-white/[0.06] sm:flex sm:flex-col sm:items-center sm:gap-3 sm:py-4">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`h-2 w-2 rounded-full ${
                    i === 0 ? "bg-brand-500/60" : "bg-white/[0.08]"
                  }`}
                />
              ))}
            </div>

            {/* Main content */}
            <div className="flex-1 space-y-4 p-4 sm:p-5">
              {/* Row 1: Revenue Cards */}
              <div className="grid grid-cols-3 gap-3">
                {REVENUE_CARDS.map((card, i) => (
                  <RevenueCard
                    key={card.label}
                    label={card.label}
                    target={card.value}
                    delta={card.delta}
                    active={isVisible}
                    delay={i * 200}
                  />
                ))}
              </div>

              {/* Row 2: Event Funnel */}
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="mb-2.5 text-[10px] font-medium text-muted-foreground/60">
                  Event Funnel
                </div>
                <div className="space-y-2">
                  {FUNNEL_ROWS.map((row, i) => (
                    <div key={row.label} className="flex items-center gap-3">
                      <span className="w-16 shrink-0 text-[11px] text-muted-foreground/70">
                        {row.label}
                      </span>
                      <div className="relative h-5 flex-1 overflow-hidden rounded bg-white/[0.04]">
                        <div
                          className="h-full rounded bg-brand-500/40"
                          style={
                            {
                              "--bar-width": `${row.width}%`,
                              width: isVisible ? `${row.width}%` : "0%",
                              transition: isVisible
                                ? `width 1.5s ease-out ${0.3 + i * 0.2}s`
                                : "none",
                            } as React.CSSProperties
                          }
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right tabular-nums text-[11px] text-foreground/70">
                        {isVisible ? row.count : 0}
                      </span>
                      <span
                        className="w-10 shrink-0 text-right text-[10px] font-medium text-emerald-400"
                        style={{
                          opacity: 0,
                          animation: isVisible
                            ? `pop-in 0.4s ease-out ${1.5 + i * 0.2}s forwards`
                            : "none",
                        }}
                      >
                        {row.delta}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Row 3: Live Events Feed */}
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="mb-2.5 text-[10px] font-medium text-muted-foreground/60">
                  Live Events
                </div>
                <div className="space-y-1">
                  {LIVE_EVENTS.map((ev, i) => (
                    <div
                      key={`${ev.time}-${ev.dest}`}
                      className="flex items-center gap-2 rounded px-2 py-1 text-[11px]"
                      style={{
                        opacity: 0,
                        animation: isVisible
                          ? `slide-up-row 0.5s ease-out ${0.8 + i * 0.4}s forwards`
                          : "none",
                      }}
                    >
                      <span className="w-14 shrink-0 tabular-nums text-muted-foreground/40">
                        {ev.time}
                      </span>
                      <span className="w-20 shrink-0 font-medium text-foreground/80">
                        {ev.event}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          DEST_COLORS[ev.dest] || ""
                        }`}
                      >
                        {ev.dest}
                      </span>
                      <span className="ml-auto rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                        {ev.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
