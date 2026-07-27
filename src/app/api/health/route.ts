import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  assertDeploymentDatabaseIdentityMatchesExpected,
  readDeploymentDatabaseIdentity,
  readExpectedDeploymentDatabaseIdentity,
} from "@/lib/deployment-database-identity";
import { assertTrackingDeploymentSchemaReady } from "@/lib/deployment-schema";
import {
  assertRailwayProductionReleaseApproved,
  assertVercelProductionRuntimeReleaseApproved,
  shouldAssertRailwayProductionRelease,
  shouldAssertVercelProductionSchema,
} from "@/lib/production-release-gate";
import { getSharedRedis } from "@/lib/redis";

// MUST be dynamic: Next.js was caching health responses at build time.
export const dynamic = "force-dynamic";

export async function GET() {
  let dbStatus: "connected" | "disconnected" = "connected";
  let schemaStatus: "ready" | "unready" = "unready";
  let redisStatus: "connected" | "disconnected" = "connected";
  let releaseStatus: "approved" | "not-applicable" | "rejected" =
    "not-applicable";

  try {
    const isRailwayRuntime = shouldAssertRailwayProductionRelease(process.env);
    const mustEvaluateVercelRelease =
      process.env.NODE_ENV === "production" ||
      Boolean(process.env.VERCEL?.trim()) ||
      Boolean(process.env.VERCEL_ENV?.trim());
    let mustAssertDatabaseIdentity = false;

    if (isRailwayRuntime) {
      assertRailwayProductionReleaseApproved(process.env);
      mustAssertDatabaseIdentity = true;
    } else if (
      mustEvaluateVercelRelease &&
      shouldAssertVercelProductionSchema(process.env)
    ) {
      assertVercelProductionRuntimeReleaseApproved(process.env);
      mustAssertDatabaseIdentity = true;
    }

    if (mustAssertDatabaseIdentity) {
      assertDeploymentDatabaseIdentityMatchesExpected(
        await readDeploymentDatabaseIdentity(db),
        readExpectedDeploymentDatabaseIdentity(process.env)
      );
      releaseStatus = "approved";
    }
  } catch {
    releaseStatus = "rejected";
  }

  try {
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 3000)
      ),
    ]);
  } catch {
    dbStatus = "disconnected";
  }

  if (dbStatus === "connected") {
    try {
      await Promise.race([
        assertTrackingDeploymentSchemaReady(db),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 3000)
        ),
      ]);
      schemaStatus = "ready";
    } catch {
      schemaStatus = "unready";
    }
  }

  try {
    await Promise.race([
      getSharedRedis().ping(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 3000)
      ),
    ]);
  } catch {
    redisStatus = "disconnected";
  }

  const overall =
    dbStatus === "connected" &&
    schemaStatus === "ready" &&
    redisStatus === "connected" &&
    releaseStatus !== "rejected"
      ? "ok"
      : "degraded";

  const mem = process.memoryUsage();
  const memMB = {
    rss: Math.round(mem.rss / 1024 / 1024),
    heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    external: Math.round(mem.external / 1024 / 1024),
  };

  console.log(
    `[health] mem rss=${memMB.rss}MB heap=${memMB.heapUsed}/${memMB.heapTotal}MB uptime=${Math.round(process.uptime())}s`
  );

  // Deployment health must fail closed when dependencies or schema are not ready.
  return NextResponse.json(
    {
      status: overall,
      database: dbStatus,
      schema: schemaStatus,
      redis: redisStatus,
      release: releaseStatus,
      memory: memMB,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      platform: process.env.VERCEL ? "vercel" : "railway",
      commit: (
        process.env.RAILWAY_GIT_COMMIT_SHA ||
        process.env.VERCEL_GIT_COMMIT_SHA ||
        "local"
      ),
    },
    {
      status: overall === "ok" ? 200 : 503,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    }
  );
}
