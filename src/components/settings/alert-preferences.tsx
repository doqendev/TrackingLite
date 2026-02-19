"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface AlertPreference {
  trackingDown: boolean;
  highErrorRate: boolean;
  orderLimitWarning: boolean;
  orderLimitReached: boolean;
  emqDrop: boolean;
}

const ALERT_ITEMS: {
  key: keyof AlertPreference;
  label: string;
  description: string;
}[] = [
  {
    key: "trackingDown",
    label: "Tracking Down",
    description: "Notify when success rate drops below 80% in the last hour.",
  },
  {
    key: "highErrorRate",
    label: "High Error Rate",
    description: "Notify when more than 10% of events fail in the last hour.",
  },
  {
    key: "orderLimitWarning",
    label: "Order Limit Warning",
    description: "Notify when monthly order usage reaches 80% or 95% of your plan limit.",
  },
  {
    key: "orderLimitReached",
    label: "Order Limit Reached",
    description: "Notify when the monthly order limit is fully reached and Purchase events are blocked.",
  },
  {
    key: "emqDrop",
    label: "EMQ Score Drop",
    description: "Notify when the Event Match Quality score drops below 6.0.",
  },
];

export function AlertPreferences() {
  const [prefs, setPrefs] = useState<AlertPreference | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/alerts/preferences")
      .then((res) => res.json())
      .then((data: AlertPreference) => {
        setPrefs(data);
      })
      .catch(() => {
        toast.error("Failed to load alert preferences.");
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleToggle(key: keyof AlertPreference, value: boolean) {
    if (!prefs) return;

    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    setSaving(true);

    try {
      const res = await fetch("/api/alerts/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });

      if (!res.ok) {
        throw new Error("Failed to save");
      }

      toast.success("Alert preference saved.");
    } catch {
      // Revert on failure
      setPrefs(prefs);
      toast.error("Failed to save alert preference.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email Alerts</CardTitle>
        <CardDescription>
          Get notified when tracking health degrades or limits approach. Alerts
          are sent to your account email with a 24-hour cooldown per alert type.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading preferences...</p>
        ) : prefs === null ? (
          <p className="text-sm text-muted-foreground">
            Could not load alert preferences.
          </p>
        ) : (
          <div className="space-y-5">
            {ALERT_ITEMS.map((item) => (
              <div
                key={item.key}
                className="flex items-start justify-between gap-4"
              >
                <div className="space-y-0.5">
                  <Label
                    htmlFor={`alert-${item.key}`}
                    className="text-sm font-medium leading-none"
                  >
                    {item.label}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {item.description}
                  </p>
                </div>
                <Switch
                  id={`alert-${item.key}`}
                  checked={prefs[item.key]}
                  disabled={saving}
                  onCheckedChange={(checked) => handleToggle(item.key, checked)}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
