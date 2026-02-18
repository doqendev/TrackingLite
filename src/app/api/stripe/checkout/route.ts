import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { PLAN_PRICE_MAP } from "@/lib/constants";
import { z } from "zod";

const CheckoutSchema = z.object({
  plan: z.enum(["STARTER", "GROWTH", "SCALE"]),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { plan } = CheckoutSchema.parse(body);
    const priceId = PLAN_PRICE_MAP[plan];
    if (!priceId) {
      return NextResponse.json({ error: "Plan not configured. Set STRIPE_*_PRICE_ID env vars." }, { status: 500 });
    }

    // Get or create Stripe customer
    let subscription = await db.subscription.findUnique({
      where: { userId: session.user.id },
    });

    let customerId: string;
    if (subscription?.stripeCustomerId) {
      customerId = subscription.stripeCustomerId;
    } else {
      const customer = await stripe.customers.create({
        email: session.user.email!,
        metadata: { userId: session.user.id },
      });
      customerId = customer.id;

      // Create subscription record with FREE plan
      if (!subscription) {
        await db.subscription.create({
          data: {
            userId: session.user.id,
            stripeCustomerId: customerId,
            plan: "FREE",
            status: "ACTIVE",
          },
        });
      }
    }

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
    console.error("[Stripe Checkout] Error:", error);
    return NextResponse.json({ error: "Failed to create checkout" }, { status: 500 });
  }
}
