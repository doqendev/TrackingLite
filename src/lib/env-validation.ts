import { createLogger } from "./logger";

const log = createLogger({ component: "env-validation" });

export function validateEnv(context: "web" | "worker" = "web") {
  // Core vars required by both web and worker
  const required: Record<string, string | undefined> = {
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  };

  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  // Validate ENCRYPTION_KEY length (must be 64 hex chars = 32 bytes for AES-256)
  const encKey = process.env.ENCRYPTION_KEY!;
  if (encKey.length !== 64 || !/^[0-9a-fA-F]+$/.test(encKey)) {
    throw new Error("ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes)");
  }

  // Web-only vars: required for billing (worker doesn't handle Stripe)
  if (context === "web") {
    const webRequired: Record<string, string | undefined> = {
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
      STRIPE_STARTER_PRICE_ID: process.env.STRIPE_STARTER_PRICE_ID,
      STRIPE_GROWTH_PRICE_ID: process.env.STRIPE_GROWTH_PRICE_ID,
      STRIPE_SCALE_PRICE_ID: process.env.STRIPE_SCALE_PRICE_ID,
    };
    const webMissing = Object.entries(webRequired)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (webMissing.length > 0) {
      throw new Error(`Missing required environment variables (web): ${webMissing.join(", ")}`);
    }
  }

  // Optional variable warnings
  if (!process.env.RESEND_API_KEY) {
    log.warn("RESEND_API_KEY is not set. Email sending will not work.");
  }
  if (context === "web" && !process.env.NEXT_PUBLIC_APP_URL) {
    log.warn("NEXT_PUBLIC_APP_URL is not set. Stripe redirects may not work.");
  }
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) {
    log.warn("SENTRY_DSN is not set. Error tracking via Sentry will be disabled.");
  }
}
