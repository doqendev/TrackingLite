import { RATE_LIMIT } from "./constants";
import { createLogger } from "./logger";
import { getSharedRedis } from "@/lib/redis";

const log = createLogger({ component: "rate-limit" });

export async function checkAuthRateLimit(
  ip: string,
  endpoint: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; retryAfter?: number }> {
  try {
    const client = getSharedRedis();
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
    log.warn("Auth rate-limit Redis unavailable, failing open", { error: error instanceof Error ? error.message : String(error) });
    return { allowed: true };
  }
}

export async function checkRateLimit(workspaceId: string): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const client = getSharedRedis();
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
    log.warn("Ingest rate-limit Redis unavailable, failing open", { error: error instanceof Error ? error.message : String(error) });
    return {
      allowed: true,
      remaining: RATE_LIMIT.INGEST_PER_SECOND_PER_WORKSPACE,
    };
  }
}
