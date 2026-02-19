"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface AlertPreference {
  trackingDown: boolean;
  highErrorRate: boolean;
  orderLimitWarning: boolean;
  orderLimitReached: boolean;
}

export function AlertPreferences() {
  const t = useTranslations("settings");
  const [prefs, setPrefs] = useState<AlertPreference | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const alertItems: {
    key: keyof AlertPreference;
    labelKey: string;
    descKey: string;
  }[] = [
    { key: "trackingDown", labelKey: "trackingDown", descKey: "trackingDownDesc" },
    { key: "highErrorRate", labelKey: "highErrorRate", descKey: "highErrorRateDesc" },
    { key: "orderLimitWarning", labelKey: "orderLimitWarning", descKey: "orderLimitWarningDesc" },
    { key: "orderLimitReached", labelKey: "orderLimitReached", descKey: "orderLimitReachedDesc" },
  ];

  useEffect(() => {
    fetch("/api/alerts/preferences")
      .then((res) => res.json())
      .then((data: AlertPreference) => {
        setPrefs(data);
      })
      .catch(() => {
        toast.error(t("alertLoadFailed"));
      })
      .finally(() => setLoading(false));
  }, [t]);

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

      toast.success(t("alertSaved"));
    } catch {
      // Revert on failure
      setPrefs(prefs);
      toast.error(t("alertSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("emailAlerts")}</CardTitle>
        <CardDescription>
          {t("emailAlertsDesc")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t("loadingPreferences")}</p>
        ) : prefs === null ? (
          <p className="text-sm text-muted-foreground">
            {t("couldNotLoad")}
          </p>
        ) : (
          <div className="space-y-5">
            {alertItems.map((item) => (
              <div
                key={item.key}
                className="flex items-start justify-between gap-4"
              >
                <div className="space-y-0.5">
                  <Label
                    htmlFor={`alert-${item.key}`}
                    className="text-sm font-medium leading-none"
                  >
                    {t(item.labelKey)}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t(item.descKey)}
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
