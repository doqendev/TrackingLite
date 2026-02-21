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
      // Google Ads fields
      enableGoogleAds: true,
      googleAdsConversionIdEncrypted: true,
      googleAdsConversionIdIv: true,
      googleAdsConversionIdTag: true,
      googleAdsViewContentLabelEncrypted: true,
      googleAdsViewContentLabelIv: true,
      googleAdsViewContentLabelTag: true,
      googleAdsAddToCartLabelEncrypted: true,
      googleAdsAddToCartLabelIv: true,
      googleAdsAddToCartLabelTag: true,
      googleAdsCheckoutLabelEncrypted: true,
      googleAdsCheckoutLabelIv: true,
      googleAdsCheckoutLabelTag: true,
      googleAdsPurchaseLabelEncrypted: true,
      googleAdsPurchaseLabelIv: true,
      googleAdsPurchaseLabelTag: true,
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
