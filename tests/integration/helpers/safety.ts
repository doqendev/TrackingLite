const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function requireIntegrationMarker() {
  if (process.env.INTEGRATION_TEST_RUN !== "1") {
    throw new Error(
      "Integration test reset refused: INTEGRATION_TEST_RUN is not set"
    );
  }
}

export function getSafeIntegrationDatabaseUrl(): string {
  requireIntegrationMarker();

  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error("Integration test reset refused: DATABASE_URL is missing");
  }

  const url = new URL(raw);
  const databaseName = url.pathname.replace(/^\//, "");
  if (
    !["postgresql:", "postgres:"].includes(url.protocol) ||
    !LOOPBACK_HOSTS.has(url.hostname) ||
    !databaseName.endsWith("_test")
  ) {
    throw new Error(
      `Integration test reset refused for unsafe PostgreSQL target ${url.hostname}/${databaseName}`
    );
  }

  return raw;
}

export function getSafeIntegrationRedisUrl(): string {
  requireIntegrationMarker();

  const raw = process.env.REDIS_URL;
  if (!raw) {
    throw new Error("Integration test reset refused: REDIS_URL is missing");
  }

  const url = new URL(raw);
  const databaseNumber = Number(url.pathname.replace(/^\//, ""));
  if (
    !["redis:", "rediss:"].includes(url.protocol) ||
    !LOOPBACK_HOSTS.has(url.hostname) ||
    !Number.isInteger(databaseNumber) ||
    databaseNumber < 1 ||
    databaseNumber > 15
  ) {
    throw new Error(
      `Integration test reset refused for unsafe Redis target ${url.hostname}${url.pathname || "/0"}`
    );
  }

  return raw;
}
