"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface PnWorkspaceSwitcherProps {
  workspaces: Array<{ id: string; name: string; domain: string | null }>;
  activeWorkspaceId: string;
  canAddStore: boolean;
}

export function PnWorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  canAddStore,
}: PnWorkspaceSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const active = workspaces.find((w) => w.id === activeWorkspaceId);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleSwitch(id: string) {
    if (id === activeWorkspaceId) {
      setOpen(false);
      return;
    }
    setSwitching(id);
    try {
      await fetch("/api/workspaces/set-active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: id }),
      });
      setOpen(false);
      router.refresh();
    } finally {
      setSwitching(null);
    }
  }

  return (
    <div className="pn-dash-ws-switcher" ref={ref}>
      <button
        type="button"
        className="pn-dash-ws-trigger"
        onClick={() => setOpen((p) => !p)}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          [ {active?.name ?? "SELECT STORE"} ]
        </span>
        <span style={{ opacity: 0.4 }}>{open ? "^" : "v"}</span>
      </button>

      {open && (
        <div className="pn-dash-ws-dropdown">
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              type="button"
              disabled={switching === ws.id}
              className={`pn-dash-ws-option ${ws.id === activeWorkspaceId ? "pn-dash-ws-option--active" : ""}`}
              onClick={() => handleSwitch(ws.id)}
            >
              {ws.id === activeWorkspaceId ? "> " : "  "}
              {ws.name}
              {ws.domain && (
                <span style={{ marginLeft: 8, opacity: 0.4 }}>{ws.domain}</span>
              )}
            </button>
          ))}
          {canAddStore && (
            <button
              type="button"
              className="pn-dash-ws-option"
              onClick={() => { setOpen(false); router.push("/onboarding"); }}
            >
              + ADD STORE
            </button>
          )}
        </div>
      )}
    </div>
  );
}
