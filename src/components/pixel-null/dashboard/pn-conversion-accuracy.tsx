"use client";

import { useState } from "react";
import type { ConversionAccuracy } from "@/types/app";

interface PnConversionAccuracyProps {
  conversionAccuracy: ConversionAccuracy;
}

function getAccuracyColor(accuracy: number, total: number): string {
  if (total === 0) return "pn-text-dim";
  if (accuracy >= 95) return "pn-text-cyan";
  if (accuracy >= 80) return "pn-text-amber";
  return "pn-text-red";
}

export function PnConversionAccuracy({ conversionAccuracy }: PnConversionAccuracyProps) {
  const [range, setRange] = useState<"7d" | "30d">("7d");
  const data = range === "7d" ? conversionAccuracy.last7d : conversionAccuracy.last30d;
  const hasData = data.total > 0;

  return (
    <div className="pn-dash-card">
      <div className="pn-dash-card-header">
        <span>ACCURACY.LOG</span>
        <span>PURCHASE_DELIVERY</span>
      </div>
      <div className="pn-dash-card-body">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span className="pn-text-dim" style={{ fontSize: "0.7rem" }}>CONVERSION_ACCURACY</span>
          <div className="pn-dash-toggle">
            <button
              className={range === "7d" ? "pn-dash-toggle--active" : ""}
              onClick={() => setRange("7d")}
            >
              7D
            </button>
            <button
              className={range === "30d" ? "pn-dash-toggle--active" : ""}
              onClick={() => setRange("30d")}
            >
              30D
            </button>
          </div>
        </div>

        {!hasData ? (
          <div style={{ fontSize: "0.75rem" }}>
            <span
              style={{ fontFamily: "var(--pn-font-display), sans-serif", fontSize: "2rem" }}
              className="pn-text-dim"
            >
              --
            </span>
            <div className="pn-text-dim" style={{ marginTop: 8 }}>
              {"// NO PURCHASE EVENTS IN PERIOD"}
            </div>
          </div>
        ) : (
          <div>
            <span
              className={getAccuracyColor(data.accuracy, data.total)}
              style={{ fontFamily: "var(--pn-font-display), sans-serif", fontSize: "2.5rem", lineHeight: 1 }}
            >
              {data.accuracy.toFixed(1)}%
            </span>

            <div className="pn-dash-progress" style={{ margin: "12px 0" }}>
              <div
                className="pn-dash-progress-fill"
                style={{ width: `${Math.min(100, data.accuracy)}%` }}
              />
            </div>

            <div style={{ fontSize: "0.7rem" }}>
              <span className="pn-text-dim">DELIVERED:</span>{" "}
              <span className="pn-text-cyan">{data.sent}</span>{" "}
              <span className="pn-text-dim">of</span>{" "}
              <span>{data.total}</span>{" "}
              <span className="pn-text-dim">PURCHASES</span>
              {data.failed > 0 && (
                <span className="pn-text-red" style={{ marginLeft: 12 }}>
                  FAILED: {data.failed}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
