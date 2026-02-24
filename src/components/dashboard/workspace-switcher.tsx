"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, ChevronDown, Plus, Store } from "lucide-react";

interface WorkspaceSwitcherProps {
  workspaces: Array<{ id: string; name: string; domain: string | null }>;
  activeWorkspaceId: string;
  canAddStore: boolean;
}

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  canAddStore,
}: WorkspaceSwitcherProps) {
  const t = useTranslations("nav");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  async function handleSwitch(workspaceId: string) {
    if (workspaceId === activeWorkspaceId) {
      setOpen(false);
      return;
    }

    setSwitching(workspaceId);
    try {
      await fetch("/api/workspaces/set-active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      setOpen(false);
      router.refresh();
    } finally {
      setSwitching(null);
    }
  }

  function handleAddStore() {
    if (!canAddStore) return;
    setOpen(false);
    router.push("/onboarding");
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground/90 hover:bg-white/[0.06] transition-colors"
      >
        <Store className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-left font-medium">
          {activeWorkspace?.name ?? t("switchStore")}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[200px] rounded-lg border border-white/[0.08] bg-card shadow-lg">
          <div className="max-h-60 overflow-y-auto py-1">
            {workspaces.map((workspace) => {
              const isActive = workspace.id === activeWorkspaceId;
              const isLoading = switching === workspace.id;

              return (
                <button
                  key={workspace.id}
                  type="button"
                  disabled={isLoading}
                  onClick={() => handleSwitch(workspace.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/[0.06] transition-colors disabled:opacity-60"
                >
                  <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                    <span
                      className={`truncate font-medium ${isActive ? "text-foreground" : "text-foreground/80"}`}
                    >
                      {workspace.name}
                    </span>
                    {workspace.domain && (
                      <span className="truncate text-xs text-muted-foreground">
                        {workspace.domain}
                      </span>
                    )}
                  </div>
                  {isActive && (
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="border-t border-white/[0.08] py-1">
            {canAddStore ? (
              <button
                type="button"
                onClick={handleAddStore}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground/80 hover:bg-white/[0.06] transition-colors"
              >
                <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{t("addStore")}</span>
              </button>
            ) : (
              <div className="group relative">
                <button
                  type="button"
                  disabled
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground/40 cursor-not-allowed"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span>{t("addStore")}</span>
                </button>
                <div className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md opacity-0 group-hover:opacity-100 transition-opacity border border-white/[0.08]">
                  {t("upgradeToAdd")}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
