import { RATE_LIMIT } from "./constants";
import { createLogger } from "./logger";
import { getSharedRedis } from "@/lib/redis";

const log = createLogger({ component: "rate-limit" });
const CONSENT_REVOCATION_RATE_LIMIT_SCRIPT = `
local minuteCount = redis.call("INCR", KEYS[1])
if minuteCount == 1 then redis.call("EXPIRE", KEYS[1], tonumber(ARGV[1])) end
local dayCount = redis.call("INCR", KEYS[2])
if dayCount == 1 then redis.call("EXPIRE", KEYS[2], tonumber(ARGV[2])) end
return { minuteCount, dayCount }
`;
const MINUTE_MS = 60 * 1_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

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
 * Consent deletion traffic has its own bounded budget. It must not compete
 * with commerce-event delivery, but the public pixel API key must not permit
 * unbounded creation of long-lived Redis tombstones.
 */
export async function checkConsentRevocationRateLimit(
  workspaceId: string
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const now = Date.now();
  const minute = Math.floor(now / MINUTE_MS);
  const day = Math.floor(now / DAY_MS);
  const minuteKey = `ratelimit:consent-revocation:minute:${workspaceId}:${minute}`;
  const dayKey = `ratelimit:consent-revocation:day:${workspaceId}:${day}`;

  try {
    const result = await getSharedRedis().eval(
      CONSENT_REVOCATION_RATE_LIMIT_SCRIPT,
      2,
      minuteKey,
      dayKey,
      "120",
      "172800"
    );
    if (!Array.isArray(result) || result.length !== 2) {
      throw new Error("invalid consent revocation rate-limit result");
    }
    const minuteCount = Number(result[0]);
    const dayCount = Number(result[1]);
    if (!Number.isFinite(minuteCount) || !Number.isFinite(dayCount)) {
      throw new Error("invalid consent revocation rate-limit counters");
    }
    if (dayCount > RATE_LIMIT.CONSENT_REVOCATIONS_PER_DAY_PER_WORKSPACE) {
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((DAY_MS - (now % DAY_MS)) / 1_000)),
      };
    }
    if (minuteCount > RATE_LIMIT.CONSENT_REVOCATIONS_PER_MINUTE_PER_WORKSPACE) {
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((MINUTE_MS - (now % MINUTE_MS)) / 1_000)),
      };
    }
    return { allowed: true };
  } catch {
    // The deletion operation also depends on Redis. Fail closed so the client
    // retains its durable revocation and retries instead of receiving a false
    // acknowledgement while abuse controls are unavailable.
    log.warn("Consent revocation rate limiter unavailable; failing closed");
    throw new Error("Consent revocation rate limiter unavailable");
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
