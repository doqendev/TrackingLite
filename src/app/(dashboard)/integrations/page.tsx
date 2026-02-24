import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { IntegrationsGrid } from "@/components/integrations/integrations-grid";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const t = await getTranslations("integrations");
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const activeWs = await getActiveWorkspace(session.user.id);
  if (!activeWs) redirect("/onboarding");

  const workspace = await db.workspace.findUnique({
    where: { id: activeWs.id },
    select: {
      id: true,
      // Meta
      metaPixelId: true,
      metaTestEventCode: true,
      metaAccessTokenEncrypted: true,
      enableMeta: true,
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
      // Reddit
      redditAccountId: true,
      redditAccessTokenEncrypted: true,
      enableReddit: true,
      // Pinterest
      pinterestAdAccountId: true,
      pinterestConversionTokenEncrypted: true,
      enablePinterest: true,
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
    // Reddit
    redditAccountId: workspace.redditAccountId,
    hasRedditAccessToken: !!workspace.redditAccessTokenEncrypted,
    enableReddit: workspace.enableReddit,
    // Pinterest
    pinterestAdAccountId: workspace.pinterestAdAccountId,
    hasPinterestConversionToken: !!workspace.pinterestConversionTokenEncrypted,
    enablePinterest: workspace.enablePinterest,
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
