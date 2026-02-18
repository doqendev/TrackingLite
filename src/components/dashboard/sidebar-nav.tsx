"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ClipboardList, Settings, CreditCard, Menu, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/events", label: "Events", icon: ClipboardList },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/billing", label: "Billing", icon: CreditCard },
];

interface SidebarNavProps {
  userEmail: string;
  workspaceName: string | null;
}

export function SidebarNav({ userEmail, workspaceName }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 p-3 space-y-0.5">
      {navItems.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              isActive
                ? "bg-white/[0.06] text-foreground border border-white/[0.08] border-l-2 border-l-brand-500"
                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04] border border-transparent transition-colors duration-200"
            }`}
          >
            <Icon className={`h-4 w-4 ${isActive ? "text-brand-500" : ""}`} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SidebarFooter({ userEmail, workspaceName }: SidebarNavProps) {
  return (
    <div className="p-4 border-t border-white/[0.08] space-y-3">
      <div>
        <p className="text-sm text-foreground/80 truncate font-medium">{userEmail}</p>
        {workspaceName && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{workspaceName}</p>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start text-muted-foreground hover:text-foreground"
        onClick={() => signOut({ callbackUrl: "/login" })}
      >
        <LogOut className="h-4 w-4 mr-2" />
        Log out
      </Button>
    </div>
  );
}

export function MobileNav({ userEmail, workspaceName }: SidebarNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden fixed top-0 left-0 right-0 z-10 h-14 bg-background/80 backdrop-blur-md border-b border-white/[0.06] flex items-center justify-between px-4">
      <Link href="/dashboard" className="text-lg font-bold text-foreground tracking-tight"><span className="text-brand-500">Track</span>&thinsp;Clear</Link>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open navigation menu">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <div className="flex h-16 items-center px-6 border-b border-white/[0.06]">
            <span className="text-xl font-bold text-foreground tracking-tight"><span className="text-brand-500">Track</span>&thinsp;Clear</span>
          </div>
          <nav className="flex-1 p-4 space-y-1">
            {navItems.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    isActive
                      ? "bg-white/[0.06] text-foreground border border-white/[0.08] border-l-2 border-l-brand-500"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04] border border-transparent transition-colors duration-200"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? "text-brand-500" : ""}`} />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="p-4 border-t border-white/[0.08] space-y-3">
            <div>
              <p className="text-sm text-foreground/80 truncate font-medium">{userEmail}</p>
              {workspaceName && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">{workspaceName}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground hover:text-foreground"
              onClick={() => { signOut({ callbackUrl: "/login" }); setOpen(false); }}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Log out
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
