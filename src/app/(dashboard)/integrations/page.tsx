import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { IntegrationsGrid } from "@/components/integrations/integrations-grid";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const t = await getTranslations("integrations");
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const workspace = await db.workspace.findFirst({
    where: { userId: session.user.id, isActive: true },
    select: {
      id: true,
      // Meta
      metaPixelId: true,
      metaTestEventCode: true,
      metaAccessTokenEncrypted: true,
      enableMeta: true,
      // Google Ads
      googleAdsConversionIdEncrypted: true,
      googleAdsViewContentLabelEncrypted: true,
      googleAdsAddToCartLabelEncrypted: true,
      googleAdsCheckoutLabelEncrypted: true,
      googleAdsPurchaseLabelEncrypted: true,
      enableGoogleAds: true,
      // TikTok
      tiktokPixelId: true,
      tiktokAccessTokenEncrypted: true,
      enableTikTok: true,
      // GA4
      ga4MeasurementId: true,
      ga4ApiSecretEncrypted: true,
      enableGA4: true,
      // Klaviyo
      klaviyoApiKeyEncrypted: true,
      enableKlaviyo: true,
    },
  });

  if (!workspace) redirect("/onboarding");

  const workspaceForClient = {
    id: workspace.id,
    // Meta
    metaPixelId: workspace.metaPixelId,
    metaTestEventCode: workspace.metaTestEventCode,
    hasAccessToken: !!workspace.metaAccessTokenEncrypted,
    enableMeta: workspace.enableMeta,
    // Google Ads — pass boolean flags only, never expose encrypted values to client
    hasGoogleAdsConversionId: !!workspace.googleAdsConversionIdEncrypted,
    hasGoogleAdsViewContentLabel: !!workspace.googleAdsViewContentLabelEncrypted,
    hasGoogleAdsAddToCartLabel: !!workspace.googleAdsAddToCartLabelEncrypted,
    hasGoogleAdsCheckoutLabel: !!workspace.googleAdsCheckoutLabelEncrypted,
    hasGoogleAdsPurchaseLabel: !!workspace.googleAdsPurchaseLabelEncrypted,
    enableGoogleAds: workspace.enableGoogleAds,
    // TikTok
    tiktokPixelId: workspace.tiktokPixelId,
    hasTiktokAccessToken: !!workspace.tiktokAccessTokenEncrypted,
    enableTikTok: workspace.enableTikTok,
    // GA4
    ga4MeasurementId: workspace.ga4MeasurementId,
    hasGA4ApiSecret: !!workspace.ga4ApiSecretEncrypted,
    enableGA4: workspace.enableGA4,
    // Klaviyo
    hasKlaviyoApiKey: !!workspace.klaviyoApiKeyEncrypted,
    enableKlaviyo: workspace.enableKlaviyo,
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
