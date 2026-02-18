"use client";

import { useState, useEffect } from "react";
import { ConsentMode } from "@prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface Workspace {
  id: string;
  metaPixelId: string | null;
  metaTestEventCode: string | null;
  hasAccessToken: boolean;
  consentMode: ConsentMode;
  enablePageView: boolean;
  enableViewContent: boolean;
  enableAddToCart: boolean;
  enableInitiateCheckout: boolean;
  enablePurchase: boolean;
  apiKey: string;
}

interface SettingsFormProps {
  workspace: Workspace;
}

export function SettingsForm({ workspace }: SettingsFormProps) {
  // Meta credentials state
  const [pixelId, setPixelId] = useState(workspace.metaPixelId ?? "");
  const [accessToken, setAccessToken] = useState("");
  const [testEventCode, setTestEventCode] = useState(workspace.metaTestEventCode ?? "");
  const [savingMeta, setSavingMeta] = useState(false);

  // Event toggles state
  const [toggles, setToggles] = useState({
    enablePageView: workspace.enablePageView,
    enableViewContent: workspace.enableViewContent,
    enableAddToCart: workspace.enableAddToCart,
    enableInitiateCheckout: workspace.enableInitiateCheckout,
    enablePurchase: workspace.enablePurchase,
  });
  const [savingToggles, setSavingToggles] = useState(false);

  // Consent mode state
  const [consentMode, setConsentMode] = useState<ConsentMode>(workspace.consentMode);
  const [savingConsent, setSavingConsent] = useState(false);

  // Snippet state
  const [snippet, setSnippet] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Danger zone state
  const [rotatingKey, setRotatingKey] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  useEffect(() => {
    fetch(`/api/snippet/${workspace.id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setSnippet(data.snippet))
      .catch(() => setSnippet("// Failed to load snippet. Please refresh."));
  }, [workspace.id]);

  async function patchWorkspace(data: Record<string, unknown>) {
    const res = await fetch(`/api/workspaces/${workspace.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Failed to save");
    }
    return res.json();
  }

  async function handleSaveMeta(e: React.FormEvent) {
    e.preventDefault();
    setSavingMeta(true);
    try {
      const payload: Record<string, string> = { metaPixelId: pixelId, metaTestEventCode: testEventCode };
      if (accessToken) payload.metaAccessToken = accessToken;
      await patchWorkspace(payload);
      toast.success("Meta credentials saved");
      setAccessToken("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingMeta(false);
    }
  }

  async function handleSaveToggles(e: React.FormEvent) {
    e.preventDefault();
    setSavingToggles(true);
    try {
      await patchWorkspace(toggles);
      toast.success("Event toggles saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingToggles(false);
    }
  }

  async function handleSaveConsent(e: React.FormEvent) {
    e.preventDefault();
    setSavingConsent(true);
    try {
      await patchWorkspace({ consentMode });
      toast.success("Consent mode saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingConsent(false);
    }
  }

  async function handleCopySnippet() {
    await navigator.clipboard.writeText(snippet).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRotateKeyConfirmed() {
    setRotatingKey(true);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/rotate-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to rotate key");
      }
      toast.success("API key rotated. Refresh the page to update your snippet.");
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rotate key");
    } finally {
      setRotatingKey(false);
    }
  }

  async function handleDeactivateConfirmed() {
    setDeactivating(true);
    try {
      await patchWorkspace({ isActive: false });
      toast.success("Workspace deactivated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to deactivate");
    } finally {
      setDeactivating(false);
    }
  }

  const eventToggleItems = [
    { key: "enablePageView" as const, label: "PageView", description: "Track every page visit" },
    { key: "enableViewContent" as const, label: "ViewContent", description: "Track product page views" },
    { key: "enableAddToCart" as const, label: "AddToCart", description: "Track add-to-cart actions" },
    { key: "enableInitiateCheckout" as const, label: "InitiateCheckout", description: "Track checkout starts" },
    { key: "enablePurchase" as const, label: "Purchase", description: "Track completed orders" },
  ];

  return (
    <div className="space-y-8">
      {/* 1. Meta Credentials */}
      <Card>
        <CardHeader>
          <CardTitle>Meta Credentials</CardTitle>
          <CardDescription>Connect your Meta Pixel and CAPI access token.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveMeta} className="space-y-4">
            <div>
              <Label htmlFor="pixelId" className="mb-1">
                Meta Pixel ID
              </Label>
              <Input
                id="pixelId"
                type="text"
                value={pixelId}
                onChange={(e) => setPixelId(e.target.value)}
                placeholder="123456789012345"
              />
            </div>
            <div>
              <Label htmlFor="accessToken" className="mb-1">
                Access Token
              </Label>
              <Input
                id="accessToken"
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder={workspace.hasAccessToken ? "••••••••• (leave blank to keep current)" : "EAAxxxxx..."}
              />
              <p className="text-xs text-muted-foreground mt-1">Stored encrypted at rest. Leave blank to keep existing token.</p>
            </div>
            <div>
              <Label htmlFor="testEventCode" className="mb-1">
                Test Event Code <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="testEventCode"
                type="text"
                value={testEventCode}
                onChange={(e) => setTestEventCode(e.target.value)}
                placeholder="TEST12345"
              />
              <p className="text-xs text-muted-foreground mt-1">Used for testing in Meta Events Manager. Remove when going live.</p>
            </div>
            <div className="flex justify-end pt-1">
              <Button type="submit" variant="brand" disabled={savingMeta}>
                {savingMeta ? "Saving\u2026" : "Save credentials"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 2. Event Toggles */}
      <Card>
        <CardHeader>
          <CardTitle>Event Toggles</CardTitle>
          <CardDescription>Choose which events to forward to Meta CAPI.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveToggles}>
            <div className="space-y-4">
              {eventToggleItems.map(({ key, label, description }) => (
                <div key={key} className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor={key}>{label}</Label>
                    <p className="text-xs text-muted-foreground">{description}</p>
                  </div>
                  <Switch
                    id={key}
                    checked={toggles[key]}
                    onCheckedChange={(checked) => setToggles((prev) => ({ ...prev, [key]: checked }))}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-4">
              <Button type="submit" variant="brand" disabled={savingToggles}>
                {savingToggles ? "Saving\u2026" : "Save toggles"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 3. Consent Mode */}
      <Card>
        <CardHeader>
          <CardTitle>Consent Mode</CardTitle>
          <CardDescription>Control how events are forwarded based on customer consent.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveConsent}>
            <RadioGroup value={consentMode} onValueChange={(v) => setConsentMode(v as ConsentMode)}>
              <label className={`flex items-start gap-3 cursor-pointer p-3 rounded-lg border-2 transition-colors ${consentMode === "STRICT" ? "border-brand-500/50 bg-brand-500/10" : "border-white/[0.06] bg-transparent"}`}>
                <RadioGroupItem value="STRICT" id="strict" className="mt-0.5" />
                <div>
                  <Label htmlFor="strict" className="cursor-pointer">Strict</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Only forward events when explicit consent is given. Recommended for EU/EEA.</p>
                </div>
              </label>
              <label className={`flex items-start gap-3 cursor-pointer p-3 rounded-lg border-2 transition-colors ${consentMode === "LAX" ? "border-brand-500/50 bg-brand-500/10" : "border-white/[0.06] bg-transparent"}`}>
                <RadioGroupItem value="LAX" id="lax" className="mt-0.5" />
                <div>
                  <Label htmlFor="lax" className="cursor-pointer">Lax</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Forward all events regardless of consent.</p>
                </div>
              </label>
            </RadioGroup>
            <div className="flex justify-end pt-4">
              <Button type="submit" variant="brand" disabled={savingConsent}>
                {savingConsent ? "Saving\u2026" : "Save consent mode"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 4. JS Snippet */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>JS Snippet</CardTitle>
            <CardDescription>Add this script to your Shopify Custom Pixel.</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={handleCopySnippet}>
            {copied ? (
              <>
                <Check className="h-4 w-4 text-green-600" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy
              </>
            )}
          </Button>
        </CardHeader>
        <CardContent>
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs overflow-x-auto leading-relaxed font-mono whitespace-pre-wrap break-all">
            {snippet || "Loading snippet\u2026"}
          </pre>
          <p className="text-xs text-muted-foreground mt-3">
            Go to Shopify Admin &gt; Settings &gt; Customer Events &gt; Add Custom Pixel, then paste the snippet above.
          </p>
        </CardContent>
      </Card>

      {/* 5. Danger Zone */}
      <Card className="border-red-500/20">
        <CardHeader className="bg-red-500/10 border-b border-red-500/20">
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription className="text-destructive/80">These actions are irreversible or disruptive.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Rotate API Key</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Generates a new API key. Your current JS snippet will stop working and must be updated.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="border-destructive/50 text-destructive hover:bg-destructive/10" disabled={rotatingKey}>
                  {rotatingKey ? "Rotating\u2026" : "Rotate key"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Rotate API Key?</AlertDialogTitle>
                  <AlertDialogDescription>The old key will stop working immediately and your JS snippet must be updated.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRotateKeyConfirmed} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Rotate key</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <Separator />
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Deactivate Workspace</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Stop all event tracking for this workspace. Events will no longer be forwarded to Meta.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={deactivating}>
                  {deactivating ? "Deactivating\u2026" : "Deactivate"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Deactivate Workspace?</AlertDialogTitle>
                  <AlertDialogDescription>Tracking will stop and events will no longer be forwarded to Meta. This action is disruptive.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeactivateConfirmed} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Deactivate</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
