import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import IORedis from "ioredis";

let redis: IORedis | null = null;
function getRedis(): IORedis {
  if (!redis) {
    redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { lazyConnect: true });
  }
  return redis;
}

export async function GET() {
  const health: Record<string, unknown> = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };

  // Check database connection
  try {
    await db.$queryRaw`SELECT 1`;
    health.database = "connected";
  } catch {
    health.database = "disconnected";
    health.status = "degraded";
  }

  // Check Redis connection
  let redisStatus = "connected";
  try {
    await getRedis().ping();
  } catch {
    redisStatus = "disconnected";
  }
  health.redis = redisStatus;
  if (redisStatus === "disconnected") {
    health.status = "degraded";
  }

  const statusCode = health.status === "ok" ? 200 : 503;
  return NextResponse.json(health, { status: statusCode });
}
