import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { PLAN_PRICE_MAP } from "@/lib/constants";
import { z } from "zod";
import { getSharedRedis } from "@/lib/redis";
import { createLogger } from "@/lib/logger";

const log = createLogger({ component: "stripe-checkout" });

const CheckoutSchema = z.object({
  plan: z.enum(["STARTER", "GROWTH", "SCALE"]),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lockKey = `checkout-lock:${session.user.id}`;
  const acquired = await getSharedRedis().set(lockKey, "1", "EX", 30, "NX").catch(() => null);
  if (!acquired) {
    return NextResponse.json({ error: "Checkout already in progress. Please try again." }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { plan } = CheckoutSchema.parse(body);
    const priceId = PLAN_PRICE_MAP[plan];
    if (!priceId) {
      return NextResponse.json({ error: "Plan not configured. Set STRIPE_*_PRICE_ID env vars." }, { status: 500 });
    }

    // Find existing subscription to check for an existing Stripe customer
    const existingSubscription = await db.subscription.findUnique({
      where: { userId: session.user.id },
    });

    let customerId: string;
    if (existingSubscription?.stripeCustomerId) {
      customerId = existingSubscription.stripeCustomerId;
    } else {
      const customer = await stripe.customers.create({
        email: session.user.email!,
        metadata: { userId: session.user.id },
      });
      customerId = customer.id;
    }

    // Atomically create-or-update the subscription record with the stripeCustomerId
    await db.subscription.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        stripeCustomerId: customerId,
        plan: "FREE",
        status: "ACTIVE",
      },
      update: {
        stripeCustomerId: customerId,
      },
    });

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?canceled=true`,
      metadata: { userId: session.user.id },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 422 });
    }
    log.error("Stripe checkout failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Failed to create checkout" }, { status: 500 });
  } finally {
    await getSharedRedis().del(lockKey).catch(() => null);
  }
}
