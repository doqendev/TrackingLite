"use client";

import { useEffect, useRef, useState } from "react";

interface CountUpStatProps {
  value: string;
  label: string;
}

export function CountUpStat({ value, label }: CountUpStatProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [displayValue, setDisplayValue] = useState(value);
  const [triggered, setTriggered] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !triggered) {
          setTriggered(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [triggered]);

  useEffect(() => {
    if (!triggered) return;

    // Extract numeric part
    const match = value.match(/^([^0-9]*)(\d[\d.,]*)(.*)$/);
    if (!match) {
      setDisplayValue(value);
      return;
    }

    const prefix = match[1];
    const numStr = match[2].replace(/,/g, "");
    const suffix = match[3];
    const target = parseFloat(numStr);

    if (isNaN(target)) {
      setDisplayValue(value);
      return;
    }

    const isDecimal = numStr.includes(".");
    const duration = 1500;
    const steps = 60;
    const stepTime = duration / steps;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      const progress = step / steps;
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = target * eased;

      if (step >= steps) {
        setDisplayValue(value);
        clearInterval(timer);
      } else {
        const formatted = isDecimal ? current.toFixed(1) : Math.floor(current).toString();
        setDisplayValue(`${prefix}${formatted}${suffix}`);
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [triggered, value]);

  return (
    <div ref={ref} className="pn-stat-box">
      <div className="pn-stat-val">{displayValue}</div>
      <div className="pn-stat-label">{label}</div>
    </div>
  );
}
