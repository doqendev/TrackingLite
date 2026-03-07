"use client";

import { useState } from "react";
import { toast } from "sonner";

interface PnReplayButtonProps {
  workspaceId: string;
  failedCount: number;
  eventId?: string;
}

export function PnReplayButton({ workspaceId, failedCount, eventId }: PnReplayButtonProps) {
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
        toast.error(res.status === 429
          ? `COOLDOWN: Wait ${data.retryAfter || 300}s`
          : data.error || "REPLAY_FAILED"
        );
        return;
      }
      toast.success(`QUEUED: ${data.replayed} events for replay`);
      window.location.reload();
    } catch {
      toast.error("REPLAY_FAILED");
    } finally {
      setReplaying(false);
    }
  }

  if (!eventId && failedCount === 0) return null;

  return (
    <button
      onClick={handleReplay}
      disabled={replaying}
      className="pn-btn"
      style={{
        height: 32,
        padding: "0 16px",
        fontSize: "0.7rem",
        opacity: replaying ? 0.5 : 1,
      }}
    >
      {replaying
        ? "REPLAYING..."
        : eventId
        ? ">> RETRY"
        : `>> RETRY FAILED (${failedCount})`}
    </button>
  );
}
