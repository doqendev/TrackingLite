import IORedis from "ioredis";
import { RATE_LIMIT } from "./constants";

let redis: IORedis | null = null;

function getRedis(): IORedis {
  if (!redis) {
    redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      lazyConnect: true,
    });
  }
  return redis;
}

export async function checkRateLimit(workspaceId: string): Promise<{ allowed: boolean; remaining: number }> {
  const client = getRedis();
  const key = `ratelimit:ingest:${workspaceId}:${Math.floor(Date.now() / 1000)}`;
  const limit = RATE_LIMIT.INGEST_PER_SECOND_PER_WORKSPACE;

  const current = await client.incr(key);
  if (current === 1) {
    await client.expire(key, 2); // TTL slightly > 1 second for safety
  }

  return {
    allowed: current <= limit,
    remaining: Math.max(0, limit - current),
  };
}
