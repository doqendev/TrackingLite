import type { DashboardAnalytics } from "@/types/app";
import { getSharedRedis } from "@/lib/redis";

// Re-exported for backward compatibility (tests import getRedis from this module)
const getRedis = getSharedRedis;

const ANALYTICS_CACHE_TTL = 60; // 60 seconds

// Promise coalescing: prevents thundering herd when cache expires
const inflight = new Map<string, Promise<DashboardAnalytics>>();

export async function getCachedAnalytics(
  workspaceId: string,
  computeFn: () => Promise<DashboardAnalytics>,
  displayCurrency?: string
): Promise<DashboardAnalytics> {
  const currPart = displayCurrency || "default";
  const cacheKey = `analytics:${workspaceId}:${currPart}`;

  try {
    const cached = await getRedis().get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as DashboardAnalytics;
      if (parsed.health.lastEventAt) {
        parsed.health.lastEventAt = new Date(parsed.health.lastEventAt);
      }
      return parsed;
    }
  } catch {
    // Redis failure: fall through to computation
  }

  // If another request is already computing this key, wait for it
  const pending = inflight.get(cacheKey);
  if (pending) return pending;

  // Start computation and store the promise
  const promise = (async () => {
    try {
      const data = await computeFn();
      try {
        await getRedis().setex(cacheKey, ANALYTICS_CACHE_TTL, JSON.stringify(data));
      } catch {
        // Redis failure: return uncached data
      }
      return data;
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, promise);
  return promise;
}

export { getRedis, ANALYTICS_CACHE_TTL };
