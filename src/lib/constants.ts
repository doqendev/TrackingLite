export const META_API_VERSION = process.env.META_API_VERSION || "v21.0";
export const META_API_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

export const EVENT_NAMES = ["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase"] as const;
export type EventNameType = typeof EVENT_NAMES[number];

export const BILLING_PLANS = {
  FREE: {
    name: "Free",
    priceMonthly: 0,
    currency: "usd",
    ordersPerMonth: 50,
    eventLogRetentionDays: 7,
    features: [
      "Up to 50 orders/month",
      "Unlimited non-purchase events",
      "5 event types",
      "7-day event log",
    ],
  },
  STARTER: {
    name: "Starter",
    priceMonthly: 29,
    currency: "usd",
    ordersPerMonth: 500,
    eventLogRetentionDays: 7,
    features: [
      "Up to 500 orders/month",
      "Unlimited non-purchase events",
      "5 event types",
      "7-day event log",
      "Email support",
    ],
  },
  GROWTH: {
    name: "Growth",
    priceMonthly: 49,
    currency: "usd",
    ordersPerMonth: 1000,
    eventLogRetentionDays: 30,
    features: [
      "Up to 1,000 orders/month",
      "Unlimited non-purchase events",
      "5 event types",
      "30-day event log",
      "Priority support",
    ],
  },
  SCALE: {
    name: "Scale",
    priceMonthly: 99,
    currency: "usd",
    ordersPerMonth: 5000,
    eventLogRetentionDays: 30,
    features: [
      "Up to 5,000 orders/month",
      "Unlimited non-purchase events",
      "5 event types",
      "30-day event log",
      "Priority support",
    ],
  },
} as const;

export type BillingPlanKey = keyof typeof BILLING_PLANS;

/** When a paid user exceeds their order limit, auto-upgrade to the next tier. null = no upgrade available. */
export const AUTO_UPGRADE_MAP: Record<string, BillingPlanKey | null> = {
  STARTER: "GROWTH",
  GROWTH: "SCALE",
  SCALE: null,
};

/** Stripe price ID mapping — read from env vars */
export const PLAN_PRICE_MAP: Record<string, string | undefined> = {
  STARTER: process.env.STRIPE_STARTER_PRICE_ID,
  GROWTH: process.env.STRIPE_GROWTH_PRICE_ID,
  SCALE: process.env.STRIPE_SCALE_PRICE_ID,
};

export const RATE_LIMIT = {
  INGEST_PER_SECOND_PER_WORKSPACE: 100,
  META_CAPI_PER_SECOND: 100,
} as const;

export const QUEUE_CONFIG = {
  QUEUE_NAME: "meta-events",
  GOOGLE_QUEUE_NAME: "google-events",
  TIKTOK_QUEUE_NAME: "tiktok-events",
  GA4_QUEUE_NAME: "ga4-events",
  KLAVIYO_QUEUE_NAME: "klaviyo-events",
  MAX_ATTEMPTS: 3,
  BACKOFF_DELAY_MS: 2000, // 2s, 4s, 8s exponential
} as const;
