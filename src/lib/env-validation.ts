export function validateEnv() {
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

  // Optional variable warnings
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn("Warning: STRIPE_SECRET_KEY is not set. Stripe billing will not work.");
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.warn("Warning: STRIPE_WEBHOOK_SECRET is not set. Stripe webhooks will not work.");
  }
  if (!process.env.RESEND_API_KEY) {
    console.warn("Warning: RESEND_API_KEY is not set. Email sending will not work.");
  }
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    console.warn("Warning: NEXT_PUBLIC_APP_URL is not set. Stripe redirects may not work.");
  }
}
