import type { DashboardAnalytics } from "@/types/app";
import { getSharedRedis } from "@/lib/redis";

// Re-exported for backward compatibility (tests import getRedis from this module)
const getRedis = getSharedRedis;

const ANALYTICS_CACHE_TTL = 300; // 5 minutes (up from 60s — survives idle periods)

// Promise coalescing: prevents thundering herd when cache expires
const inflight = new Map<string, Promise<DashboardAnalytics>>();

// Background pre-warming: keep the analytics cache warm so dashboard loads never
// trigger a burst of 35+ DB queries after idle (which correlates with container SIGKILL).
let _preWarmState: {
  cacheKey: string;
  computeFn: () => Promise<DashboardAnalytics>;
} | null = null;

let _preWarmInterval: ReturnType<typeof setInterval> | null = null;

function ensurePreWarm() {
  if (_preWarmInterval) return;
  _preWarmInterval = setInterval(async () => {
    if (!_preWarmState) return;
    const { cacheKey, computeFn } = _preWarmState;
    try {
      const data = await computeFn();
      await getRedis().setex(cacheKey, ANALYTICS_CACHE_TTL, JSON.stringify(data));
    } catch {
      // Pre-warm failed — next request will recompute
    }
  }, 240_000).unref(); // Every 4 minutes (before 5-min TTL expires)
}

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
      // Update pre-warm state even on cache hit (keeps closure fresh)
      _preWarmState = { cacheKey, computeFn };
      ensurePreWarm();
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
      // Register for background pre-warming after successful computation
      _preWarmState = { cacheKey, computeFn };
      ensurePreWarm();
      return data;
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, promise);
  return promise;
}

export { getRedis, ANALYTICS_CACHE_TTL };
