"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SiOpenai } from "react-icons/si";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export function OpenAIIntegration({ workspace }: { workspace: {
  id: string; openaiPixelId?: string | null; hasOpenAIApiKey?: boolean; enableOpenAI?: boolean;
} }) {
  const t = useTranslations("openaiIntegration");
  const [pixelId, setPixelId] = useState(workspace.openaiPixelId ?? "");
  const [key, setKey] = useState("");
  const [hasKey, setHasKey] = useState(!!workspace.hasOpenAIApiKey);
  const [enabled, setEnabled] = useState(!!workspace.enableOpenAI);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [validated, setValidated] = useState(false);

  async function save() {
    setBusy(true); setMessage(""); setValidated(false);
    let savedDisabled = false;
    try {
      const saved = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openaiPixelId: pixelId.trim(), ...(key.trim() ? { openaiApiKey: key.trim() } : {}), enableOpenAI: false }),
      });
      if (!saved.ok) throw new Error(t("saveFailed"));
      savedDisabled = true;
      setHasKey(true); setKey("");
      const response = await fetch(`/api/workspaces/${workspace.id}/test-connection`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destination: "OPENAI" }),
      });
      const result = await response.json();
      if (!response.ok || !result.connected) throw new Error(t("validationFailed"));
      setValidated(true);
      if (enabled) {
        const activation = await fetch(`/api/workspaces/${workspace.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enableOpenAI: true }),
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
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enableOpenAI: false }) });
      if (!response.ok) throw new Error(t("saveFailed"));
      setEnabled(false); setMessage(t("disabledMessage"));
    } catch { setMessage(t("saveFailed")); } finally { setBusy(false); }
  }

  return <section className="rounded-lg border border-white/[0.06] bg-card border-l-[3px] border-l-emerald-500 p-5 space-y-4" aria-labelledby="openai-title">
    <div className="flex items-center gap-3"><SiOpenai className="h-5 w-5 text-emerald-400" />
      <div><h3 id="openai-title" className="font-semibold">ChatGPT Ads</h3><p className="text-sm text-muted-foreground">{t("description")}</p></div>
    </div>
    <p className="text-xs text-muted-foreground">{validated ? t("validated") : hasKey ? t("saved") : t("notConfigured")}</p>
    <ol className="list-decimal pl-5 text-sm text-muted-foreground space-y-2">
      <li>{t("step1")} <a href="https://ads.openai.com" target="_blank" rel="noreferrer" className="underline">Ads Manager</a></li>
      <li>{t("step2")}</li><li>{t("step3")}</li>
    </ol>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="openai-pixel">{t("pixelId")}</Label>
        <Input id="openai-pixel" value={pixelId} disabled={busy} onChange={e => { setPixelId(e.target.value); setValidated(false); }} autoComplete="off" /></div>
      <div className="space-y-2"><Label htmlFor="openai-key">{t("apiKey")}</Label>
        <Input id="openai-key" type="password" value={key} disabled={busy} onChange={e => { setKey(e.target.value); setValidated(false); }} autoComplete="new-password" placeholder={hasKey ? t("keySaved") : ""} /></div>
    </div>
    <div className="flex items-center gap-3"><Switch id="openai-enabled" checked={enabled} disabled={busy} onCheckedChange={setEnabled} /><Label htmlFor="openai-enabled">{t("enableAfterValidation")}</Label></div>
    <p className="text-xs text-muted-foreground">{t("validationNote")}</p>
    <div className="flex gap-3"><Button onClick={save} disabled={busy || !pixelId.trim() || (!key.trim() && !hasKey)}>{busy ? t("saving") : t("saveValidate")}</Button>
      <Button variant="outline" onClick={disable} disabled={busy}>{t("disable")}</Button></div>
    {message && <p role="status" className="text-sm">{message}</p>}
    <p className="text-xs text-muted-foreground">{t("verifyNote")} <a href="/tracking-health" className="underline">{t("trackingHealth")}</a></p>
  </section>;
}
