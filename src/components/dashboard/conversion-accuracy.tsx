"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { ConversionAccuracy } from "@/types/app";

interface ConversionAccuracyProps {
  conversionAccuracy: ConversionAccuracy;
}

type TimeRange = "7d" | "30d";

function getAccuracyColor(accuracy: number, total: number): string {
  if (total === 0) return "text-muted-foreground";
  if (accuracy >= 95) return "text-green-400";
  if (accuracy >= 80) return "text-amber-400";
  return "text-red-400";
}

function getAccuracyBarColor(accuracy: number, total: number): string {
  if (total === 0) return "bg-muted";
  if (accuracy >= 95) return "bg-green-500";
  if (accuracy >= 80) return "bg-amber-500";
  return "bg-red-500";
}

export function ConversionAccuracy({ conversionAccuracy }: ConversionAccuracyProps) {
  const [range, setRange] = useState<TimeRange>("7d");

  const data = range === "7d" ? conversionAccuracy.last7d : conversionAccuracy.last30d;
  const accuracyColor = getAccuracyColor(data.accuracy, data.total);
  const barColor = getAccuracyBarColor(data.accuracy, data.total);
  const hasData = data.total > 0;

  return (
    <Card className="transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10]">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-medium text-muted-foreground">Conversion Accuracy</p>
          <div className="flex items-center gap-1 bg-secondary rounded-md p-0.5">
            <button
              onClick={() => setRange("7d")}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                range === "7d"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              7 days
            </button>
            <button
              onClick={() => setRange("30d")}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                range === "30d"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              30 days
            </button>
          </div>
        </div>

        {!hasData ? (
          <div className="py-4">
            <p className="text-2xl font-bold text-muted-foreground tabular-nums">--</p>
            <p className="text-sm text-muted-foreground mt-1">No purchase events yet</p>
            <p className="text-xs text-muted-foreground/60 mt-3 border-t border-border pt-3">
              Browser-only pixels miss 20-40% of conversions
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-end gap-3 mb-1">
              <p className={`text-3xl font-bold tabular-nums ${accuracyColor}`}>
                {data.accuracy.toFixed(1)}%
              </p>
              <p className="text-sm text-muted-foreground mb-1">
                of purchases delivered to Meta
              </p>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 bg-secondary rounded-full mt-3 mb-3">
              <div
                className={`h-1.5 rounded-full transition-all duration-500 ${barColor}`}
                style={{ width: `${Math.min(100, data.accuracy)}%` }}
              />
            </div>

            {/* Raw numbers */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>
                <span className="text-foreground font-medium tabular-nums">{data.sent}</span>
                {" of "}
                <span className="tabular-nums">{data.total}</span>
                {" purchases delivered"}
              </span>
              {data.failed > 0 && (
                <>
                  <span className="text-border">|</span>
                  <span className="text-red-400 tabular-nums">
                    {data.failed} failed
                  </span>
                </>
              )}
            </div>

            {/* Comparison line */}
            <p className="text-xs text-muted-foreground/60 mt-3 border-t border-border pt-3">
              Browser-only pixels miss 20-40% of conversions
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
