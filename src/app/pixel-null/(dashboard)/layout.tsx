import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Chakra_Petch, Space_Mono } from "next/font/google";
import { PnSidebar } from "@/components/pixel-null/dashboard/pn-sidebar";
import { getActiveWorkspace, getAllWorkspaces } from "@/lib/active-workspace";
import { BILLING_PLANS } from "@/lib/constants";
import "../pixel-null.css";

const chakraPetch = Chakra_Petch({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--pn-font-display",
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--pn-font-mono",
  display: "swap",
});

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function PnDashboardLayout({ children }: { children: React.ReactNode }) {
  let session;
  try {
    session = await auth();
  } catch {
    redirect("/login");
  }
  if (!session?.user?.id) redirect("/login");

  let activeWorkspace, workspaces, subscription;
  try {
    [activeWorkspace, workspaces, subscription] = await Promise.all([
      getActiveWorkspace(session.user.id),
      getAllWorkspaces(session.user.id),
      db.subscription.findUnique({
        where: { userId: session.user.id },
        select: { plan: true },
      }),
    ]);
  } catch {
    return (
      <div className={`pixel-null-page ${chakraPetch.variable} ${spaceMono.variable}`}>
        <div className="pn-grid-bg" />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: "0.8rem", color: "var(--pn-accent-danger)" }}>
              {"// SYSTEM_ERROR: UNABLE TO LOAD DASHBOARD"}
            </p>
            <p className="pn-text-dim" style={{ fontSize: "0.7rem", marginTop: 8 }}>
              PLEASE REFRESH THE PAGE
            </p>
          </div>
        </div>
      </div>
    );
  }

  const userEmail = session.user.email ?? "";
  const workspaceName = activeWorkspace?.name ?? null;
  const plan = (subscription?.plan ?? "FREE") as keyof typeof BILLING_PLANS;
  const maxWorkspaces = BILLING_PLANS[plan]?.maxWorkspaces ?? 1;
  const canAddStore = (workspaces ?? []).length < maxWorkspaces;

  return (
    <div className={`pixel-null-page ${chakraPetch.variable} ${spaceMono.variable}`}>
      <div className="pn-grid-bg" />
      <div className="pn-dash-layout">
        <PnSidebar
          userEmail={userEmail}
          workspaceName={workspaceName}
          workspaces={workspaces ?? []}
          activeWorkspaceId={activeWorkspace?.id ?? ""}
          canAddStore={canAddStore}
        />
        <main className="pn-dash-content">
          {children}
        </main>
      </div>
    </div>
  );
}
