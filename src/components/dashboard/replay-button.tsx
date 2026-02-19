"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

interface ReplayButtonProps {
  workspaceId: string;
  failedCount: number;
  eventId?: string; // If provided, replay a single event
}

export function ReplayButton({
  workspaceId,
  failedCount,
  eventId,
}: ReplayButtonProps) {
  const [replaying, setReplaying] = useState(false);

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
          toast.error(
            `Please wait ${data.retryAfter || 300} seconds before replaying again`
          );
        } else {
          toast.error(data.error || "Failed to replay events");
        }
        return;
      }
      toast.success(`${data.replayed} event(s) queued for replay`);
      window.location.reload();
    } catch {
      toast.error("Failed to replay events");
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
    >
      <RefreshCw className={`h-3.5 w-3.5 ${replaying ? "animate-spin" : ""}`} />
      {replaying
        ? "Replaying..."
        : eventId
        ? "Retry"
        : `Retry ${failedCount} failed`}
    </Button>
  );
}
