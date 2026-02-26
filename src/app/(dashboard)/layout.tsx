import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import { SidebarNav, SidebarFooter, MobileNav } from "@/components/dashboard/sidebar-nav";
import { WorkspaceSwitcher } from "@/components/dashboard/workspace-switcher";
import { getActiveWorkspace, getAllWorkspaces } from "@/lib/active-workspace";
import { BILLING_PLANS } from "@/lib/constants";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
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
  } catch (error) {
    console.error("Dashboard layout data fetch failed:", error);
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <h2 className="text-xl font-semibold">Unable to load dashboard</h2>
          <p className="text-muted-foreground">Please try refreshing the page.</p>
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
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r border-white/[0.06] bg-gradient-to-b from-card/60 to-card/40 backdrop-blur-md">
        <div className="flex h-14 items-center px-6 border-b border-white/[0.08]">
          <Link href="/dashboard" className="text-lg font-semibold text-foreground tracking-tight">
            <span className="text-brand-500">Track</span>&thinsp;Clear
          </Link>
        </div>
        {(workspaces ?? []).length > 0 && activeWorkspace && (
          <div className="px-3 pt-3">
            <WorkspaceSwitcher
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspace.id}
              canAddStore={canAddStore}
            />
          </div>
        )}
        <SidebarNav userEmail={userEmail} workspaceName={workspaceName} />
        <SidebarFooter userEmail={userEmail} workspaceName={workspaceName} />
      </aside>

      {/* Mobile header */}
      <MobileNav userEmail={userEmail} workspaceName={workspaceName} />

      {/* Main content */}
      <main className="flex-1 overflow-y-auto md:pt-0 pt-14">
        <div className="p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
