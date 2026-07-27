import { execSync } from "child_process";
import IORedis from "ioredis";
import {
  getSafeIntegrationDatabaseUrl,
  getSafeIntegrationRedisUrl,
} from "./safety";

const TEST_DB = "trackinglite_test";

async function flushTestRedis(redisUrl: string) {
  const redis = new IORedis(redisUrl, { maxRetriesPerRequest: 1 });
  try {
    await redis.flushdb();
  } finally {
    await redis.quit();
  }
}

export async function setup() {
  const databaseUrl = getSafeIntegrationDatabaseUrl();
  const redisUrl = getSafeIntegrationRedisUrl();
  const workspaceRoot = process.env.INIT_CWD || process.cwd();

  console.log("[Integration] Creating test database...");

  try {
    execSync(
      `docker compose exec -T postgres psql -U trackclear -d trackclear -c "CREATE DATABASE ${TEST_DB}"`,
      { stdio: "pipe", cwd: workspaceRoot }
    );
  } catch {
    // An externally managed test database may already exist. The schema reset
    // below is the authoritative connectivity and permission check.
  }

  console.log(
    "[Integration] Resetting schema and applying committed migrations in isolated test database..."
  );
  execSync(
    "pnpm exec prisma migrate reset --force --skip-seed --skip-generate",
    {
      stdio: "pipe",
      cwd: workspaceRoot,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        DIRECT_DATABASE_URL: databaseUrl,
      },
    }
  );

  await flushTestRedis(redisUrl);

  console.log("[Integration] Test database ready.");
}

export async function teardown() {
  await flushTestRedis(getSafeIntegrationRedisUrl());
  console.log("[Integration] Isolated Redis database cleared.");
}
