import IORedis from "ioredis";
import type { DashboardAnalytics } from "@/types/app";

let redis: IORedis | null = null;

function getRedis(): IORedis {
  if (!redis) {
    redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      lazyConnect: true,
    });
  }
  return redis;
}

const ANALYTICS_CACHE_TTL = 60; // 60 seconds

export async function getCachedAnalytics(
  workspaceId: string,
  computeFn: () => Promise<DashboardAnalytics>
): Promise<DashboardAnalytics> {
  const cacheKey = `analytics:${workspaceId}`;

  try {
    const cached = await getRedis().get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as DashboardAnalytics;
      // Restore Date object for lastEventAt
      if (parsed.health.lastEventAt) {
        parsed.health.lastEventAt = new Date(parsed.health.lastEventAt);
      }
      return parsed;
    }
  } catch {
    // Redis failure: fall through to computation
  }

  const data = await computeFn();

  try {
    await getRedis().setex(
      cacheKey,
      ANALYTICS_CACHE_TTL,
      JSON.stringify(data)
    );
  } catch {
    // Redis failure: return uncached data
  }

  return data;
}

// Export for testing
export { getRedis, ANALYTICS_CACHE_TTL };
