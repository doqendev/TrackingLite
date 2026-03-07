import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { SettingsForm } from "@/components/settings/settings-form";
import { AlertPreferences } from "@/components/settings/alert-preferences";

export const dynamic = "force-dynamic";

export default async function PnSettingsPage() {
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
  } catch {
    return (
      <div>
        <p className="pn-text-red" style={{ fontSize: "0.8rem" }}>
          {"// ERROR: FAILED TO LOAD SETTINGS"}
        </p>
      </div>
    );
  }

  if (!workspace) redirect("/onboarding");

  const workspaceForClient = {
    id: workspace.id,
    consentMode: workspace.consentMode,
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
    <div>
      {/* Header */}
      <div className="pn-dash-section-header">
        <div>
          <span className="pn-ref-label">* CONFIGURATION // SETTINGS</span>
          <div className="pn-dash-section-title" style={{ marginTop: 4 }}>Settings</div>
          <span className="pn-text-dim" style={{ fontSize: "0.7rem" }}>
            WORKSPACE: {workspace.name}
            {workspace.domain && <span>{" // "}{workspace.domain}</span>}
          </span>
        </div>
      </div>

      {/* Reuse existing settings form -- it handles all destination cards, toggles, etc. */}
      <div className="pn-dash-mb">
        <SettingsForm workspace={workspaceForClient} userPreferences={userPreferences} />
      </div>

      <div className="pn-dash-section-header">
        <div>
          <span className="pn-ref-label">* ALERT_CONFIG // NOTIFICATIONS</span>
          <div className="pn-dash-section-title" style={{ marginTop: 4 }}>Alert Preferences</div>
        </div>
      </div>
      <AlertPreferences />
    </div>
  );
}
