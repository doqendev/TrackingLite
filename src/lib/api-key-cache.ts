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
      isActive: true,
      // Meta fields
      metaPixelId: true,
      metaAccessTokenEncrypted: true,
      metaAccessTokenIv: true,
      metaAccessTokenTag: true,
      metaTestEventCode: true,
      enableMeta: true,
      // TikTok fields
      enableTikTok: true,
      tiktokPixelId: true,
      tiktokAccessTokenEncrypted: true,
      tiktokAccessTokenIv: true,
      tiktokAccessTokenTag: true,
      // GA4 fields
      enableGA4: true,
      ga4MeasurementId: true,
      ga4ApiSecretEncrypted: true,
      ga4ApiSecretIv: true,
      ga4ApiSecretTag: true,
      // Klaviyo fields
      enableKlaviyo: true,
      klaviyoApiKeyEncrypted: true,
      klaviyoApiKeyIv: true,
      klaviyoApiKeyTag: true,
      // Reddit fields
      enableReddit: true,
      redditAccountId: true,
      redditAccessTokenEncrypted: true,
      redditAccessTokenIv: true,
      redditAccessTokenTag: true,
      // Pinterest fields
      enablePinterest: true,
      pinterestAdAccountId: true,
      pinterestConversionTokenEncrypted: true,
      pinterestConversionTokenIv: true,
      pinterestConversionTokenTag: true,
      // Event toggles and consent
      consentMode: true,
      enablePageView: true,
      enableViewContent: true,
      enableAddToCart: true,
      enableInitiateCheckout: true,
      enablePurchase: true,
    },
  });

  if (workspace) {
    await getRedis().setex(cacheKey, CACHE_TTL, JSON.stringify(workspace));
  }

  return workspace;
}

export async function invalidateApiKeyCache(apiKey: string): Promise<void> {
  await getRedis().del(`apikey:${apiKey}`);
}
