import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia" as Stripe.LatestApiVersion,
  typescript: true,
});

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
