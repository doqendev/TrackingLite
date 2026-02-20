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

export async function checkAuthRateLimit(
  ip: string,
  endpoint: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; retryAfter?: number }> {
  try {
    const client = getRedis();
    const key = `auth-rl:${endpoint}:${ip}`;

    const current = await client.incr(key);
    if (current === 1) {
      await client.expire(key, windowSeconds);
    }

    if (current > maxRequests) {
      const ttl = await client.ttl(key);
      return { allowed: false, retryAfter: ttl > 0 ? ttl : windowSeconds };
    }

    return { allowed: true };
  } catch (error) {
    console.warn("[auth-rate-limit] Redis unavailable, failing open:", error instanceof Error ? error.message : String(error));
    return { allowed: true };
  }
}

export async function checkRateLimit(workspaceId: string): Promise<{ allowed: boolean; remaining: number }> {
  try {
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
  } catch (error) {
    console.warn("[rate-limit] Redis unavailable, failing open:", error instanceof Error ? error.message : String(error));
    return {
      allowed: true,
      remaining: RATE_LIMIT.INGEST_PER_SECOND_PER_WORKSPACE,
    };
  }
}
