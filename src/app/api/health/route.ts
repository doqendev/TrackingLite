import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSharedRedis } from "@/lib/redis";

export async function GET() {
  let dbStatus: "connected" | "disconnected" = "connected";
  let redisStatus: "connected" | "disconnected" = "connected";

  // Check PostgreSQL with timeout
  try {
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]);
  } catch {
    dbStatus = "disconnected";
  }

  // Check Redis with timeout
  try {
    await Promise.race([
      getSharedRedis().ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]);
  } catch {
    redisStatus = "disconnected";
  }

  const overall = dbStatus === "connected" && redisStatus === "connected" ? "ok" : "degraded";

  // ALWAYS return 200 — Railway restarts on non-200 health checks.
  // Use "status" field for monitoring tools to detect degradation.
  return NextResponse.json({
    status: overall,
    database: dbStatus,
    redis: redisStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}
