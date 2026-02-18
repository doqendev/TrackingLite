"use client";

import { useState } from "react";
import { BILLING_PLANS, AUTO_UPGRADE_MAP } from "@/lib/constants";
import { BillingPlan, SubscriptionStatus } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

type PaidPlanKey = "STARTER" | "GROWTH" | "SCALE";

interface PlanCardsProps {
  currentPlan: BillingPlan;
  subscriptionStatus: SubscriptionStatus | null;
  stripeCustomerId: string | null;
}

export function PlanCards({ currentPlan, subscriptionStatus, stripeCustomerId }: PlanCardsProps) {
  const [loadingPlan, setLoadingPlan] = useState<PaidPlanKey | null>(null);
  const [loadingPortal, setLoadingPortal] = useState(false);

  async function handleSubscribe(plan: PaidPlanKey) {
    setLoadingPlan(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) throw new Error("Failed to create checkout");
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      toast.error("Failed to open checkout. Please try again.");
    } finally {
      setLoadingPlan(null);
    }
  }

  async function handleManageBilling() {
    setLoadingPortal(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      if (!res.ok) throw new Error("Failed to open portal");
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      toast.error("Failed to open billing portal. Please try again.");
    } finally {
      setLoadingPortal(false);
    }
  }

  const isOnPaidPlan = currentPlan !== "FREE";

  return (
    <div className="space-y-6">
      {/* Manage billing button (only shown for paid plans) */}
      {isOnPaidPlan && stripeCustomerId && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={handleManageBilling} disabled={loadingPortal}>
            {loadingPortal ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Opening&hellip;
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4" />
                Manage Billing
              </>
            )}
          </Button>
        </div>
      )}

      {/* Plan comparison grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Free Plan */}
        <PlanCard
          planKey="FREE"
          plan={BILLING_PLANS.FREE}
          isCurrentPlan={currentPlan === "FREE"}
          subscriptionStatus={subscriptionStatus}
          isLoading={false}
          onSubscribe={() => {}}
          highlighted={false}
          autoUpgradeNote={null}
          isFree
        />

        {/* Starter Plan */}
        <PlanCard
          planKey="STARTER"
          plan={BILLING_PLANS.STARTER}
          isCurrentPlan={currentPlan === "STARTER"}
          subscriptionStatus={subscriptionStatus}
          isLoading={loadingPlan === "STARTER"}
          onSubscribe={() => handleSubscribe("STARTER")}
          highlighted={false}
          autoUpgradeNote={`Auto-upgrades to ${BILLING_PLANS[AUTO_UPGRADE_MAP.STARTER!].name} if you exceed ${BILLING_PLANS.STARTER.ordersPerMonth.toLocaleString()} orders`}
        />

        {/* Growth Plan */}
        <PlanCard
          planKey="GROWTH"
          plan={BILLING_PLANS.GROWTH}
          isCurrentPlan={currentPlan === "GROWTH"}
          subscriptionStatus={subscriptionStatus}
          isLoading={loadingPlan === "GROWTH"}
          onSubscribe={() => handleSubscribe("GROWTH")}
          highlighted={true}
          autoUpgradeNote={`Auto-upgrades to ${BILLING_PLANS[AUTO_UPGRADE_MAP.GROWTH!].name} if you exceed ${BILLING_PLANS.GROWTH.ordersPerMonth.toLocaleString()} orders`}
        />

        {/* Scale Plan */}
        <PlanCard
          planKey="SCALE"
          plan={BILLING_PLANS.SCALE}
          isCurrentPlan={currentPlan === "SCALE"}
          subscriptionStatus={subscriptionStatus}
          isLoading={loadingPlan === "SCALE"}
          onSubscribe={() => handleSubscribe("SCALE")}
          highlighted={false}
          autoUpgradeNote={null}
        />
      </div>
    </div>
  );
}

interface PlanCardProps {
  planKey: string;
  plan: (typeof BILLING_PLANS)[keyof typeof BILLING_PLANS];
  isCurrentPlan: boolean;
  subscriptionStatus: SubscriptionStatus | null;
  isLoading: boolean;
  onSubscribe: () => void;
  highlighted: boolean;
  autoUpgradeNote: string | null;
  isFree?: boolean;
}

function PlanCard({
  plan,
  isCurrentPlan,
  subscriptionStatus,
  isLoading,
  onSubscribe,
  highlighted,
  autoUpgradeNote,
  isFree,
}: PlanCardProps) {
  const isActive = isCurrentPlan && (subscriptionStatus === "ACTIVE" || (!subscriptionStatus && isFree));
  const isPastDue = isCurrentPlan && subscriptionStatus === "PAST_DUE";

  return (
    <Card
      className={`relative border-2 p-6 flex flex-col transition-all duration-300 hover:-translate-y-0.5 ${
        highlighted
          ? "border-brand-500 shadow-md hover:shadow-lg hover:shadow-brand-500/10"
          : isCurrentPlan
          ? "border-green-500/30"
          : "hover:border-white/[0.12]"
      }`}
    >
      {highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-brand-500 text-white glow-brand">Most Popular</Badge>
        </div>
      )}

      {isCurrentPlan && (
        <div className="absolute top-4 right-4">
          <Badge
            className={
              isActive
                ? "bg-green-500/10 text-green-400"
                : isPastDue
                ? "bg-red-500/10 text-red-400"
                : "bg-secondary text-muted-foreground"
            }
          >
            {isActive ? "Current Plan" : isPastDue ? "Past Due" : "Current Plan"}
          </Badge>
        </div>
      )}

      <div className="mb-5">
        <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
        <div className="flex items-baseline gap-1 mt-2">
          {plan.priceMonthly === 0 ? (
            <span className="text-4xl font-extrabold text-foreground">Free</span>
          ) : (
            <>
              <span className="text-4xl font-extrabold text-foreground tabular-nums">${plan.priceMonthly}</span>
              <span className="text-xs text-muted-foreground/60">/month</span>
            </>
          )}
        </div>
      </div>

      <ul className="space-y-2.5 flex-1 mb-4">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-sm text-foreground">
            <Check className="h-4 w-4 text-brand-500 flex-shrink-0 mt-0.5" />
            {feature}
          </li>
        ))}
      </ul>

      {autoUpgradeNote && (
        <p className="text-xs text-muted-foreground mb-4">{autoUpgradeNote}</p>
      )}

      {isFree ? (
        <Button className="w-full" variant="secondary" disabled>
          {isActive ? "Your Current Plan" : "Free Forever"}
        </Button>
      ) : (
        <Button
          className="w-full"
          variant={isCurrentPlan && isActive ? "secondary" : highlighted ? "brand" : "default"}
          onClick={isCurrentPlan && isActive ? undefined : onSubscribe}
          disabled={isLoading || (isCurrentPlan && isActive)}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Redirecting&hellip;
            </span>
          ) : isCurrentPlan && isActive ? (
            "Your Current Plan"
          ) : (
            `Subscribe to ${plan.name}`
          )}
        </Button>
      )}
    </Card>
  );
}
