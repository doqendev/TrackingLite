"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { LiveClock } from "@/components/landing/live-clock";
import { PnWorkspaceSwitcher } from "./pn-workspace-switcher";

const navItems = [
  { href: "/pixel-null/dashboard", label: "DASHBOARD", code: "01" },
  { href: "/pixel-null/events", label: "EVENTS", code: "02" },
  { href: "/pixel-null/settings", label: "SETTINGS", code: "03" },
  { href: "/pixel-null/billing", label: "BILLING", code: "04" },
];

interface PnSidebarProps {
  userEmail: string;
  workspaceName: string | null;
  workspaces: Array<{ id: string; name: string; domain: string | null }>;
  activeWorkspaceId: string;
  canAddStore: boolean;
}

function SidebarContent({
  userEmail,
  workspaces,
  activeWorkspaceId,
  canAddStore,
  onNavClick,
}: PnSidebarProps & { onNavClick?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      <div className="pn-dash-sidebar-brand">
        TRACK {"// "}CLEAR <span className="pn-bracket-box">V.1.0</span>
      </div>

      {workspaces.length > 0 && (
        <PnWorkspaceSwitcher
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          canAddStore={canAddStore}
        />
      )}

      <nav className="pn-dash-nav">
        {navItems.map(({ href, label, code }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavClick}
              className={`pn-dash-nav-item ${isActive ? "pn-dash-nav-item--active" : ""}`}
            >
              <span className="pn-text-dim" style={{ fontSize: "0.6rem" }}>
                {code}
              </span>
              <span>&gt; {label}</span>
              <span
                className="pn-status-dot"
                style={{
                  marginLeft: "auto",
                  width: 5,
                  height: 5,
                  background: isActive ? "var(--pn-accent)" : "var(--pn-text-dim)",
                  boxShadow: isActive ? "0 0 8px var(--pn-accent)" : "none",
                  animation: isActive ? "pn-pulse 2s ease-in-out infinite" : "none",
                }}
              />
            </Link>
          );
        })}
      </nav>

      <div className="pn-dash-sidebar-footer">
        <div style={{ marginBottom: 8 }}>
          <span className="pn-text-cyan" style={{ fontSize: "0.65rem" }}>USER:</span>{" "}
          <span style={{ fontSize: "0.65rem" }}>{userEmail}</span>
        </div>
        <div style={{ marginBottom: 12 }}>
          <span className="pn-text-cyan" style={{ fontSize: "0.65rem" }}>SERVER_TIME:</span>{" "}
          <span style={{ fontSize: "0.65rem" }}><LiveClock /> UTC</span>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="pn-dash-nav-item"
          style={{ width: "100%", padding: "8px 0", borderLeft: "none" }}
        >
          &gt; LOGOUT
        </button>
      </div>
    </>
  );
}

export function PnSidebar(props: PnSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="pn-dash-sidebar">
        <SidebarContent {...props} />
      </aside>

      {/* Mobile header */}
      <div className="pn-dash-mobile-trigger">
        <Link href="/pixel-null/dashboard" style={{ textDecoration: "none" }}>
          <span
            className="pn-dash-sidebar-brand"
            style={{ border: "none", padding: 0, fontSize: "0.9rem" }}
          >
            TRACK {"// "}CLEAR
          </span>
        </Link>
        <button onClick={() => setMobileOpen(true)}>{"///"}</button>
      </div>

      {/* Mobile overlay + sidebar */}
      {mobileOpen && (
        <>
          <div
            className="pn-dash-overlay"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="pn-dash-sidebar pn-dash-sidebar--open">
            <SidebarContent {...props} onNavClick={() => setMobileOpen(false)} />
          </aside>
        </>
      )}
    </>
  );
}
