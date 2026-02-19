import IORedis from "ioredis";

let redis: IORedis | null = null;

function getRedis(): IORedis {
  if (!redis) {
    redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      lazyConnect: true,
    });
  }
  return redis;
}

const COOLDOWN_SECONDS = 300; // 5 minutes

export async function checkReplayCooldown(
  workspaceId: string
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const key = `replay-cooldown:${workspaceId}`;
  const r = getRedis();
  const existing = await r.get(key);
  if (existing) {
    const ttl = await r.ttl(key);
    return { allowed: false, retryAfter: ttl > 0 ? ttl : COOLDOWN_SECONDS };
  }
  await r.setex(key, COOLDOWN_SECONDS, "1");
  return { allowed: true };
}
