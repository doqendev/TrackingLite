"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LayoutDashboard, ClipboardList, Plug, Settings, CreditCard, Menu, LogOut, Activity, Shield, HeartPulse } from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";

const navItems = [
  { href: "/dashboard", labelKey: "dashboard" as const, icon: LayoutDashboard, code: "01" },
  { href: "/events", labelKey: "events" as const, icon: ClipboardList, code: "02" },
  { href: "/integrations", labelKey: "integrations" as const, icon: Plug, code: "03" },
  { href: "/tracking-health", labelKey: "trackingHealth" as const, icon: HeartPulse, code: "04" },
  { href: "/settings", labelKey: "settings" as const, icon: Settings, code: "05" },
  { href: "/billing", labelKey: "billing" as const, icon: CreditCard, code: "06" },
  { href: "/diagnostics", labelKey: "diagnostics" as const, icon: Activity, code: "07" },
];

interface SidebarNavProps {
  userEmail: string;
  workspaceName: string | null;
  isAdmin?: boolean;
}

export function SidebarNav({ userEmail, workspaceName, isAdmin }: SidebarNavProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  const items = isAdmin
    ? [...navItems, { href: "/admin", labelKey: "admin" as const, icon: Shield, code: "08" }]
    : navItems;

  return (
    <nav className="flex-1 py-4 space-y-0">
      {items.map(({ href, labelKey, icon: Icon, code }) => {
        const isActive = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 px-5 py-2.5 text-xs tracking-wider uppercase transition-colors border-l-2 ${
              isActive
                ? "text-cyan-500 border-l-cyan-500 bg-cyan-500/[0.08]"
                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03] border-l-transparent"
            }`}
          >
            <span className="text-[10px] text-muted-foreground w-4 font-mono">{code}</span>
            <span>&gt; {t(labelKey).toUpperCase()}</span>
            <span className={`ml-auto w-1.5 h-1.5 rounded-full ${isActive ? "bg-cyan-500 shadow-[0_0_8px_theme(colors.cyan.500)] animate-pulse" : "bg-muted-foreground/30"}`} />
          </Link>
        );
      })}
    </nav>
  );
}

export function SidebarFooter({ userEmail, workspaceName }: SidebarNavProps) {
  const t = useTranslations("nav");

  return (
    <div className="px-5 py-4 border-t border-[hsl(240,26%,15%)] space-y-3">
      <div>
        <p className="text-[10px] text-cyan-500 tracking-widest uppercase mb-1">OPERATOR</p>
        <p className="text-xs text-foreground/80 truncate">{userEmail}</p>
        {workspaceName && (
          <p className="text-[10px] text-muted-foreground truncate mt-0.5">{workspaceName}</p>
        )}
      </div>
      <button
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full py-1"
        onClick={() => signOut({ callbackUrl: "/login" })}
      >
        <LogOut className="h-3.5 w-3.5" />
        &gt; {t("logOut").toUpperCase()}
      </button>
    </div>
  );
}

export function MobileNav({ userEmail, workspaceName, isAdmin }: SidebarNavProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);

  const items = isAdmin
    ? [...navItems, { href: "/admin", labelKey: "admin" as const, icon: Shield, code: "08" }]
    : navItems;

  return (
    <div className="md:hidden fixed top-0 left-0 right-0 z-10 h-14 bg-background/95 backdrop-blur-sm border-b border-[hsl(240,26%,15%)] flex items-center justify-between px-4">
      <Link href="/dashboard" className="font-display font-bold text-foreground tracking-widest text-sm">
        <span className="text-cyan-500">TRACK</span> {"// "}CLEAR
      </Link>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open navigation menu">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0 bg-card border-r border-[hsl(240,26%,15%)]">
          <div className="flex h-14 items-center px-5 border-b border-[hsl(240,26%,15%)]">
            <span className="font-display font-bold text-foreground tracking-widest text-sm">
              <span className="text-cyan-500">TRACK</span> {"// "}CLEAR
            </span>
          </div>
          <nav className="flex-1 py-4 space-y-0">
            {items.map(({ href, labelKey, icon: Icon, code }) => {
              const isActive = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 px-5 py-2.5 text-xs tracking-wider uppercase transition-colors border-l-2 ${
                    isActive
                      ? "text-cyan-500 border-l-cyan-500 bg-cyan-500/[0.08]"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03] border-l-transparent"
                  }`}
                >
                  <span className="text-[10px] text-muted-foreground w-4 font-mono">{code}</span>
                  <span>&gt; {t(labelKey).toUpperCase()}</span>
                  <span className={`ml-auto w-1.5 h-1.5 rounded-full ${isActive ? "bg-cyan-500 shadow-[0_0_8px_theme(colors.cyan.500)] animate-pulse" : "bg-muted-foreground/30"}`} />
                </Link>
              );
            })}
          </nav>
          <div className="px-5 py-4 border-t border-[hsl(240,26%,15%)] space-y-3">
            <div>
              <p className="text-xs text-foreground/80 truncate">{userEmail}</p>
              {workspaceName && (
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">{workspaceName}</p>
              )}
            </div>
            <button
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full py-1"
              onClick={() => { signOut({ callbackUrl: "/login" }); setOpen(false); }}
            >
              <LogOut className="h-3.5 w-3.5" />
              &gt; {t("logOut").toUpperCase()}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
