"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface OrderUsageBarProps {
  plan: string;
  ordersUsed: number;
  ordersLimit: number;
  usagePercent: number;
  hasEvents: boolean;
}

function getBarColor(usagePercent: number): string {
  if (usagePercent >= 90)
    return "bg-gradient-to-r from-red-600 to-red-400";
  if (usagePercent >= 70)
    return "bg-gradient-to-r from-amber-600 to-amber-400";
  return "bg-gradient-to-r from-brand-600 to-brand-400";
}

const PLAN_LABELS: Record<string, string> = {
  FREE: "Free",
  STARTER: "Starter",
  GROWTH: "Growth",
  SCALE: "Scale",
};

export function OrderUsageBar({
  plan,
  ordersUsed,
  ordersLimit,
  usagePercent,
  hasEvents,
}: OrderUsageBarProps) {
  const t = useTranslations("dashboard");
  const barColor = getBarColor(usagePercent);
  const planLabel = PLAN_LABELS[plan] ?? plan;

  function getSubtitleMessage(): string {
    if (ordersUsed === 0) {
      if (!hasEvents) return t("installSnippet");
      return t("noPurchasesYet");
    }
    if (usagePercent >= 90) {
      if (plan === "FREE") return t("nearFreeLimit");
      if (plan === "SCALE") return t("nearScaleLimit");
      return t("nearLimit");
    }
    if (usagePercent >= 70) return t("trackingStrong");
    return t("trackingWorking", { count: ordersUsed });
  }

  const subtitle = getSubtitleMessage();

  return (
    <Card className="transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10]">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              {t("ordersThisMonth")}
            </p>
          </div>
          <Badge className="bg-brand-500/10 text-brand-400">
            {planLabel}
          </Badge>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-foreground">
              <span className="font-semibold tabular-nums">
                {ordersUsed.toLocaleString()}
              </span>{" "}
              <span className="text-muted-foreground">
                {t("ofOrdersTracked", { limit: ordersLimit.toLocaleString() })}
              </span>
            </span>
            <span className="text-muted-foreground tabular-nums">
              {usagePercent}%
            </span>
          </div>

          <div
            className={`h-2 rounded-none bg-secondary overflow-hidden ${
              usagePercent >= 80 ? "shadow-sm shadow-amber-500/20" : ""
            }`}
          >
            <div
              className={`h-full rounded-none transition-all duration-700 ease-out ${barColor}`}
              style={{ width: `${usagePercent}%` }}
            />
          </div>

          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </CardContent>
    </Card>
  );
}
