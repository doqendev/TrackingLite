import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SettingsForm } from "@/components/settings/settings-form";
import { AlertPreferences } from "@/components/settings/alert-preferences";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const workspace = await db.workspace.findFirst({
    where: { userId: session.user.id, isActive: true },
    select: {
      id: true,
      name: true,
      domain: true,
      metaPixelId: true,
      metaTestEventCode: true,
      metaAccessTokenEncrypted: true,
      consentMode: true,
      enablePageView: true,
      enableViewContent: true,
      enableAddToCart: true,
      enableInitiateCheckout: true,
      enablePurchase: true,
      apiKey: true,
      isActive: true,
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

  // Only pass the fields the client component expects; never send raw encrypted tokens
  const workspaceForClient = {
    id: workspace.id,
    metaPixelId: workspace.metaPixelId,
    metaTestEventCode: workspace.metaTestEventCode,
    // Communicate whether a token is already stored without leaking its value
    hasAccessToken: !!workspace.metaAccessTokenEncrypted,
    consentMode: workspace.consentMode,
    enablePageView: workspace.enablePageView,
    enableViewContent: workspace.enableViewContent,
    enableAddToCart: workspace.enableAddToCart,
    enableInitiateCheckout: workspace.enableInitiateCheckout,
    enablePurchase: workspace.enablePurchase,
    apiKey: workspace.apiKey,
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
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your workspace configuration for{" "}
          <span className="font-medium text-foreground">{workspace.name}</span>
          {workspace.domain && (
            <span className="text-muted-foreground"> &middot; {workspace.domain}</span>
          )}
        </p>
      </div>

      <SettingsForm workspace={workspaceForClient} />
      <AlertPreferences />
    </div>
  );
}
