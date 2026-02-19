import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SettingsForm } from "@/components/settings/settings-form";
import { AlertPreferences } from "@/components/settings/alert-preferences";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [workspace, user] = await Promise.all([
    db.workspace.findFirst({
      where: { userId: session.user.id, isActive: true },
      select: {
        id: true,
        name: true,
        domain: true,
        consentMode: true,
        enablePageView: true,
        enableViewContent: true,
        enableAddToCart: true,
        enableInitiateCheckout: true,
        enablePurchase: true,
        apiKey: true,
        isActive: true,
      },
    }),
    db.user.findUnique({
      where: { id: session.user.id },
      select: { displayCurrency: true, language: true },
    }),
  ]);

  if (!workspace) redirect("/onboarding");

  const workspaceForClient = {
    id: workspace.id,
    consentMode: workspace.consentMode,
    enablePageView: workspace.enablePageView,
    enableViewContent: workspace.enableViewContent,
    enableAddToCart: workspace.enableAddToCart,
    enableInitiateCheckout: workspace.enableInitiateCheckout,
    enablePurchase: workspace.enablePurchase,
    apiKey: workspace.apiKey,
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
