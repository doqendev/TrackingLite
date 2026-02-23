import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import IORedis from "ioredis";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let dbStatus: "connected" | "disconnected" = "connected";
  let redisStatus: "connected" | "disconnected" = "connected";

  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "disconnected";
  }

  let redisClient: IORedis | null = null;
  try {
    redisClient = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
    });
    await redisClient.ping();
  } catch {
    redisStatus = "disconnected";
  } finally {
    redisClient?.disconnect();
  }

  const overall = dbStatus === "connected" && redisStatus === "connected" ? "ok" : "degraded";

  return NextResponse.json({
    status: overall,
    database: dbStatus,
    redis: redisStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}
