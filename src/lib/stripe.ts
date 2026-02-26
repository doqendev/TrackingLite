import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY environment variable is required");
    }
    _stripe = new Stripe(key, {
      apiVersion: "2024-12-18.acacia" as Stripe.LatestApiVersion,
      typescript: true,
    });
  }
  return _stripe;
}

export const STRIPE_PLANS = {
  STARTER: {
    name: "Starter",
    priceMonthly: 2900, // in cents
    lookupKey: "starter_monthly",
  },
  GROWTH: {
    name: "Growth",
    priceMonthly: 4900,
    lookupKey: "growth_monthly",
  },
  SCALE: {
    name: "Scale",
    priceMonthly: 9900,
    lookupKey: "scale_monthly",
  },
} as const;
