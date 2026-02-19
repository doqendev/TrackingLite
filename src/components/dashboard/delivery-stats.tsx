"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import type { HealthMetrics, EventBreakdown } from "@/types/app";

interface DeliveryStatsProps {
  health: HealthMetrics;
  eventBreakdown: EventBreakdown;
}

function getSuccessRateColor(rate: number): string {
  if (rate >= 95) return "text-green-400";
  if (rate >= 80) return "text-amber-400";
  return "text-red-400";
}

function getSuccessBarColor(rate: number): string {
  if (rate >= 95) return "bg-green-500";
  if (rate >= 80) return "bg-amber-500";
  return "bg-red-500";
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export function DeliveryStats({ health, eventBreakdown }: DeliveryStatsProps) {
  const t = useTranslations("dashboard");

  const deliveredPercent =
    health.totalEvents24h > 0
      ? Math.round(
          (health.sentEvents24h / health.totalEvents24h) * 100 * 10
        ) / 10
      : 0;

  const failedPercent =
    health.totalEvents24h > 0
      ? Math.round(
          (health.failedEvents24h / health.totalEvents24h) * 100 * 10
        ) / 10
      : 0;

  return (
    <Card className="transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10]">
      <CardContent className="p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">
          {t("deliveryStats")}
        </h3>

        {/* Total events */}
        <div className="mb-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            {t("totalEvents")}
          </p>
          <p className="text-3xl font-bold text-foreground tabular-nums">
            {health.totalEvents24h.toLocaleString()}
          </p>
        </div>

        {/* Success rate */}
        <div className="space-y-2 mb-4">
          <div className="flex items-baseline justify-between">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              {t("successRate")}
            </p>
            <p
              className={`text-2xl font-bold tabular-nums ${getSuccessRateColor(
                health.successRate
              )}`}
            >
              {health.successRate}%
            </p>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${getSuccessBarColor(
                health.successRate
              )}`}
              style={{
                width: `${health.totalEvents24h > 0 ? health.successRate : 0}%`,
              }}
            />
          </div>
        </div>

        {/* Delivered / Failed breakdown */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-muted-foreground">{t("delivered")}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground tabular-nums">
                {health.sentEvents24h.toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums w-14 text-right">
                {deliveredPercent}%
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  health.failedEvents24h > 0 ? "bg-red-500" : "bg-muted-foreground"
                }`}
              />
              <span className="text-muted-foreground">{t("failedLabel")}</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`font-medium tabular-nums ${
                  health.failedEvents24h > 0
                    ? "text-red-400"
                    : "text-foreground"
                }`}
              >
                {health.failedEvents24h.toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums w-14 text-right">
                {failedPercent}%
              </span>
            </div>
          </div>
        </div>

        {/* Last event time */}
        {health.lastEventAt && (
          <div className="mt-4 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              {t("lastEvent")}{" "}
              <span className="text-foreground">
                {formatRelativeTime(health.lastEventAt)}
              </span>
            </p>
          </div>
        )}

        {health.totalEvents24h === 0 && (
          <div className="mt-4 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              {t("noEventsLast24h")}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
