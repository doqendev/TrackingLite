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
import { AlertTriangle, ShoppingCart } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<SubscriptionStatus, { label: string; className: string }> = {
  TRIALING: { label: "Free", className: "bg-brand-500/10 text-brand-400" },
  ACTIVE: { label: "Active", className: "bg-green-500/10 text-green-400" },
  PAST_DUE: { label: "Past Due", className: "bg-red-500/10 text-red-400" },
  CANCELED: { label: "Canceled", className: "bg-muted text-muted-foreground" },
  UNPAID: { label: "Unpaid", className: "bg-red-500/10 text-red-400" },
};

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

const faqs = [
  {
    q: "What counts as an order?",
    a: "Only Purchase events count toward your order limit. All other events (PageView, ViewContent, AddToCart, InitiateCheckout) are free and unlimited on every plan.",
  },
  {
    q: "What happens when I exceed my order limit?",
    a: "On paid plans, we automatically upgrade you to the next tier so your tracking stays uninterrupted. On the free plan, Purchase event forwarding is paused until you upgrade.",
  },
  {
    q: "Can I change plans later?",
    a: "Yes. You can upgrade or downgrade at any time from the billing portal. Changes take effect immediately.",
  },
  {
    q: "Do you offer refunds?",
    a: "We do not offer refunds for partial months. You can cancel at any time and keep access until the end of your billing period.",
  },
];

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

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
        <h1 className="text-2xl font-bold text-foreground">Billing</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your subscription and plan.</p>
      </div>

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
                Up to {planConfig.ordersPerMonth.toLocaleString()} orders/month &middot;{" "}
                {planConfig.eventLogRetentionDays}-day log retention
              </p>
              {plan !== "FREE" && planConfig.priceMonthly > 0 && (
                <p className="text-sm text-muted-foreground">
                  ${planConfig.priceMonthly}/month
                </p>
              )}
            </div>

            <div className="text-right space-y-0.5">
              {subscription?.currentPeriodEnd && status === "ACTIVE" && plan !== "FREE" && (
                <>
                  <p className="text-xs text-muted-foreground">
                    {subscription.cancelAtPeriodEnd ? "Cancels on" : "Renews on"}
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    {formatDate(subscription.currentPeriodEnd)}
                  </p>
                </>
              )}
              {subscription?.currentPeriodEnd && status === "PAST_DUE" && (
                <>
                  <p className="text-xs text-red-400 font-medium">Payment failed</p>
                  <p className="text-sm text-muted-foreground">
                    Due {formatDate(subscription.currentPeriodEnd)}
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
            <ShoppingCart className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Monthly Order Usage</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {orderCount.toLocaleString()} of {orderLimit.toLocaleString()} orders used
              </span>
              <span className="text-muted-foreground">{usagePercent}%</span>
            </div>
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  usagePercent >= 90 ? "bg-red-500" : usagePercent >= 70 ? "bg-amber-500" : "bg-brand-500"
                }`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Only Purchase events count toward your limit. All other events are free and unlimited.
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
                    ? "Order limit reached"
                    : "Approaching order limit"}
                </p>
                <p className="text-sm text-amber-400/80 mt-0.5">
                  {orderCount >= orderLimit
                    ? "Purchase events are no longer being forwarded to Meta. Upgrade to continue tracking orders."
                    : `You've used ${orderCount} of ${orderLimit} orders. Upgrade to Starter ($29/mo) for 500 orders/month.`}
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
              <ShoppingCart className="h-5 w-5 text-brand-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-brand-400">Approaching order limit</p>
                <p className="text-sm text-brand-400/80 mt-0.5">
                  When you exceed {orderLimit.toLocaleString()} orders, we&apos;ll automatically upgrade you
                  to the next plan tier so your tracking stays uninterrupted.
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
                <p className="text-sm font-semibold text-amber-400">Subscription set to cancel</p>
                <p className="text-sm text-amber-400/80 mt-0.5">
                  Your subscription will cancel on {formatDate(subscription.currentPeriodEnd)}. You can
                  reactivate it from the billing portal.
                </p>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Plan comparison */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Choose a Plan</h2>
        <PlanCards
          currentPlan={plan}
          subscriptionStatus={status}
          stripeCustomerId={subscription?.stripeCustomerId ?? null}
        />
      </div>

      {/* FAQ */}
      <Card>
        <CardHeader>
          <CardTitle>Frequently Asked Questions</CardTitle>
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
