import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import { SidebarNav, SidebarFooter, MobileNav } from "@/components/dashboard/sidebar-nav";
import { WorkspaceSwitcher } from "@/components/dashboard/workspace-switcher";
import { getActiveWorkspace, getAllWorkspaces } from "@/lib/active-workspace";
import { BILLING_PLANS } from "@/lib/constants";
import { isAdminUser } from "@/lib/admin";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let session;
  try {
    session = await auth();
  } catch (error) {
    process.stderr.write(`[LAYOUT] auth() threw: ${error instanceof Error ? error.message : String(error)}\n`);
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
  } catch (error) {
    process.stderr.write(`[LAYOUT] Dashboard data fetch failed: ${error instanceof Error ? error.stack : String(error)}\n`);
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
  const isAdmin = isAdminUser(userEmail);

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r border-[hsl(240,26%,15%)] bg-card">
        <div className="flex h-14 items-center gap-2.5 px-5 border-b border-[hsl(240,26%,15%)]">
          <img src="/logo.png" alt="" width={22} height={22} className="w-[22px] h-[22px]" />
          <Link href="/dashboard" className="font-display font-bold text-foreground tracking-widest text-sm">
            <span className="text-cyan-500">TRACK</span> {"// "}CLEAR
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
        <SidebarNav userEmail={userEmail} workspaceName={workspaceName} isAdmin={isAdmin} />
        <SidebarFooter userEmail={userEmail} workspaceName={workspaceName} />
      </aside>

      {/* Mobile header */}
      <MobileNav userEmail={userEmail} workspaceName={workspaceName} isAdmin={isAdmin} />

      {/* Main content */}
      <main className="flex-1 overflow-y-auto md:pt-0 pt-14 bg-grid-cyan">
        <div className="p-6 md:px-10 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
