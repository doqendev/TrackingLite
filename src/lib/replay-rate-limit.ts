import { getSharedRedis } from "@/lib/redis";

const COOLDOWN_SECONDS = 300; // 5 minutes

export async function checkReplayCooldown(
  workspaceId: string
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const key = `replay-cooldown:${workspaceId}`;
  const r = getSharedRedis();
  const existing = await r.get(key);
  if (existing) {
    const ttl = await r.ttl(key);
    return { allowed: false, retryAfter: ttl > 0 ? ttl : COOLDOWN_SECONDS };
  }
  await r.setex(key, COOLDOWN_SECONDS, "1");
  return { allowed: true };
}
