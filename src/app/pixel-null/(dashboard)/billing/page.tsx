import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { BILLING_PLANS } from "@/lib/constants";
import { getOrderCount } from "@/lib/billing";
import { BillingPlan } from "@prisma/client";
import Link from "next/link";
import { PnOrderUsage } from "@/components/pixel-null/dashboard/pn-order-usage";
import { PlanCards } from "@/components/billing/plan-cards";

export const dynamic = "force-dynamic";

const PLAN_LABELS: Record<BillingPlan, string> = {
  FREE: "FREE",
  STARTER: "STARTER",
  GROWTH: "GROWTH",
  SCALE: "SCALE",
};

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function PnBillingPage({
  searchParams,
}: {
  searchParams: { success?: string; canceled?: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const justSubscribed = searchParams.success === "true";
  const checkoutCanceled = searchParams.canceled === "true";

  let subscription, plan, planConfig, orderCount, orderLimit, usagePercent;
  try {
    subscription = await db.subscription.findUnique({
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

    plan = (subscription?.plan ?? "FREE") as BillingPlan;
    planConfig = BILLING_PLANS[plan as keyof typeof BILLING_PLANS];
    orderCount = await getOrderCount(session.user.id);
    orderLimit = planConfig?.ordersPerMonth ?? 50;
    usagePercent = Math.min(100, Math.round((orderCount / orderLimit) * 100));
  } catch {
    return (
      <div>
        <p className="pn-text-red" style={{ fontSize: "0.8rem" }}>
          {"// ERROR: FAILED TO LOAD BILLING DATA"}
        </p>
      </div>
    );
  }

  const status = subscription?.status ?? "ACTIVE";

  const faqs = [
    { q: "WHAT COUNTS AS AN ORDER?", a: "Only Purchase events count toward your monthly limit. All other events (PageView, ViewContent, AddToCart, InitiateCheckout) are free and unlimited." },
    { q: "WHAT IF I EXCEED MY LIMIT?", a: "Paid plans auto-upgrade to the next tier. Free plan stops forwarding Purchase events at the limit." },
    { q: "CAN I CHANGE PLANS?", a: "Yes. Use the Stripe billing portal to upgrade, downgrade, or cancel at any time." },
    { q: "DO YOU OFFER REFUNDS?", a: "We offer prorated refunds for downgrades within the current billing period." },
  ];

  return (
    <div>
      {/* Header */}
      <div className="pn-dash-section-header">
        <div>
          <span className="pn-ref-label">* BILLING // SUBSCRIPTION</span>
          <div className="pn-dash-section-title" style={{ marginTop: 4 }}>Billing</div>
          <span className="pn-text-dim" style={{ fontSize: "0.7rem" }}>
            MANAGE YOUR PLAN AND USAGE
          </span>
        </div>
      </div>

      {/* Alerts */}
      {justSubscribed && (
        <div className="pn-dash-card pn-dash-mb" style={{ borderColor: "var(--pn-accent)" }}>
          <div className="pn-dash-card-body">
            <span className="pn-text-cyan" style={{ fontSize: "0.75rem" }}>
              &gt; SUBSCRIPTION_ACTIVE -- THANK YOU
            </span>
          </div>
        </div>
      )}
      {checkoutCanceled && (
        <div className="pn-dash-card pn-dash-mb" style={{ borderColor: "#f59e0b" }}>
          <div className="pn-dash-card-body">
            <span className="pn-text-amber" style={{ fontSize: "0.75rem" }}>
              &gt; CHECKOUT_CANCELED -- NO CHANGES MADE
            </span>
          </div>
        </div>
      )}

      {/* Current Plan */}
      <div className="pn-dash-card pn-dash-mb">
        <div className="pn-dash-card-header">
          <span>PLAN.CFG</span>
          <span className="pn-dash-badge pn-dash-badge--cyan">{PLAN_LABELS[plan]}</span>
        </div>
        <div className="pn-dash-card-body">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
            <div style={{ fontSize: "0.75rem" }}>
              <div style={{ marginBottom: 4 }}>
                <span className="pn-text-dim">PLAN:</span>{" "}
                <span className="pn-text-cyan" style={{ fontFamily: "var(--pn-font-display), sans-serif", fontSize: "1.2rem" }}>
                  {PLAN_LABELS[plan]}
                </span>
              </div>
              <div style={{ marginBottom: 4 }}>
                <span className="pn-text-dim">ORDERS:</span>{" "}
                {planConfig.ordersPerMonth.toLocaleString()}/mo
              </div>
              <div style={{ marginBottom: 4 }}>
                <span className="pn-text-dim">RETENTION:</span>{" "}
                {planConfig.eventLogRetentionDays}d
              </div>
              {plan !== "FREE" && planConfig.priceMonthly > 0 && (
                <div>
                  <span className="pn-text-dim">COST:</span>{" "}
                  <span className="pn-text-cyan">${planConfig.priceMonthly}/mo</span>
                </div>
              )}
            </div>
            <div style={{ fontSize: "0.7rem", textAlign: "right" }}>
              <div>
                <span className="pn-text-dim">STATUS:</span>{" "}
                <span className={status === "ACTIVE" ? "pn-text-green" : status === "PAST_DUE" ? "pn-text-red" : "pn-text-dim"}>
                  {status}
                </span>
              </div>
              {subscription?.currentPeriodEnd && status === "ACTIVE" && plan !== "FREE" && (
                <div style={{ marginTop: 4 }}>
                  <span className="pn-text-dim">
                    {subscription.cancelAtPeriodEnd ? "CANCELS:" : "RENEWS:"}
                  </span>{" "}
                  {formatDate(subscription.currentPeriodEnd)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Order Usage */}
      <div className="pn-dash-mb">
        <PnOrderUsage
          plan={plan}
          ordersUsed={orderCount}
          ordersLimit={orderLimit}
          usagePercent={usagePercent}
        />
      </div>

      {/* Usage warnings */}
      {usagePercent >= 90 && plan === "FREE" && (
        <div className="pn-dash-card pn-dash-mb" style={{ borderColor: "var(--pn-accent-danger)" }}>
          <div className="pn-dash-card-body">
            <span className="pn-text-red" style={{ fontSize: "0.75rem" }}>
              {orderCount >= orderLimit
                ? "> WARNING: ORDER LIMIT REACHED -- PURCHASE FORWARDING PAUSED"
                : "> WARNING: APPROACHING ORDER LIMIT"}
            </span>
            <div className="pn-text-dim" style={{ fontSize: "0.7rem", marginTop: 4 }}>
              UPGRADE TO CONTINUE FORWARDING PURCHASE EVENTS
            </div>
          </div>
        </div>
      )}

      {/* Plan Cards */}
      <div className="pn-dash-section-header">
        <div>
          <span className="pn-ref-label">* PLANS // CHOOSE</span>
          <div className="pn-dash-section-title" style={{ marginTop: 4 }}>Choose Plan</div>
        </div>
      </div>
      <div className="pn-dash-mb">
        <PlanCards
          currentPlan={plan}
          subscriptionStatus={status}
          stripeCustomerId={subscription?.stripeCustomerId ?? null}
        />
      </div>

      {/* FAQ */}
      <div className="pn-dash-section-header">
        <div>
          <span className="pn-ref-label">* FAQ // BILLING</span>
          <div className="pn-dash-section-title" style={{ marginTop: 4 }}>FAQ</div>
        </div>
      </div>
      <div className="pn-dash-card">
        <div className="pn-dash-card-body">
          {faqs.map((faq, i) => (
            <div key={i} style={{ marginBottom: i < faqs.length - 1 ? 16 : 0 }}>
              <div style={{ fontSize: "0.75rem", marginBottom: 4 }}>
                <span className="pn-text-cyan">&gt;</span> {faq.q}
              </div>
              <div className="pn-text-dim" style={{ fontSize: "0.7rem", paddingLeft: 16 }}>
                {faq.a}
              </div>
              {i < faqs.length - 1 && <div className="pn-scan-line" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
