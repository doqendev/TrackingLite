import { Redis } from "ioredis";
import { db } from "@/lib/db";

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      lazyConnect: true,
    });
  }
  return redis;
}

const CACHE_TTL = 300; // 5 minutes

export async function lookupWorkspaceByApiKey(apiKey: string) {
  const cacheKey = `apikey:${apiKey}`;

  // Try cache first
  const cached = await getRedis().get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // DB lookup
  const workspace = await db.workspace.findUnique({
    where: { apiKey },
    select: {
      id: true,
      userId: true,
      metaPixelId: true,
      metaAccessTokenEncrypted: true,
      consentMode: true,
      enablePageView: true,
      enableViewContent: true,
      enableAddToCart: true,
      enableInitiateCheckout: true,
      enablePurchase: true,
      isActive: true,
    },
  });

  if (workspace) {
    await getRedis().setex(cacheKey, CACHE_TTL, JSON.stringify(workspace));
  }

  return workspace;
}
