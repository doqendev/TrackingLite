import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { SettingsForm } from "@/components/settings/settings-form";
import { AlertPreferences } from "@/components/settings/alert-preferences";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const activeWs = await getActiveWorkspace(session.user.id);
  if (!activeWs) redirect("/onboarding");

  let workspace, user;
  try {
    [workspace, user] = await Promise.all([
      db.workspace.findUnique({
        where: { id: activeWs.id },
        select: {
          id: true,
          name: true,
          domain: true,
          consentMode: true,
          catalogIdMode: true,
          catalogIdPrefix: true,
          catalogIdSuffix: true,
          catalogIdTemplate: true,
          enablePageView: true,
          enableViewContent: true,
          enableAddToCart: true,
          enableInitiateCheckout: true,
          enablePurchase: true,
          isActive: true,
        },
      }),
      db.user.findUnique({
        where: { id: session.user.id },
        select: { displayCurrency: true, language: true },
      }),
    ]);
  } catch (error) {
    console.error("Settings page data fetch failed:", error);
    return (
      <div className="p-6">
        <Card>
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
    consentMode: workspace.consentMode,
    catalogIdMode: workspace.catalogIdMode,
    catalogIdPrefix: workspace.catalogIdPrefix,
    catalogIdSuffix: workspace.catalogIdSuffix,
    catalogIdTemplate: workspace.catalogIdTemplate,
    enablePageView: workspace.enablePageView,
    enableViewContent: workspace.enableViewContent,
    enableAddToCart: workspace.enableAddToCart,
    enableInitiateCheckout: workspace.enableInitiateCheckout,
    enablePurchase: workspace.enablePurchase,
  };

  const userPreferences = {
    displayCurrency: user?.displayCurrency ?? "USD",
    language: user?.language ?? "en",
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

      <SettingsForm workspace={workspaceForClient} userPreferences={userPreferences} />
      <AlertPreferences />
    </div>
  );
}
