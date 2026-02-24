"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import {
  ShoppingBag,
  CreditCard,
  DollarSign,
  ArrowUp,
  ArrowDown,
  Minus,
} from "lucide-react";
import type { RevenueMetrics, TimeComparison } from "@/types/app";

interface RevenueCardsProps {
  revenue: RevenueMetrics;
  webhookBreakdown?: { gateway: string; value: number }[];
  currency?: string;
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function getPercentChange(today: number, yesterday: number) {
  if (yesterday === 0 && today === 0) {
    return { value: 0, type: "neutral" as const };
  }
  if (yesterday === 0) {
    return { value: 100, type: "new" as const };
  }
  const change = ((today - yesterday) / yesterday) * 100;
  const rounded = Math.round(change * 10) / 10;
  if (rounded > 0) return { value: rounded, type: "up" as const };
  if (rounded < 0) return { value: Math.abs(rounded), type: "down" as const };
  return { value: 0, type: "neutral" as const };
}

function DeltaIndicator({ today, yesterday }: { today: number; yesterday: number }) {
  const t = useTranslations("common");
  const change = getPercentChange(today, yesterday);

  if (change.type === "neutral") {
    return (
      <div className="flex items-center gap-1 text-muted-foreground">
        <Minus className="h-3 w-3" />
        <span className="text-xs">{t("noChange")}</span>
      </div>
    );
  }

  if (change.type === "new") {
    return (
      <div className="flex items-center gap-1 text-green-400">
        <ArrowUp className="h-3 w-3" />
        <span className="text-xs">{t("newToday")}</span>
      </div>
    );
  }

  if (change.type === "up") {
    return (
      <div className="flex items-center gap-1 text-green-400">
        <ArrowUp className="h-3 w-3" />
        <span className="text-xs">+{change.value}% {t("vsYesterday")}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 text-red-400">
      <ArrowDown className="h-3 w-3" />
      <span className="text-xs">-{change.value}% {t("vsYesterday")}</span>
    </div>
  );
}

interface RevenueCardProps {
  label: string;
  subtitle?: string;
  icon: React.ReactNode;
  data: TimeComparison;
}

function RevenueCard({ label, subtitle, icon, data }: RevenueCardProps) {
  const t = useTranslations("common");

  return (
    <Card className="transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10]">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            {subtitle && (
              <p className="text-[10px] text-muted-foreground/60">{subtitle}</p>
            )}
          </div>
          <span className="p-1.5 bg-brand-600/10 rounded-md">{icon}</span>
        </div>
        <p className="text-3xl font-bold text-foreground tabular-nums">
          {formatCurrency(data.today, data.currency)}
        </p>
        <p className="text-xs text-muted-foreground mt-1">{t("today")}</p>
        <div className="mt-2">
          <DeltaIndicator today={data.today} yesterday={data.yesterday} />
        </div>
      </CardContent>
    </Card>
  );
}

const GATEWAY_NAMES: Record<string, string> = {
  paypal: "PayPal",
  shopify_payments: "Shopify Payments",
  klarna: "Klarna",
  afterpay: "Afterpay",
  affirm: "Affirm",
  stripe: "Stripe",
  manual: "Manual",
  cash: "Cash",
  gift_card: "Gift Card",
};

function prettyGateway(raw: string): string {
  return GATEWAY_NAMES[raw] ?? raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function RevenueCards({ revenue, webhookBreakdown, currency }: RevenueCardsProps) {
  const t = useTranslations("dashboard");

  // Build dynamic subtitle from webhook breakdown
  let purchaseSubtitle: string | undefined;
  if (webhookBreakdown && webhookBreakdown.length > 0) {
    const cur = currency || revenue.purchaseValue.currency;
    const top = webhookBreakdown.slice(0, 2);
    const parts = top.map(
      (g) => `${formatCurrency(g.value, cur)} ${prettyGateway(g.gateway)}`
    );
    purchaseSubtitle = t("revenueWebhookHint", { breakdown: parts.join(", ") });
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <RevenueCard
        label={t("addedToCart")}
        icon={<ShoppingBag className="h-4 w-4 text-brand-500" />}
        data={revenue.addToCartValue}
      />
      <RevenueCard
        label={t("checkoutValue")}
        icon={<CreditCard className="h-4 w-4 text-brand-500" />}
        data={revenue.checkoutValue}
      />
      <RevenueCard
        label={t("revenueTracked")}
        subtitle={purchaseSubtitle}
        icon={<DollarSign className="h-4 w-4 text-brand-500" />}
        data={revenue.purchaseValue}
      />
    </div>
  );
}
