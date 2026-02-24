"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import type { EventBreakdown } from "@/types/app";

interface EventFunnelProps {
  eventBreakdown: EventBreakdown;
}

const EVENT_KEYS: Array<{ key: string; i18nKey: string; showOffSite?: boolean }> = [
  { key: "AddToCart", i18nKey: "addToCart" },
  { key: "InitiateCheckout", i18nKey: "checkout" },
  { key: "Purchase", i18nKey: "purchase", showOffSite: true },
];

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

  const entries = EVENT_KEYS.map(({ key, i18nKey, showOffSite }) => ({
    name: t(i18nKey),
    showOffSite: !!showOffSite,
    today: eventBreakdown[key as keyof EventBreakdown].today,
    yesterday: eventBreakdown[key as keyof EventBreakdown].yesterday,
  }));

  const maxCount = Math.max(...entries.map((e) => e.today), 1);

  const totalToday = entries.reduce((sum, e) => sum + e.today, 0);
  const totalYesterday = entries.reduce((sum, e) => sum + e.yesterday, 0);

  return (
    <Card className="transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10]">
      <CardContent className="p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">
          {t("conversionFunnel")}
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
                    {entry.showOffSite && (
                      <span className="text-[10px] text-muted-foreground/60 ml-1">
                        ({t("inclOffSite")})
                      </span>
                    )}
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
