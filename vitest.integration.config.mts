import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const integrationDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://trackclear:localdev@localhost:5433/trackinglite_test";
const integrationRedisUrl =
  process.env.TEST_REDIS_URL ?? "redis://localhost:6379/15";

// Global setup runs before Vitest applies test.env in every context. Populate
// this process as well so destructive test cleanup can validate its target.
process.env.INTEGRATION_TEST_RUN = "1";
process.env.DATABASE_URL = integrationDatabaseUrl;
process.env.DIRECT_DATABASE_URL = integrationDatabaseUrl;
process.env.REDIS_URL = integrationRedisUrl;

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 30000,
    globalSetup: ["tests/integration/helpers/setup.ts"],
    env: {
      INTEGRATION_TEST_RUN: "1",
      DATABASE_URL: integrationDatabaseUrl,
      DIRECT_DATABASE_URL: integrationDatabaseUrl,
      REDIS_URL: integrationRedisUrl,
      NEXTAUTH_SECRET: "test-secret-at-least-32-characters-long",
      ENCRYPTION_KEY:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      STRIPE_SECRET_KEY: "sk_test_fake",
      STRIPE_WEBHOOK_SECRET: "whsec_test_fake",
      STRIPE_STARTER_PRICE_ID: "price_starter_test",
      STRIPE_GROWTH_PRICE_ID: "price_growth_test",
      STRIPE_SCALE_PRICE_ID: "price_scale_test",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_INGEST_URL: "http://localhost:3000/api/events/ingest",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
