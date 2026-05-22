"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

interface ReplayButtonProps {
  workspaceId: string;
  failedCount: number;
  eventId?: string;
}

export function ReplayButton({
  workspaceId,
  failedCount,
  eventId,
}: ReplayButtonProps) {
  const [replaying, setReplaying] = useState(false);
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");

  async function handleReplay() {
    setReplaying(true);
    try {
      const body = eventId ? { eventIds: [eventId] } : { all: true };
      const res = await fetch(`/api/workspaces/${workspaceId}/replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          toast.error(t("pleaseWait", { seconds: data.retryAfter || 300 }));
        } else {
          toast.error(data.error || t("failedToReplay"));
        }
        return;
      }
      toast.success(t("eventsQueuedForReplay", { count: data.replayed }));
      window.location.reload();
    } catch {
      toast.error(t("failedToReplay"));
    } finally {
      setReplaying(false);
    }
  }

  if (!eventId && failedCount === 0) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleReplay}
      disabled={replaying}
      className="gap-1.5"
      title={t("replayPrivacyNote")}
    >
      <RefreshCw className={`h-3.5 w-3.5 ${replaying ? "animate-spin" : ""}`} />
      {replaying
        ? t("replaying")
        : eventId
        ? tc("retry")
        : t("retryFailed", { count: failedCount })}
    </Button>
  );
}
