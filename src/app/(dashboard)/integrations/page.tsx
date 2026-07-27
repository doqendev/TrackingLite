import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { IntegrationsGrid } from "@/components/integrations/integrations-grid";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import {
  resolveWorkspaceInstallType,
  resolveWorkspaceProductMode,
} from "@/lib/workspace-mode";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const t = await getTranslations("integrations");
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const activeWs = await getActiveWorkspace(session.user.id);
  if (!activeWs) redirect("/onboarding");

  let workspace;
  try {
    workspace = await db.workspace.findUnique({
      where: { id: activeWs.id },
      select: {
        id: true,
        productMode: true,
        installType: true,
        // Meta
        metaPixelId: true,
        metaTestEventCode: true,
        metaAccessTokenEncrypted: true,
        enableMeta: true,
        metaBrowserTrackingEnabled: true,
        // TikTok
        tiktokPixelId: true,
        tiktokAccessTokenEncrypted: true,
        enableTikTok: true,
        tiktokBrowserTrackingEnabled: true,
        // GA4
        ga4MeasurementId: true,
        ga4ApiSecretEncrypted: true,
        enableGA4: true,
        // Klaviyo
        klaviyoApiKeyEncrypted: true,
        enableKlaviyo: true,
        // Reddit
        redditAccountId: true,
        redditAccessTokenEncrypted: true,
        enableReddit: true,
        // Pinterest
        pinterestAdAccountId: true,
        pinterestConversionTokenEncrypted: true,
        enablePinterest: true,
        // Google Ads
        googleAdsConversionId: true,
        googleAdsLabelPurchase: true,
        googleAdsLabelAddToCart: true,
        googleAdsLabelInitiateCheckout: true,
        googleAdsLabelViewContent: true,
        enableGoogleAds: true,
         // Shopify Webhook
         shopifyWebhookSecretEncrypted: true,
         shopifyWebhookVerifiedAt: true,
         shopifyWebhookLastReceivedAt: true,
      },
    });
  } catch (error) {
    console.error("Integrations page data fetch failed:", error);
    return (
      <div className="p-6">
        <Card className="w-full">
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Failed to load data. Please try refreshing the page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!workspace) redirect("/onboarding");

  const workspaceForClient = {
    id: workspace.id,
    productMode: resolveWorkspaceProductMode(workspace),
    installType: resolveWorkspaceInstallType(workspace),
    // Meta
    metaPixelId: workspace.metaPixelId,
    metaTestEventCode: workspace.metaTestEventCode,
    hasAccessToken: !!workspace.metaAccessTokenEncrypted,
    enableMeta: workspace.enableMeta,
    metaBrowserTrackingEnabled: workspace.metaBrowserTrackingEnabled,
    // TikTok
    tiktokPixelId: workspace.tiktokPixelId,
    hasTiktokAccessToken: !!workspace.tiktokAccessTokenEncrypted,
    enableTikTok: workspace.enableTikTok,
    tiktokBrowserTrackingEnabled: workspace.tiktokBrowserTrackingEnabled,
    // GA4
    ga4MeasurementId: workspace.ga4MeasurementId,
    hasGA4ApiSecret: !!workspace.ga4ApiSecretEncrypted,
    enableGA4: workspace.enableGA4,
    // Klaviyo
    hasKlaviyoApiKey: !!workspace.klaviyoApiKeyEncrypted,
    enableKlaviyo: workspace.enableKlaviyo,
    // Reddit
    redditAccountId: workspace.redditAccountId,
    hasRedditAccessToken: !!workspace.redditAccessTokenEncrypted,
    enableReddit: workspace.enableReddit,
    // Pinterest
    pinterestAdAccountId: workspace.pinterestAdAccountId,
    hasPinterestConversionToken: !!workspace.pinterestConversionTokenEncrypted,
    enablePinterest: workspace.enablePinterest,
    // Google Ads
    googleAdsConversionId: workspace.googleAdsConversionId,
    googleAdsLabelPurchase: workspace.googleAdsLabelPurchase,
    googleAdsLabelAddToCart: workspace.googleAdsLabelAddToCart,
    googleAdsLabelInitiateCheckout: workspace.googleAdsLabelInitiateCheckout,
    googleAdsLabelViewContent: workspace.googleAdsLabelViewContent,
    enableGoogleAds: workspace.enableGoogleAds,
    // Shopify Webhook
    hasShopifyWebhookSecret: !!workspace.shopifyWebhookSecretEncrypted,
    isShopifyWebhookVerified: !!workspace.shopifyWebhookVerifiedAt,
    shopifyWebhookLastReceivedAt: workspace.shopifyWebhookLastReceivedAt?.toISOString() ?? null,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t("subtitle")}
        </p>
      </div>

      <IntegrationsGrid workspace={workspaceForClient} />
    </div>
  );
}
