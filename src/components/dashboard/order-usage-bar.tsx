"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart } from "lucide-react";

interface OrderUsageBarProps {
  plan: string;
  ordersUsed: number;
  ordersLimit: number;
  usagePercent: number;
  hasEvents: boolean;
}

function getSubtitleMessage(
  ordersUsed: number,
  usagePercent: number,
  plan: string,
  hasEvents: boolean
): string {
  if (ordersUsed === 0) {
    if (!hasEvents) {
      return "Install your snippet to start tracking purchases.";
    }
    return "No purchases tracked yet this month. Other events are flowing.";
  }
  if (usagePercent >= 90) {
    if (plan === "FREE") {
      return "You\u2019re near the free plan limit. Upgrade to keep tracking.";
    }
    if (plan === "SCALE") {
      return "Approaching the Scale limit. Contact us for enterprise.";
    }
    return "Nearing your limit. We\u2019ll auto-upgrade to keep tracking.";
  }
  if (usagePercent >= 70) {
    return "Tracking strong! Consider upgrading for more capacity.";
  }
  return `Your tracking is working! ${ordersUsed} purchase${ordersUsed === 1 ? "" : "s"} forwarded to Meta.`;
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
  const subtitle = getSubtitleMessage(ordersUsed, usagePercent, plan, hasEvents);
  const barColor = getBarColor(usagePercent);
  const planLabel = PLAN_LABELS[plan] ?? plan;

  return (
    <Card className="transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10]">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-brand-600/10 rounded-md">
              <ShoppingCart className="h-4 w-4 text-brand-500" />
            </span>
            <p className="text-sm font-medium text-muted-foreground">
              Orders This Month
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
                of {ordersLimit.toLocaleString()} orders tracked
              </span>
            </span>
            <span className="text-muted-foreground tabular-nums">
              {usagePercent}%
            </span>
          </div>

          <div
            className={`h-2 rounded-full bg-secondary overflow-hidden ${
              usagePercent >= 80 ? "shadow-sm shadow-amber-500/20" : ""
            }`}
          >
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
              style={{ width: `${usagePercent}%` }}
            />
          </div>

          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </CardContent>
    </Card>
  );
}
