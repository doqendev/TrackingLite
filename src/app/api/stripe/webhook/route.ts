import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import Stripe from "stripe";
import IORedis from "ioredis";

let redis: IORedis | null = null;
function getRedis(): IORedis {
  if (!redis) {
    redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { lazyConnect: true });
  }
  return redis;
}

function priceIdToPlan(priceId: string | undefined): "STARTER" | "GROWTH" | "SCALE" {
  if (priceId === process.env.STRIPE_SCALE_PRICE_ID) return "SCALE";
  if (priceId === process.env.STRIPE_GROWTH_PRICE_ID) return "GROWTH";
  return "STARTER";
}

function stripeStatusToLocal(status: string): "ACTIVE" | "PAST_DUE" | "CANCELED" | "UNPAID" {
  if (status === "past_due") return "PAST_DUE";
  if (status === "canceled") return "CANCELED";
  if (status === "unpaid") return "UNPAID";
  return "ACTIVE";
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("[Stripe Webhook] Invalid signature:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    const r = getRedis();
    const dedupeKey = `stripe-webhook:${event.id}`;
    const alreadyProcessed = await r.set(dedupeKey, "1", "EX", 172800, "NX"); // 48h TTL, NX = only if not exists
    if (!alreadyProcessed) {
      // Already processed this event
      return NextResponse.json({ received: true });
    }
  } catch (redisErr) {
    console.warn("[Stripe Webhook] Redis idempotency check failed, processing anyway:", redisErr);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        if (!userId || !session.subscription) break;

        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string
        );

        const priceId = subscription.items.data[0]?.price?.id;
        const plan = priceIdToPlan(priceId);

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
    console.error("[Stripe Webhook] Processing error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
