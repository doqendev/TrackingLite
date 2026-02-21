import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Queue } from "bullmq";
import IORedis from "ioredis";

let redis: IORedis | null = null;
function getRedis(): IORedis {
  if (!redis) {
    redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { lazyConnect: true });
  }
  return redis;
}

const QUEUE_NAMES = [
  "meta-events",
  "tiktok-events",
  "ga4-events",
  "klaviyo-events",
  "reddit-events",
  "pinterest-events",
  "event-log-cleanup",
];

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

  // Queue depth metrics (only if Redis is connected)
  if (redisStatus === "connected") {
    const queueMetrics: Record<string, unknown> = {};

    await Promise.all(
      QUEUE_NAMES.map(async (name) => {
        try {
          const queue = new Queue(name, { connection: getRedis() as never });
          const [waiting, active, delayed, failed] = await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getDelayedCount(),
            queue.getFailedCount(),
          ]);
          queueMetrics[name] = { waiting, active, delayed, failed };
          await queue.close();
        } catch {
          queueMetrics[name] = "unavailable";
        }
      })
    );

    health.queues = queueMetrics;
  }

  const statusCode = health.status === "ok" ? 200 : 503;
  return NextResponse.json(health, { status: statusCode });
}
