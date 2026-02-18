import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import { SidebarNav, SidebarFooter, MobileNav } from "@/components/dashboard/sidebar-nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const workspace = await db.workspace.findFirst({
    where: { userId: session.user.id, isActive: true },
    select: { id: true, name: true },
  });

  const userEmail = session.user.email ?? "";
  const workspaceName = workspace?.name ?? null;

  return (
    <div className="flex h-screen bg-muted">
      {/* Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r border-white/[0.06] bg-card/50 backdrop-blur-md">
        <div className="flex h-14 items-center px-6 border-b border-white/[0.06]">
          <Link href="/dashboard" className="text-lg font-semibold text-foreground tracking-tight">
            <span className="text-brand-500">T</span>rackingLite
          </Link>
        </div>
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
