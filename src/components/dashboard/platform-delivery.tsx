"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import type { DestinationDeliveryRow } from "@/types/app";

interface PlatformDeliveryProps {
  destinationDelivery: DestinationDeliveryRow[];
}

const DESTINATION_CONFIG: Record<string, { label: string; dotColor: string }> = {
  META: { label: "Meta", dotColor: "bg-blue-500" },
  TIKTOK: { label: "TikTok", dotColor: "bg-pink-500" },
  GA4: { label: "GA4", dotColor: "bg-amber-500" },
  KLAVIYO: { label: "Klaviyo", dotColor: "bg-green-500" },
  REDDIT: { label: "Reddit", dotColor: "bg-orange-500" },
  PINTEREST: { label: "Pinterest", dotColor: "bg-red-500" },
  GOOGLE_ADS: { label: "Google Ads", dotColor: "bg-yellow-500" },
};

function getSuccessRateColor(rate: number): string {
  if (rate >= 95) return "text-green-400";
  if (rate >= 80) return "text-amber-400";
  return "text-red-400";
}

export function PlatformDelivery({ destinationDelivery }: PlatformDeliveryProps) {
  const t = useTranslations("dashboard");

  if (destinationDelivery.length === 0) {
    return (
      <Card className="transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10]">
        <CardContent className="p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            {t("platformDelivery")}
          </h3>
          <p className="text-sm text-muted-foreground">{t("noDeliveryData")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10]">
      <CardContent className="p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">
          {t("platformDelivery")}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs font-medium text-muted-foreground pb-2">
                  {t("platform")}
                </th>
                <th className="text-right text-xs font-medium text-muted-foreground pb-2">
                  {t("delivered")}
                </th>
                <th className="text-right text-xs font-medium text-muted-foreground pb-2">
                  {t("failedLabel")}
                </th>
                <th className="text-right text-xs font-medium text-muted-foreground pb-2">
                  {t("successRate")}
                </th>
              </tr>
            </thead>
            <tbody>
              {destinationDelivery.map((row) => {
                const config = DESTINATION_CONFIG[row.destination] ?? {
                  label: row.destination,
                  dotColor: "bg-muted-foreground",
                };
                return (
                  <tr key={row.destination} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${config.dotColor}`} />
                        <span className="text-foreground font-medium">{config.label}</span>
                      </div>
                    </td>
                    <td className="text-right tabular-nums text-foreground py-2.5">
                      {row.sent.toLocaleString()}
                    </td>
                    <td className={`text-right tabular-nums py-2.5 ${row.failed > 0 ? "text-red-400" : "text-muted-foreground"}`}>
                      {row.failed.toLocaleString()}
                    </td>
                    <td className={`text-right tabular-nums font-medium py-2.5 ${getSuccessRateColor(row.successRate)}`}>
                      {row.successRate.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
