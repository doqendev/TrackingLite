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

/**
 * Tighter rate limit specifically for Purchase events to prevent billing manipulation.
 * Max 10 Purchase events per minute per workspace.
 */
export async function checkPurchaseRateLimit(workspaceId: string): Promise<{ allowed: boolean }> {
  try {
    const minute = Math.floor(Date.now() / 60000);
    const key = `purchase-rl:${workspaceId}:${minute}`;
    const r = getSharedRedis();
    const count = await r.incr(key);
    if (count === 1) {
      await r.expire(key, 120); // 2min TTL for safety
    }
    return { allowed: count <= 10 };
  } catch {
    return { allowed: true }; // Fail open
  }
}
