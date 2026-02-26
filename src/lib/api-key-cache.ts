import { db } from "@/lib/db";
import { getSharedRedis } from "@/lib/redis";

const CACHE_TTL = 300; // 5 minutes

export async function lookupWorkspaceByApiKey(apiKey: string) {
  const cacheKey = `apikey:${apiKey}`;

  // Try Redis cache first
  try {
    const cached = await getSharedRedis().get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // Redis unavailable or corrupted data, fall through to DB
  }

  // DB lookup — fetch only non-sensitive fields needed by the ingest route.
  // Encrypted credential triplets (*Encrypted/*Iv/*Tag) are intentionally
  // excluded from the cached object to avoid storing secrets in Redis.
  // The raw encrypted fields are fetched transiently to compute boolean
  // "has credentials" flags, then discarded before caching.
  // Workers do their own DB lookups for the actual credentials.
  const workspace = await db.workspace.findUnique({
    where: { apiKey },
    select: {
      id: true,
      userId: true,
      isActive: true,
      // Meta
      metaPixelId: true,
      metaTestEventCode: true,
      enableMeta: true,
      metaAccessTokenEncrypted: true,
      // TikTok
      enableTikTok: true,
      tiktokPixelId: true,
      tiktokAccessTokenEncrypted: true,
      // GA4
      enableGA4: true,
      ga4MeasurementId: true,
      ga4ApiSecretEncrypted: true,
      // Klaviyo
      enableKlaviyo: true,
      klaviyoApiKeyEncrypted: true,
      // Reddit
      enableReddit: true,
      redditAccountId: true,
      redditAccessTokenEncrypted: true,
      // Pinterest
      enablePinterest: true,
      pinterestAdAccountId: true,
      pinterestConversionTokenEncrypted: true,
      // Shopify webhook
      shopifyWebhookSecretEncrypted: true,
      // Event toggles and consent
      consentMode: true,
      enablePageView: true,
      enableViewContent: true,
      enableAddToCart: true,
      enableInitiateCheckout: true,
      enablePurchase: true,
    },
  });

  if (!workspace) {
    return null;
  }

  // Compute boolean "has credentials" flags, then strip all encrypted values
  // before caching so secrets never land in Redis.
  const {
    metaAccessTokenEncrypted,
    tiktokAccessTokenEncrypted,
    ga4ApiSecretEncrypted,
    klaviyoApiKeyEncrypted,
    redditAccessTokenEncrypted,
    pinterestConversionTokenEncrypted,
    shopifyWebhookSecretEncrypted,
    ...rest
  } = workspace;

  const sanitized = {
    ...rest,
    hasMetaCredentials: !!(workspace.enableMeta && workspace.metaPixelId && metaAccessTokenEncrypted),
    hasTikTokCredentials: !!(workspace.enableTikTok && workspace.tiktokPixelId && tiktokAccessTokenEncrypted),
    hasGA4Credentials: !!(workspace.enableGA4 && workspace.ga4MeasurementId && ga4ApiSecretEncrypted),
    hasKlaviyoCredentials: !!(workspace.enableKlaviyo && klaviyoApiKeyEncrypted),
    hasRedditCredentials: !!(workspace.enableReddit && redditAccessTokenEncrypted),
    hasPinterestCredentials: !!(workspace.enablePinterest && pinterestConversionTokenEncrypted),
    hasShopifyWebhookSecret: !!shopifyWebhookSecretEncrypted,
  };

  try {
    await getSharedRedis().setex(cacheKey, CACHE_TTL, JSON.stringify(sanitized));
  } catch {
    // Best-effort cache write, ignore failures
  }

  return sanitized;
}

export async function invalidateApiKeyCache(apiKey: string): Promise<void> {
  try {
    await getSharedRedis().del(`apikey:${apiKey}`);
  } catch {
    // Best-effort cache invalidation
  }
}
