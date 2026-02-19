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
  // Google Ads
  googleAdsCustomerId: string | null;
  googleAdsConversionAction: string | null;
  hasGoogleAdsAccessToken: boolean;
  googleAdsDeveloperToken: string | null;
  enableGoogleAds: boolean;
  // TikTok
  tiktokPixelId: string | null;
  hasTiktokAccessToken: boolean;
  enableTikTok: boolean;
  // GA4
  ga4MeasurementId: string | null;
  hasGA4ApiSecret: boolean;
  enableGA4: boolean;
  // Klaviyo
  hasKlaviyoApiKey: boolean;
  enableKlaviyo: boolean;
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

  // Google Ads state
  const [googleCustomerId, setGoogleCustomerId] = useState(workspace.googleAdsCustomerId ?? "");
  const [googleConversionAction, setGoogleConversionAction] = useState(workspace.googleAdsConversionAction ?? "");
  const [googleAccessToken, setGoogleAccessToken] = useState("");
  const [googleDeveloperToken, setGoogleDeveloperToken] = useState(workspace.googleAdsDeveloperToken ?? "");
  const [googleAdsEnabled, setGoogleAdsEnabled] = useState(workspace.enableGoogleAds);
  const [savingGoogle, setSavingGoogle] = useState(false);

  // TikTok state
  const [tiktokPixelId, setTiktokPixelId] = useState(workspace.tiktokPixelId ?? "");
  const [tiktokAccessToken, setTiktokAccessToken] = useState("");
  const [tiktokEnabled, setTiktokEnabled] = useState(workspace.enableTikTok);
  const [savingTiktok, setSavingTiktok] = useState(false);

  // GA4 state
  const [ga4MeasurementId, setGa4MeasurementId] = useState(workspace.ga4MeasurementId ?? "");
  const [ga4ApiSecret, setGa4ApiSecret] = useState("");
  const [ga4Enabled, setGa4Enabled] = useState(workspace.enableGA4);
  const [savingGA4, setSavingGA4] = useState(false);

  // Klaviyo state
  const [klaviyoApiKey, setKlaviyoApiKey] = useState("");
  const [klaviyoEnabled, setKlaviyoEnabled] = useState(workspace.enableKlaviyo);
  const [savingKlaviyo, setSavingKlaviyo] = useState(false);

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

  async function handleSaveGoogle(e: React.FormEvent) {
    e.preventDefault();
    setSavingGoogle(true);
    try {
      const payload: Record<string, unknown> = {
        googleAdsCustomerId: googleCustomerId,
        googleAdsConversionAction: googleConversionAction,
        googleAdsDeveloperToken: googleDeveloperToken,
        enableGoogleAds: googleAdsEnabled,
      };
      if (googleAccessToken) payload.googleAdsAccessToken = googleAccessToken;
      await patchWorkspace(payload);
      toast.success("Google Ads credentials saved");
      setGoogleAccessToken("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingGoogle(false);
    }
  }

  async function handleSaveTiktok(e: React.FormEvent) {
    e.preventDefault();
    setSavingTiktok(true);
    try {
      const payload: Record<string, unknown> = {
        tiktokPixelId: tiktokPixelId,
        enableTikTok: tiktokEnabled,
      };
      if (tiktokAccessToken) payload.tiktokAccessToken = tiktokAccessToken;
      await patchWorkspace(payload);
      toast.success("TikTok credentials saved");
      setTiktokAccessToken("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingTiktok(false);
    }
  }

  async function handleSaveGA4(e: React.FormEvent) {
    e.preventDefault();
    setSavingGA4(true);
    try {
      const payload: Record<string, unknown> = {
        ga4MeasurementId: ga4MeasurementId,
        enableGA4: ga4Enabled,
      };
      if (ga4ApiSecret) payload.ga4ApiSecret = ga4ApiSecret;
      await patchWorkspace(payload);
      toast.success("GA4 credentials saved");
      setGa4ApiSecret("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingGA4(false);
    }
  }

  async function handleSaveKlaviyo(e: React.FormEvent) {
    e.preventDefault();
    setSavingKlaviyo(true);
    try {
      const payload: Record<string, unknown> = {
        enableKlaviyo: klaviyoEnabled,
      };
      if (klaviyoApiKey) payload.klaviyoApiKey = klaviyoApiKey;
      await patchWorkspace(payload);
      toast.success("Klaviyo credentials saved");
      setKlaviyoApiKey("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingKlaviyo(false);
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
              <Label htmlFor="accessToken" className="mb-1 flex items-center gap-2">
                Access Token
                <span className="text-[10px] font-medium text-brand-500/70 bg-brand-500/10 px-1.5 py-0.5 rounded">encrypted at rest</span>
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

      {/* 2. Google Ads Conversion API */}
      <Card>
        <CardHeader>
          <CardTitle>Google Ads Conversion API</CardTitle>
          <CardDescription>Forward conversion events to Google Ads offline conversions.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveGoogle} className="space-y-4">
            <div>
              <Label htmlFor="googleCustomerId" className="mb-1">
                Customer ID
              </Label>
              <Input
                id="googleCustomerId"
                type="text"
                value={googleCustomerId}
                onChange={(e) => setGoogleCustomerId(e.target.value)}
                placeholder="123-456-7890"
              />
              <p className="text-xs text-muted-foreground mt-1">Your Google Ads account customer ID (with or without dashes).</p>
            </div>
            <div>
              <Label htmlFor="googleConversionAction" className="mb-1">
                Conversion Action Resource Name
              </Label>
              <Input
                id="googleConversionAction"
                type="text"
                value={googleConversionAction}
                onChange={(e) => setGoogleConversionAction(e.target.value)}
                placeholder="customers/123456789/conversionActions/987654321"
              />
              <p className="text-xs text-muted-foreground mt-1">Full resource name from Google Ads &gt; Goals &gt; Conversions.</p>
            </div>
            <div>
              <Label htmlFor="googleAccessToken" className="mb-1 flex items-center gap-2">
                Access Token
                <span className="text-[10px] font-medium text-brand-500/70 bg-brand-500/10 px-1.5 py-0.5 rounded">encrypted at rest</span>
              </Label>
              <Input
                id="googleAccessToken"
                type="password"
                value={googleAccessToken}
                onChange={(e) => setGoogleAccessToken(e.target.value)}
                placeholder={workspace.hasGoogleAdsAccessToken ? "••••••••• (leave blank to keep current)" : "ya29.a0..."}
              />
              <p className="text-xs text-muted-foreground mt-1">OAuth2 access token. Stored encrypted at rest. Leave blank to keep existing.</p>
            </div>
            <div>
              <Label htmlFor="googleDeveloperToken" className="mb-1">
                Developer Token
              </Label>
              <Input
                id="googleDeveloperToken"
                type="password"
                value={googleDeveloperToken}
                onChange={(e) => setGoogleDeveloperToken(e.target.value)}
                placeholder="AbCdEf-GhIjKl..."
              />
              <p className="text-xs text-muted-foreground mt-1">From Google Ads API Center. Required for all API calls.</p>
            </div>
            <div className="flex items-center justify-between pt-1">
              <div>
                <Label htmlFor="enableGoogleAds" className="flex items-center gap-2 cursor-pointer">
                  <span className={`h-1.5 w-1.5 rounded-full ${googleAdsEnabled ? "bg-green-500" : "bg-muted-foreground/30"}`} />
                  Enable Google Ads
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">Forward AddToCart, InitiateCheckout, and Purchase events.</p>
              </div>
              <Switch
                id="enableGoogleAds"
                checked={googleAdsEnabled}
                onCheckedChange={setGoogleAdsEnabled}
              />
            </div>
            <div className="flex justify-end pt-1">
              <Button type="submit" variant="brand" disabled={savingGoogle}>
                {savingGoogle ? "Saving\u2026" : "Save Google Ads"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 3. TikTok Events API */}
      <Card>
        <CardHeader>
          <CardTitle>TikTok Events API</CardTitle>
          <CardDescription>Forward events server-side to TikTok via the Events API.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveTiktok} className="space-y-4">
            <div>
              <Label htmlFor="tiktokPixelId" className="mb-1">
                Pixel ID
              </Label>
              <Input
                id="tiktokPixelId"
                type="text"
                value={tiktokPixelId}
                onChange={(e) => setTiktokPixelId(e.target.value)}
                placeholder="ABCDE12345"
              />
              <p className="text-xs text-muted-foreground mt-1">Found in TikTok Ads Manager &gt; Assets &gt; Events &gt; Web Events.</p>
            </div>
            <div>
              <Label htmlFor="tiktokAccessToken" className="mb-1 flex items-center gap-2">
                Access Token
                <span className="text-[10px] font-medium text-brand-500/70 bg-brand-500/10 px-1.5 py-0.5 rounded">encrypted at rest</span>
              </Label>
              <Input
                id="tiktokAccessToken"
                type="password"
                value={tiktokAccessToken}
                onChange={(e) => setTiktokAccessToken(e.target.value)}
                placeholder={workspace.hasTiktokAccessToken ? "••••••••• (leave blank to keep current)" : "Your Events API access token"}
              />
              <p className="text-xs text-muted-foreground mt-1">Stored encrypted at rest. Leave blank to keep existing token.</p>
            </div>
            <div className="flex items-center justify-between pt-1">
              <div>
                <Label htmlFor="enableTikTok" className="flex items-center gap-2 cursor-pointer">
                  <span className={`h-1.5 w-1.5 rounded-full ${tiktokEnabled ? "bg-green-500" : "bg-muted-foreground/30"}`} />
                  Enable TikTok Events API
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">Forward all 5 event types including ttclid for click attribution.</p>
              </div>
              <Switch
                id="enableTikTok"
                checked={tiktokEnabled}
                onCheckedChange={setTiktokEnabled}
              />
            </div>
            <div className="flex justify-end pt-1">
              <Button type="submit" variant="brand" disabled={savingTiktok}>
                {savingTiktok ? "Saving\u2026" : "Save TikTok"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 4. Google Analytics 4 */}
      <Card>
        <CardHeader>
          <CardTitle>Google Analytics 4</CardTitle>
          <CardDescription>Send events server-side to Google Analytics 4 via Measurement Protocol.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveGA4} className="space-y-4">
            <div>
              <Label htmlFor="ga4MeasurementId" className="mb-1">
                Measurement ID
              </Label>
              <Input
                id="ga4MeasurementId"
                type="text"
                value={ga4MeasurementId}
                onChange={(e) => setGa4MeasurementId(e.target.value)}
                placeholder="G-XXXXXXXXXX"
              />
              <p className="text-xs text-muted-foreground mt-1">Found in GA4 Admin &gt; Data Streams &gt; your stream &gt; Measurement ID.</p>
            </div>
            <div>
              <Label htmlFor="ga4ApiSecret" className="mb-1 flex items-center gap-2">
                API Secret
                <span className="text-[10px] font-medium text-brand-500/70 bg-brand-500/10 px-1.5 py-0.5 rounded">encrypted at rest</span>
              </Label>
              <Input
                id="ga4ApiSecret"
                type="password"
                value={ga4ApiSecret}
                onChange={(e) => setGa4ApiSecret(e.target.value)}
                placeholder={workspace.hasGA4ApiSecret ? "••••••••• (leave blank to keep current)" : "Your Measurement Protocol API secret"}
              />
              <p className="text-xs text-muted-foreground mt-1">Created in GA4 Admin &gt; Data Streams &gt; Measurement Protocol API secrets. Stored encrypted at rest.</p>
            </div>
            <div className="flex items-center justify-between pt-1">
              <div>
                <Label htmlFor="enableGA4" className="flex items-center gap-2 cursor-pointer">
                  <span className={`h-1.5 w-1.5 rounded-full ${ga4Enabled ? "bg-green-500" : "bg-muted-foreground/30"}`} />
                  Enable Google Analytics 4
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">Forward all 5 event types to GA4 via Measurement Protocol.</p>
              </div>
              <Switch
                id="enableGA4"
                checked={ga4Enabled}
                onCheckedChange={setGa4Enabled}
              />
            </div>
            <div className="flex justify-end pt-1">
              <Button type="submit" variant="brand" disabled={savingGA4}>
                {savingGA4 ? "Saving\u2026" : "Save GA4"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 5. Klaviyo */}
      <Card>
        <CardHeader>
          <CardTitle>Klaviyo</CardTitle>
          <CardDescription>Forward browsing and purchase events to Klaviyo for email/SMS automation.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveKlaviyo} className="space-y-4">
            <div>
              <Label htmlFor="klaviyoApiKey" className="mb-1 flex items-center gap-2">
                API Key
                <span className="text-[10px] font-medium text-brand-500/70 bg-brand-500/10 px-1.5 py-0.5 rounded">encrypted at rest</span>
              </Label>
              <Input
                id="klaviyoApiKey"
                type="password"
                value={klaviyoApiKey}
                onChange={(e) => setKlaviyoApiKey(e.target.value)}
                placeholder={workspace.hasKlaviyoApiKey ? "••••••••• (leave blank to keep current)" : "pk_xxxxxxxx..."}
              />
              <p className="text-xs text-muted-foreground mt-1">Found in Klaviyo &gt; Settings &gt; API Keys. Stored encrypted at rest. Leave blank to keep existing.</p>
            </div>
            <p className="text-xs text-muted-foreground">Note: PageView events are skipped (too noisy for email automation).</p>
            <div className="flex items-center justify-between pt-1">
              <div>
                <Label htmlFor="enableKlaviyo" className="flex items-center gap-2 cursor-pointer">
                  <span className={`h-1.5 w-1.5 rounded-full ${klaviyoEnabled ? "bg-green-500" : "bg-muted-foreground/30"}`} />
                  Enable Klaviyo
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">Forward ViewContent, AddToCart, InitiateCheckout, and Purchase events.</p>
              </div>
              <Switch
                id="enableKlaviyo"
                checked={klaviyoEnabled}
                onCheckedChange={setKlaviyoEnabled}
              />
            </div>
            <div className="flex justify-end pt-1">
              <Button type="submit" variant="brand" disabled={savingKlaviyo}>
                {savingKlaviyo ? "Saving\u2026" : "Save Klaviyo"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 6. Event Toggles */}
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
                    <Label htmlFor={key} className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${toggles[key] ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                      {label}
                    </Label>
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

      {/* 5. Consent Mode */}
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

      {/* 6. JS Snippet */}
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
          <pre className="bg-black/40 text-foreground/80 rounded-lg p-4 text-xs overflow-x-auto leading-relaxed font-mono whitespace-pre-wrap break-all border border-white/[0.06]">
            {snippet || "Loading snippet\u2026"}
          </pre>
          <p className="text-xs text-muted-foreground mt-3">
            Go to Shopify Admin &gt; Settings &gt; Customer Events &gt; Add Custom Pixel, then paste the snippet above.
          </p>
        </CardContent>
      </Card>

      {/* 7. Danger Zone */}
      <Card className="border-red-500/10 border-l-2 border-l-red-500/30">
        <CardHeader className="border-b border-red-500/10">
          <CardTitle className="text-red-400">Danger Zone</CardTitle>
          <CardDescription className="text-red-400/60">These actions are irreversible or disruptive.</CardDescription>
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
                Stop all event tracking for this workspace. Events will no longer be forwarded to any destination.
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
                  <AlertDialogDescription>Tracking will stop and events will no longer be forwarded to any destination. This action is disruptive.</AlertDialogDescription>
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
