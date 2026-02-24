import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { PlanCards } from "@/components/billing/plan-cards";
import { BILLING_PLANS } from "@/lib/constants";
import { getOrderCount } from "@/lib/billing";
import { BillingPlan, SubscriptionStatus } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AlertTriangle, CheckCircle, Package } from "lucide-react";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

const PLAN_LABELS: Record<BillingPlan, string> = {
  FREE: BILLING_PLANS.FREE.name,
  STARTER: BILLING_PLANS.STARTER.name,
  GROWTH: BILLING_PLANS.GROWTH.name,
  SCALE: BILLING_PLANS.SCALE.name,
};

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: { success?: string; canceled?: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const justSubscribed = searchParams.success === "true";
  const checkoutCanceled = searchParams.canceled === "true";

  const t = await getTranslations("billing");

  const STATUS_LABELS: Record<SubscriptionStatus, { label: string; className: string }> = {
    TRIALING: { label: t("free"), className: "bg-brand-500/10 text-brand-400" },
    ACTIVE: { label: t("active"), className: "bg-green-500/10 text-green-400" },
    PAST_DUE: { label: t("pastDue"), className: "bg-red-500/10 text-red-400" },
    CANCELED: { label: t("canceled"), className: "bg-muted text-muted-foreground" },
    UNPAID: { label: t("unpaid"), className: "bg-red-500/10 text-red-400" },
  };

  const faqs = [
    { q: t("faqWhatCounts"), a: t("faqWhatCountsAnswer") },
    { q: t("faqExceedLimit"), a: t("faqExceedLimitAnswer") },
    { q: t("faqChangePlans"), a: t("faqChangePlansAnswer") },
    { q: t("faqRefunds"), a: t("faqRefundsAnswer") },
  ];

  const subscription = await db.subscription.findUnique({
    where: { userId: session.user.id },
    select: {
      plan: true,
      status: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
    },
  });

  const plan = subscription?.plan ?? "FREE";
  const status = subscription?.status ?? "ACTIVE";
  const statusConfig = STATUS_LABELS[status];
  const planConfig = BILLING_PLANS[plan as keyof typeof BILLING_PLANS];
  const orderCount = await getOrderCount(session.user.id);
  const orderLimit = planConfig?.ordersPerMonth ?? 50;
  const usagePercent = Math.min(100, Math.round((orderCount / orderLimit) * 100));

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t("subtitle")}</p>
      </div>

      {/* Subscription success/canceled alerts */}
      {justSubscribed && (
        <Alert className="border-green-500/50 bg-green-500/10">
          <CheckCircle className="h-4 w-4 text-green-400" />
          <AlertDescription className="text-green-300">
            {t("subscriptionSuccess")}
          </AlertDescription>
        </Alert>
      )}
      {checkoutCanceled && (
        <Alert className="border-yellow-500/50 bg-yellow-500/10">
          <AlertTriangle className="h-4 w-4 text-yellow-400" />
          <AlertDescription className="text-yellow-300">
            {t("checkoutCanceled")}
          </AlertDescription>
        </Alert>
      )}

      {/* Current plan summary card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-foreground">{PLAN_LABELS[plan]}</h2>
                <Badge className={statusConfig.className}>
                  {statusConfig.label}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("ordersPerMonth", { count: planConfig.ordersPerMonth.toLocaleString() })} &middot;{" "}
                {t("dayRetention", { days: planConfig.eventLogRetentionDays })}
              </p>
              {plan !== "FREE" && planConfig.priceMonthly > 0 && (
                <p className="text-sm text-muted-foreground">
                  {t("perMonth", { price: planConfig.priceMonthly })}
                </p>
              )}
            </div>

            <div className="text-right space-y-0.5">
              {subscription?.currentPeriodEnd && status === "ACTIVE" && plan !== "FREE" && (
                <>
                  <p className="text-xs text-muted-foreground">
                    {subscription.cancelAtPeriodEnd ? t("cancelsOn") : t("renewsOn")}
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    {formatDate(subscription.currentPeriodEnd)}
                  </p>
                </>
              )}
              {subscription?.currentPeriodEnd && status === "PAST_DUE" && (
                <>
                  <p className="text-xs text-red-400 font-medium">{t("paymentFailed")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("due", { date: formatDate(subscription.currentPeriodEnd) })}
                  </p>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Order usage card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <Package className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">{t("monthlyOrderUsage")}</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {t("ordersUsed", { used: orderCount.toLocaleString(), limit: orderLimit.toLocaleString() })}
              </span>
              <span className="text-muted-foreground">{usagePercent}%</span>
            </div>
            <div className={`h-2 rounded-full bg-secondary overflow-hidden ${usagePercent >= 80 ? 'shadow-sm shadow-amber-500/20' : ''}`}>
              <div
                className={`h-full rounded-full transition-all ${
                  usagePercent >= 90 ? "bg-gradient-to-r from-red-600 to-red-400" : usagePercent >= 70 ? "bg-gradient-to-r from-amber-600 to-amber-400" : "bg-gradient-to-r from-brand-600 to-brand-400"
                }`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("purchaseEventsNote")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Usage warning */}
      {usagePercent >= 90 && plan === "FREE" && (
        <Alert className="border-amber-500/20 bg-amber-500/10">
          <AlertDescription>
            <div className="flex items-start gap-4">
              <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-400">
                  {orderCount >= orderLimit
                    ? t("orderLimitReached")
                    : t("approachingLimit")}
                </p>
                <p className="text-sm text-amber-400/80 mt-0.5">
                  {orderCount >= orderLimit
                    ? t("purchasesPaused")
                    : t("usedOfLimit", { used: orderCount, limit: orderLimit })}
                </p>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Auto-upgrade notice for paid plans */}
      {usagePercent >= 90 && plan !== "FREE" && plan !== "SCALE" && (
        <Alert className="border-brand-500/20 bg-brand-500/10">
          <AlertDescription>
            <div className="flex items-start gap-4">
              <Package className="h-5 w-5 text-brand-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-brand-400">{t("approachingLimit")}</p>
                <p className="text-sm text-brand-400/80 mt-0.5">
                  {t("autoUpgradeNotice", { limit: orderLimit.toLocaleString() })}
                </p>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Cancel at period end notice */}
      {subscription?.cancelAtPeriodEnd && subscription.currentPeriodEnd && (
        <Alert className="border-amber-500/20 bg-amber-500/10">
          <AlertDescription>
            <div className="flex items-start gap-4">
              <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-400">{t("subscriptionSetToCancel")}</p>
                <p className="text-sm text-amber-400/80 mt-0.5">
                  {t("cancelNotice", { date: formatDate(subscription.currentPeriodEnd) })}
                </p>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Plan comparison */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">{t("choosePlan")}</h2>
        <PlanCards
          currentPlan={plan}
          subscriptionStatus={status}
          stripeCustomerId={subscription?.stripeCustomerId ?? null}
        />
      </div>

      {/* FAQ */}
      <Card>
        <CardHeader>
          <CardTitle>{t("faq")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map(({ q, a }, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger>{q}</AccordionTrigger>
                <AccordionContent>{a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
