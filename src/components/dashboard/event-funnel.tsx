"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import type { EventBreakdown } from "@/types/app";

interface EventFunnelProps {
  eventBreakdown: EventBreakdown;
}

const EVENT_LABELS: Record<string, string> = {
  PageView: "PageView",
  ViewContent: "ViewContent",
  AddToCart: "AddToCart",
  InitiateCheckout: "Checkout",
  Purchase: "Purchase",
};

function getPercentChangeText(today: number, yesterday: number): string {
  if (yesterday === 0 && today === 0) return "\u2014";
  if (yesterday === 0) return "+new";
  const change = ((today - yesterday) / yesterday) * 100;
  const rounded = Math.round(change);
  if (rounded > 0) return `+${rounded}%`;
  if (rounded < 0) return `${rounded}%`;
  return "0%";
}

function getPercentChangeColor(today: number, yesterday: number): string {
  if (yesterday === 0 && today === 0) return "text-muted-foreground";
  if (yesterday === 0) return "text-green-400";
  const change = today - yesterday;
  if (change > 0) return "text-green-400";
  if (change < 0) return "text-red-400";
  return "text-muted-foreground";
}

export function EventFunnel({ eventBreakdown }: EventFunnelProps) {
  const t = useTranslations("dashboard");

  const entries = (
    Object.keys(EVENT_LABELS) as Array<keyof EventBreakdown>
  ).map((key) => ({
    name: EVENT_LABELS[key],
    today: eventBreakdown[key].today,
    yesterday: eventBreakdown[key].yesterday,
  }));

  const maxCount = Math.max(...entries.map((e) => e.today), 1);

  const totalToday = entries.reduce((sum, e) => sum + e.today, 0);
  const totalYesterday = entries.reduce((sum, e) => sum + e.yesterday, 0);

  return (
    <Card className="transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10]">
      <CardContent className="p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">
          {t("eventFunnel")}
        </h3>

        <div className="space-y-3">
          {entries.map((entry) => {
            const barWidth =
              maxCount > 0
                ? Math.max((entry.today / maxCount) * 100, entry.today > 0 ? 2 : 0)
                : 0;

            return (
              <div key={entry.name} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground w-24 flex-shrink-0">
                    {entry.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground tabular-nums">
                      {entry.today.toLocaleString()}
                    </span>
                    <span
                      className={`tabular-nums w-12 text-right ${getPercentChangeColor(
                        entry.today,
                        entry.yesterday
                      )}`}
                    >
                      {getPercentChangeText(entry.today, entry.yesterday)}
                    </span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all duration-500"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 pt-3 border-t border-border">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {t("vsYesterday")}{" "}
              <span
                className={getPercentChangeColor(totalToday, totalYesterday)}
              >
                {getPercentChangeText(totalToday, totalYesterday)} {t("overall")}
              </span>
            </span>
            <span className="text-muted-foreground tabular-nums">
              {totalToday.toLocaleString()} {t("total")}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
