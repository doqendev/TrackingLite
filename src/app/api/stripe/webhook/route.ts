import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import Stripe from "stripe";
import { getSharedRedis } from "@/lib/redis";
import { createLogger } from "@/lib/logger";

const log = createLogger({ component: "stripe-webhook" });

function priceIdToPlan(priceId: string | undefined): "STARTER" | "GROWTH" | "SCALE" | null {
  if (priceId === process.env.STRIPE_STARTER_PRICE_ID) return "STARTER";
  if (priceId === process.env.STRIPE_SCALE_PRICE_ID) return "SCALE";
  if (priceId === process.env.STRIPE_GROWTH_PRICE_ID) return "GROWTH";
  console.error(JSON.stringify({ level: "error", msg: "Unknown Stripe price ID", priceId }));
  return null;
}

function stripeStatusToLocal(status: string): "ACTIVE" | "PAST_DUE" | "CANCELED" | "UNPAID" {
  if (status === "past_due") return "PAST_DUE";
  if (status === "canceled") return "CANCELED";
  if (status === "unpaid") return "UNPAID";
  return "ACTIVE";
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    log.error("STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      webhookSecret
    );
  } catch (err) {
    log.error("Stripe webhook invalid signature", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    const r = getSharedRedis();
    const dedupeKey = `stripe-webhook:${event.id}`;
    const alreadyProcessed = await r.set(dedupeKey, "1", "EX", 172800, "NX"); // 48h TTL, NX = only if not exists
    if (!alreadyProcessed) {
      // Already processed this event
      return NextResponse.json({ received: true });
    }
  } catch (redisErr) {
    log.warn("Redis idempotency check failed, processing anyway", { error: redisErr instanceof Error ? redisErr.message : String(redisErr) });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        if (!userId || !session.subscription) break;

        const subscription = await getStripe().subscriptions.retrieve(
          session.subscription as string
        );

        const priceId = subscription.items.data[0]?.price?.id;
        const plan = priceIdToPlan(priceId);
        if (!plan) {
          log.error("checkout.session.completed: unknown price ID, skipping plan update", { priceId, userId });
          break;
        }

        await db.subscription.upsert({
          where: { userId },
          create: {
            userId,
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: subscription.id,
            stripePriceId: priceId,
            plan,
            status: "ACTIVE",
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          },
          update: {
            stripeSubscriptionId: subscription.id,
            stripePriceId: priceId,
            plan,
            status: "ACTIVE",
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          },
        });
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const sub = await db.subscription.findUnique({
          where: { stripeSubscriptionId: subscription.id },
        });
        if (!sub) break;

        const priceId = subscription.items.data[0]?.price?.id;
        const plan = priceIdToPlan(priceId);
        const status = stripeStatusToLocal(subscription.status);

        if (!plan) {
          log.error("customer.subscription.updated: unknown price ID, skipping plan update", { priceId, subscriptionId: subscription.id });
          // Still update status and period even if plan is unknown
          await db.subscription.update({
            where: { stripeSubscriptionId: subscription.id },
            data: {
              stripePriceId: priceId,
              status,
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            },
          });
          break;
        }

        await db.subscription.update({
          where: { stripeSubscriptionId: subscription.id },
          data: {
            stripePriceId: priceId,
            plan,
            status,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          },
        });
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await db.subscription.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: { status: "CANCELED" },
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          await db.subscription.updateMany({
            where: { stripeSubscriptionId: invoice.subscription as string },
            data: { status: "PAST_DUE" },
          });
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          await db.subscription.updateMany({
            where: { stripeSubscriptionId: invoice.subscription as string },
            data: { status: "ACTIVE" },
          });
        }
        break;
      }
    }
  } catch (error) {
    log.error("Stripe webhook processing failed", { error: error instanceof Error ? error.message : String(error) });
    // Return 200 to prevent Stripe retry storms on permanent failures
    return NextResponse.json({ received: true, error: "Processing failed" }, { status: 200 });
  }

  return NextResponse.json({ received: true });
}
