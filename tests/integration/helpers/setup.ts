import { execSync } from "child_process";

const TEST_DB = "trackinglite_test";

export async function setup() {
  console.log("[Integration] Creating test database...");

  try {
    execSync(
      `docker compose exec -T postgres psql -U trackinglite -d trackinglite -c "CREATE DATABASE ${TEST_DB}"`,
      { stdio: "pipe", cwd: process.env.INIT_CWD || process.cwd() }
    );
  } catch {
    // DB might already exist
  }

  console.log("[Integration] Pushing schema to test database...");
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    stdio: "pipe",
    cwd: process.env.INIT_CWD || process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: `postgresql://trackinglite:localdev@localhost:5433/${TEST_DB}`,
      DIRECT_DATABASE_URL: `postgresql://trackinglite:localdev@localhost:5433/${TEST_DB}`,
    },
  });

  console.log("[Integration] Test database ready.");
}

export async function teardown() {
  console.log("[Integration] Dropping test database...");
  try {
    // Terminate existing connections first
    execSync(
      `docker compose exec -T postgres psql -U trackinglite -d trackinglite -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEST_DB}' AND pid <> pg_backend_pid()"`,
      { stdio: "pipe", cwd: process.env.INIT_CWD || process.cwd() }
    );
    execSync(
      `docker compose exec -T postgres psql -U trackinglite -d trackinglite -c "DROP DATABASE IF EXISTS ${TEST_DB}"`,
      { stdio: "pipe", cwd: process.env.INIT_CWD || process.cwd() }
    );
  } catch {
    console.warn("[Integration] Could not drop test database");
  }
}
