import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { IntegrationsGrid } from "@/components/integrations/integrations-grid";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
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
      // Google Ads
      googleAdsCustomerId: true,
      googleAdsConversionAction: true,
      googleAdsAccessTokenEncrypted: true,
      googleAdsDeveloperToken: true,
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
    // Google Ads
    googleAdsCustomerId: workspace.googleAdsCustomerId,
    googleAdsConversionAction: workspace.googleAdsConversionAction,
    hasGoogleAdsAccessToken: !!workspace.googleAdsAccessTokenEncrypted,
    googleAdsDeveloperToken: workspace.googleAdsDeveloperToken,
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
        <h1 className="text-2xl font-bold text-foreground">Integrations</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Connect your ad platforms and analytics destinations.
        </p>
      </div>

      <IntegrationsGrid workspace={workspaceForClient} />
    </div>
  );
}
