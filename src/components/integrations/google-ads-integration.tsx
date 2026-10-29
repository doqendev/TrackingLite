"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SiGoogleads } from "react-icons/si";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export function GoogleAdsIntegration({ workspace, serviceAccountEmail }: {
  workspace: {
    id: string; googleAdsCustomerId?: string | null; googleAdsLoginCustomerId?: string | null;
    googleAdsConversionActionId?: string | null; enableGoogleAds?: boolean;
  };
  serviceAccountEmail: string | null;
}) {
  const t = useTranslations("googleAdsIntegration");
  const [customerId, setCustomerId] = useState(workspace.googleAdsCustomerId ?? "");
  const [conversionActionId, setConversionActionId] = useState(workspace.googleAdsConversionActionId ?? "");
  const [loginCustomerId, setLoginCustomerId] = useState(workspace.googleAdsLoginCustomerId ?? "");
  const [enabled, setEnabled] = useState(!!workspace.enableGoogleAds);
  const [saved, setSaved] = useState(!!(workspace.googleAdsCustomerId && workspace.googleAdsConversionActionId));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [validated, setValidated] = useState(false);
  const [copied, setCopied] = useState(false);

  async function save() {
    setBusy(true); setMessage(""); setValidated(false);
    let savedDisabled = false;
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleAdsCustomerId: customerId.trim(), googleAdsConversionActionId: conversionActionId.trim(),
          googleAdsLoginCustomerId: loginCustomerId.trim() || null, enableGoogleAds: false,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(typeof body?.error === "string" ? body.error : t("saveFailed"));
      }
      savedDisabled = true;
      setSaved(true);
      const check = await fetch(`/api/workspaces/${workspace.id}/test-connection`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destination: "GOOGLE_ADS" }),
      });
      const result = await check.json();
      if (!check.ok || !result.connected) {
        throw new Error(t("validationFailed", { reason: typeof result?.message === "string" ? result.message : "" }));
      }
      setValidated(true);
      if (enabled) {
        const activation = await fetch(`/api/workspaces/${workspace.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enableGoogleAds: true }),
        });
        if (!activation.ok) throw new Error(t("saveFailed"));
      }
      setMessage(enabled ? t("enabledMessage") : t("validatedMessage"));
    } catch (error) {
      if (savedDisabled) setEnabled(false);
      setMessage(error instanceof Error ? error.message : t("saveFailed"));
    } finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}`, { method: "PATCH",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enableGoogleAds: false }) });
      if (!response.ok) throw new Error(t("saveFailed"));
      setEnabled(false); setMessage(t("disabledMessage"));
    } catch { setMessage(t("saveFailed")); } finally { setBusy(false); }
  }

  async function copyEmail() {
    if (!serviceAccountEmail) return;
    try {
      await navigator.clipboard.writeText(serviceAccountEmail);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { /* The address stays visible for manual copying. */ }
  }

  return <section className="rounded-lg border border-white/[0.06] bg-card border-l-[3px] border-l-yellow-500 p-5 space-y-4" aria-labelledby="google-ads-title">
    <div className="flex items-center gap-3"><SiGoogleads className="h-5 w-5 text-yellow-500" />
      <div><h3 id="google-ads-title" className="font-semibold">Google Ads</h3><p className="text-sm text-muted-foreground">{t("description")}</p></div>
    </div>
    <p className="text-xs text-muted-foreground">{validated ? t("validated") : saved ? t("saved") : t("notConfigured")}</p>
    {!serviceAccountEmail && <p role="status" className="text-sm text-amber-400">{t("notAvailable")}</p>}
    <ol className="list-decimal pl-5 text-sm text-muted-foreground space-y-2">
      <li>{t("accountStep")}</li>
      <li>{t("step1")}</li>
      <li>{t("step2")}{serviceAccountEmail && <span className="mt-1 flex flex-wrap items-center gap-2">
        <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-xs text-foreground break-all">{serviceAccountEmail}</code>
        <Button type="button" variant="outline" size="sm" onClick={copyEmail}>{copied ? t("copied") : t("copy")}</Button>
      </span>}</li>
      <li>{t("step3")}</li>
    </ol>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="google-ads-customer">{t("customerId")}</Label>
        <Input id="google-ads-customer" value={customerId} disabled={busy} inputMode="numeric" placeholder="123-456-7890"
          onChange={e => { setCustomerId(e.target.value); setValidated(false); }} autoComplete="off" /></div>
      <div className="space-y-2"><Label htmlFor="google-ads-conversion-action">{t("conversionActionId")}</Label>
        <Input id="google-ads-conversion-action" value={conversionActionId} disabled={busy} inputMode="numeric"
          onChange={e => { setConversionActionId(e.target.value); setValidated(false); }} autoComplete="off" /></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="google-ads-login">{t("loginCustomerId")}</Label>
        <Input id="google-ads-login" value={loginCustomerId} disabled={busy} inputMode="numeric" placeholder="123-456-7890"
          onChange={e => { setLoginCustomerId(e.target.value); setValidated(false); }} autoComplete="off" />
        <p className="text-xs text-muted-foreground">{t("loginCustomerIdHelp")}</p></div>
    </div>
    <div className="flex items-center gap-3"><Switch id="google-ads-enabled" checked={enabled} disabled={busy} onCheckedChange={setEnabled} /><Label htmlFor="google-ads-enabled">{t("enableAfterValidation")}</Label></div>
    <p className="text-xs text-muted-foreground">{t("validationNote")}</p>
    <div className="flex flex-wrap gap-3"><Button onClick={save} disabled={busy || !serviceAccountEmail || !customerId.trim() || !conversionActionId.trim()}>{busy ? t("saving") : t("saveValidate")}</Button>
      <Button variant="outline" onClick={disable} disabled={busy}>{t("disable")}</Button></div>
    {message && <p role="status" className="text-sm">{message}</p>}
    <p className="text-xs text-muted-foreground">{t("verifyNote")} <a href="/tracking-health" className="underline">{t("trackingHealth")}</a></p>
  </section>;
}
