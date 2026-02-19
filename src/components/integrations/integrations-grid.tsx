"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

export interface IntegrationWorkspace {
  id: string;
  // Meta
  metaPixelId: string | null;
  metaTestEventCode: string | null;
  hasAccessToken: boolean;
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

interface IntegrationsGridProps {
  workspace: IntegrationWorkspace;
}

function MetaIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
      <path d="M12 2.04c-5.5 0-10 4.49-10 10.02 0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.52 1.49-3.93 3.78-3.93 1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7a10 10 0 008.44-9.9c0-5.53-4.5-10.02-10-10.02z" />
    </svg>
  );
}

function GoogleAdsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
      <path d="M3.27 12l7.18-12h3.55L6.82 12l7.18 12h-3.55L3.27 12zm10.46 6.54L17.28 12 10.1 0h3.55l7.18 12-7.18 12h-3.55l3.63-5.46z" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V9.17a8.16 8.16 0 004.76 1.52v-3.4a4.85 4.85 0 01-1-.6z" />
    </svg>
  );
}

function GA4Icon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
      <path d="M22.84 2.02v19.96a2.02 2.02 0 01-4.04 0V2.02a2.02 2.02 0 014.04 0zM14.04 22a2.02 2.02 0 01-2.02-2.02V9.02a2.02 2.02 0 014.04 0v10.96A2.02 2.02 0 0114.04 22zM7.26 22a2.02 2.02 0 01-2.02-2.02v-3.96a2.02 2.02 0 014.04 0v3.96A2.02 2.02 0 017.26 22z" />
    </svg>
  );
}

function KlaviyoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
      <path d="M2 4l10 8L22 4v16H2V4zm10 9.17L4.43 6.4v11.2h15.14V6.4L12 13.17z" />
    </svg>
  );
}

function EncryptedBadge() {
  return (
    <span className="text-[10px] font-medium text-brand-500/70 bg-brand-500/10 px-1.5 py-0.5 rounded">
      encrypted at rest
    </span>
  );
}

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
        connected
          ? "bg-green-500/10 text-green-400"
          : "bg-white/[0.04] text-muted-foreground"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          connected ? "bg-green-500 animate-pulse" : "bg-muted-foreground/30"
        }`}
      />
      {connected ? "Connected" : "Not connected"}
    </span>
  );
}

export function IntegrationsGrid({ workspace }: IntegrationsGridProps) {
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  // Meta state
  const [metaPixelId, setMetaPixelId] = useState(workspace.metaPixelId ?? "");
  const [metaAccessToken, setMetaAccessToken] = useState("");
  const [metaTestEventCode, setMetaTestEventCode] = useState(
    workspace.metaTestEventCode ?? ""
  );
  const [savingMeta, setSavingMeta] = useState(false);

  // Google Ads state
  const [googleCustomerId, setGoogleCustomerId] = useState(
    workspace.googleAdsCustomerId ?? ""
  );
  const [googleConversionAction, setGoogleConversionAction] = useState(
    workspace.googleAdsConversionAction ?? ""
  );
  const [googleAccessToken, setGoogleAccessToken] = useState("");
  const [googleDeveloperToken, setGoogleDeveloperToken] = useState(
    workspace.googleAdsDeveloperToken ?? ""
  );
  const [googleEnabled, setGoogleEnabled] = useState(workspace.enableGoogleAds);
  const [savingGoogle, setSavingGoogle] = useState(false);

  // TikTok state
  const [tiktokPixelId, setTiktokPixelId] = useState(
    workspace.tiktokPixelId ?? ""
  );
  const [tiktokAccessToken, setTiktokAccessToken] = useState("");
  const [tiktokEnabled, setTiktokEnabled] = useState(workspace.enableTikTok);
  const [savingTiktok, setSavingTiktok] = useState(false);

  // GA4 state
  const [ga4MeasurementId, setGa4MeasurementId] = useState(
    workspace.ga4MeasurementId ?? ""
  );
  const [ga4ApiSecret, setGa4ApiSecret] = useState("");
  const [ga4Enabled, setGa4Enabled] = useState(workspace.enableGA4);
  const [savingGA4, setSavingGA4] = useState(false);

  // Klaviyo state
  const [klaviyoApiKey, setKlaviyoApiKey] = useState("");
  const [klaviyoEnabled, setKlaviyoEnabled] = useState(workspace.enableKlaviyo);
  const [savingKlaviyo, setSavingKlaviyo] = useState(false);

  function toggleCard(key: string) {
    setExpandedCard((prev) => (prev === key ? null : key));
  }

  async function handleToggle(platform: string, enabled: boolean, platformName: string) {
    const fieldMap: Record<string, string> = {
      google: "enableGoogleAds",
      tiktok: "enableTikTok",
      ga4: "enableGA4",
      klaviyo: "enableKlaviyo",
    };
    const field = fieldMap[platform];
    if (!field) return;

    try {
      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: enabled }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success(`${platformName} ${enabled ? "enabled" : "disabled"}`);
    } catch {
      toast.error("Failed to update");
    }
  }

  async function saveMeta() {
    setSavingMeta(true);
    try {
      const body: Record<string, string | null> = {
        metaPixelId: metaPixelId || null,
        metaTestEventCode: metaTestEventCode || null,
      };
      if (metaAccessToken) body.metaAccessToken = metaAccessToken;

      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Meta credentials saved");
      setMetaAccessToken("");
    } catch {
      toast.error("Failed to save Meta credentials");
    } finally {
      setSavingMeta(false);
    }
  }

  async function saveGoogle() {
    setSavingGoogle(true);
    try {
      const body: Record<string, string | boolean | null> = {
        googleAdsCustomerId: googleCustomerId || null,
        googleAdsConversionAction: googleConversionAction || null,
        googleAdsDeveloperToken: googleDeveloperToken || null,
        enableGoogleAds: googleEnabled,
      };
      if (googleAccessToken) body.googleAdsAccessToken = googleAccessToken;

      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Google Ads credentials saved");
      setGoogleAccessToken("");
    } catch {
      toast.error("Failed to save Google Ads credentials");
    } finally {
      setSavingGoogle(false);
    }
  }

  async function saveTiktok() {
    setSavingTiktok(true);
    try {
      const body: Record<string, string | boolean | null> = {
        tiktokPixelId: tiktokPixelId || null,
        enableTikTok: tiktokEnabled,
      };
      if (tiktokAccessToken) body.tiktokAccessToken = tiktokAccessToken;

      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("TikTok credentials saved");
      setTiktokAccessToken("");
    } catch {
      toast.error("Failed to save TikTok credentials");
    } finally {
      setSavingTiktok(false);
    }
  }

  async function saveGA4() {
    setSavingGA4(true);
    try {
      const body: Record<string, string | boolean | null> = {
        ga4MeasurementId: ga4MeasurementId || null,
        enableGA4: ga4Enabled,
      };
      if (ga4ApiSecret) body.ga4ApiSecret = ga4ApiSecret;

      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("GA4 credentials saved");
      setGa4ApiSecret("");
    } catch {
      toast.error("Failed to save GA4 credentials");
    } finally {
      setSavingGA4(false);
    }
  }

  async function saveKlaviyo() {
    setSavingKlaviyo(true);
    try {
      const body: Record<string, string | boolean> = {
        enableKlaviyo: klaviyoEnabled,
      };
      if (klaviyoApiKey) body.klaviyoApiKey = klaviyoApiKey;

      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Klaviyo credentials saved");
      setKlaviyoApiKey("");
    } catch {
      toast.error("Failed to save Klaviyo credentials");
    } finally {
      setSavingKlaviyo(false);
    }
  }

  const metaConnected =
    workspace.hasAccessToken && !!workspace.metaPixelId;
  const googleConnected =
    workspace.hasGoogleAdsAccessToken &&
    !!workspace.googleAdsCustomerId &&
    !!workspace.googleAdsConversionAction;
  const tiktokConnected =
    workspace.hasTiktokAccessToken && !!workspace.tiktokPixelId;
  const ga4Connected =
    workspace.hasGA4ApiSecret && !!workspace.ga4MeasurementId;
  const klaviyoConnected = workspace.hasKlaviyoApiKey;

  return (
    <div className="space-y-8">
      {/* Advertising Platforms */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Advertising Platforms</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
      {/* Meta CAPI */}
      <div className="rounded-lg border border-white/[0.06] bg-card border-l-[3px] border-l-blue-500 overflow-hidden">
        <div
          className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
          onClick={() => toggleCard("meta")}
        >
          <div className="text-blue-500 shrink-0">
            <MetaIcon />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground text-sm">Meta CAPI</p>
            <p className="text-xs text-muted-foreground truncate">
              Connect your Meta Pixel for server-side conversion tracking
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge connected={metaConnected} />
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                expandedCard === "meta" ? "rotate-180" : ""
              }`}
            />
          </div>
        </div>
        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            expandedCard === "meta" ? "max-h-[600px]" : "max-h-0"
          }`}
        >
          <div className="space-y-4 p-6 pt-0 border-t border-white/[0.06]">
            <div className="pt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="meta-pixel-id" className="text-xs">
                  Pixel ID
                </Label>
                <Input
                  id="meta-pixel-id"
                  value={metaPixelId}
                  onChange={(e) => setMetaPixelId(e.target.value)}
                  placeholder="e.g. 1234567890"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="meta-access-token" className="text-xs">
                    Access Token
                  </Label>
                  {workspace.hasAccessToken && <EncryptedBadge />}
                </div>
                <Input
                  id="meta-access-token"
                  type="password"
                  value={metaAccessToken}
                  onChange={(e) => setMetaAccessToken(e.target.value)}
                  placeholder={
                    workspace.hasAccessToken
                      ? "leave blank to keep current"
                      : "EAAxxxxx..."
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="meta-test-code" className="text-xs">
                  Test Event Code{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="meta-test-code"
                  value={metaTestEventCode}
                  onChange={(e) => setMetaTestEventCode(e.target.value)}
                  placeholder="e.g. TEST12345"
                />
              </div>
              <div className="flex justify-end pt-2">
                <Button
                  variant="brand"
                  size="sm"
                  onClick={saveMeta}
                  disabled={savingMeta}
                >
                  {savingMeta ? "Saving..." : "Save credentials"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Google Ads */}
      <div className="rounded-lg border border-white/[0.06] bg-card border-l-[3px] border-l-amber-500 overflow-hidden">
        <div
          className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
          onClick={() => toggleCard("google")}
        >
          <div className="text-amber-500 shrink-0">
            <GoogleAdsIcon />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground text-sm">Google Ads</p>
            <p className="text-xs text-muted-foreground truncate">
              Forward conversion events to Google Ads
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge connected={googleConnected} />
            <Switch
              checked={googleEnabled}
              onCheckedChange={(val) => {
                setGoogleEnabled(val);
                handleToggle("google", val, "Google Ads");
              }}
              onClick={(e) => e.stopPropagation()}
              className="scale-90"
            />
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                expandedCard === "google" ? "rotate-180" : ""
              }`}
            />
          </div>
        </div>
        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            expandedCard === "google" ? "max-h-[600px]" : "max-h-0"
          }`}
        >
          <div className="space-y-4 p-6 pt-0 border-t border-white/[0.06]">
            <div className="pt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="google-customer-id" className="text-xs">
                  Customer ID
                </Label>
                <Input
                  id="google-customer-id"
                  value={googleCustomerId}
                  onChange={(e) => setGoogleCustomerId(e.target.value)}
                  placeholder="e.g. 123-456-7890"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="google-conversion-action" className="text-xs">
                  Conversion Action
                </Label>
                <Input
                  id="google-conversion-action"
                  value={googleConversionAction}
                  onChange={(e) => setGoogleConversionAction(e.target.value)}
                  placeholder="e.g. Purchase"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="google-access-token" className="text-xs">
                    Access Token
                  </Label>
                  {workspace.hasGoogleAdsAccessToken && <EncryptedBadge />}
                </div>
                <Input
                  id="google-access-token"
                  type="password"
                  value={googleAccessToken}
                  onChange={(e) => setGoogleAccessToken(e.target.value)}
                  placeholder={
                    workspace.hasGoogleAdsAccessToken
                      ? "leave blank to keep current"
                      : "ya29.xxx..."
                  }
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="google-developer-token" className="text-xs">
                    Developer Token
                  </Label>
                  {workspace.googleAdsDeveloperToken && <EncryptedBadge />}
                </div>
                <Input
                  id="google-developer-token"
                  type="password"
                  value={googleDeveloperToken}
                  onChange={(e) => setGoogleDeveloperToken(e.target.value)}
                  placeholder={
                    workspace.googleAdsDeveloperToken
                      ? "leave blank to keep current"
                      : "xxxxxxxxxxxxxxxx"
                  }
                />
              </div>
              <div className="flex justify-end pt-2">
                <Button
                  variant="brand"
                  size="sm"
                  onClick={saveGoogle}
                  disabled={savingGoogle}
                >
                  {savingGoogle ? "Saving..." : "Save credentials"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* TikTok */}
      <div className="rounded-lg border border-white/[0.06] bg-card border-l-[3px] border-l-pink-500 overflow-hidden">
        <div
          className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
          onClick={() => toggleCard("tiktok")}
        >
          <div className="text-pink-500 shrink-0">
            <TikTokIcon />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground text-sm">TikTok</p>
            <p className="text-xs text-muted-foreground truncate">
              Send events server-side via TikTok Events API
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge connected={tiktokConnected} />
            <Switch
              checked={tiktokEnabled}
              onCheckedChange={(val) => {
                setTiktokEnabled(val);
                handleToggle("tiktok", val, "TikTok");
              }}
              onClick={(e) => e.stopPropagation()}
              className="scale-90"
            />
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                expandedCard === "tiktok" ? "rotate-180" : ""
              }`}
            />
          </div>
        </div>
        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            expandedCard === "tiktok" ? "max-h-[600px]" : "max-h-0"
          }`}
        >
          <div className="space-y-4 p-6 pt-0 border-t border-white/[0.06]">
            <div className="pt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="tiktok-pixel-id" className="text-xs">
                  Pixel ID
                </Label>
                <Input
                  id="tiktok-pixel-id"
                  value={tiktokPixelId}
                  onChange={(e) => setTiktokPixelId(e.target.value)}
                  placeholder="e.g. CKXXXXXXXXXXXXXX"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="tiktok-access-token" className="text-xs">
                    Access Token
                  </Label>
                  {workspace.hasTiktokAccessToken && <EncryptedBadge />}
                </div>
                <Input
                  id="tiktok-access-token"
                  type="password"
                  value={tiktokAccessToken}
                  onChange={(e) => setTiktokAccessToken(e.target.value)}
                  placeholder={
                    workspace.hasTiktokAccessToken
                      ? "leave blank to keep current"
                      : "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  }
                />
              </div>
              <div className="flex justify-end pt-2">
                <Button
                  variant="brand"
                  size="sm"
                  onClick={saveTiktok}
                  disabled={savingTiktok}
                >
                  {savingTiktok ? "Saving..." : "Save credentials"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

        </div>
      </div>

      {/* Analytics & Automation */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Analytics & Automation</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
      {/* GA4 */}
      <div className="rounded-lg border border-white/[0.06] bg-card border-l-[3px] border-l-orange-500 overflow-hidden">
        <div
          className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
          onClick={() => toggleCard("ga4")}
        >
          <div className="text-orange-500 shrink-0">
            <GA4Icon />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground text-sm">GA4</p>
            <p className="text-xs text-muted-foreground truncate">
              Send events to Google Analytics 4 via Measurement Protocol
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge connected={ga4Connected} />
            <Switch
              checked={ga4Enabled}
              onCheckedChange={(val) => {
                setGa4Enabled(val);
                handleToggle("ga4", val, "GA4");
              }}
              onClick={(e) => e.stopPropagation()}
              className="scale-90"
            />
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                expandedCard === "ga4" ? "rotate-180" : ""
              }`}
            />
          </div>
        </div>
        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            expandedCard === "ga4" ? "max-h-[600px]" : "max-h-0"
          }`}
        >
          <div className="space-y-4 p-6 pt-0 border-t border-white/[0.06]">
            <div className="pt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ga4-measurement-id" className="text-xs">
                  Measurement ID
                </Label>
                <Input
                  id="ga4-measurement-id"
                  value={ga4MeasurementId}
                  onChange={(e) => setGa4MeasurementId(e.target.value)}
                  placeholder="e.g. G-XXXXXXXXXX"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="ga4-api-secret" className="text-xs">
                    API Secret
                  </Label>
                  {workspace.hasGA4ApiSecret && <EncryptedBadge />}
                </div>
                <Input
                  id="ga4-api-secret"
                  type="password"
                  value={ga4ApiSecret}
                  onChange={(e) => setGa4ApiSecret(e.target.value)}
                  placeholder={
                    workspace.hasGA4ApiSecret
                      ? "leave blank to keep current"
                      : "xxxxxxxxxxxxxxxxxxxxxx"
                  }
                />
              </div>
              <div className="flex justify-end pt-2">
                <Button
                  variant="brand"
                  size="sm"
                  onClick={saveGA4}
                  disabled={savingGA4}
                >
                  {savingGA4 ? "Saving..." : "Save credentials"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Klaviyo */}
      <div className="rounded-lg border border-white/[0.06] bg-card border-l-[3px] border-l-emerald-500 overflow-hidden">
        <div
          className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
          onClick={() => toggleCard("klaviyo")}
        >
          <div className="text-emerald-500 shrink-0">
            <KlaviyoIcon />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground text-sm">Klaviyo</p>
            <p className="text-xs text-muted-foreground truncate">
              Forward browsing and purchase events to Klaviyo
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge connected={klaviyoConnected} />
            <Switch
              checked={klaviyoEnabled}
              onCheckedChange={(val) => {
                setKlaviyoEnabled(val);
                handleToggle("klaviyo", val, "Klaviyo");
              }}
              onClick={(e) => e.stopPropagation()}
              className="scale-90"
            />
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                expandedCard === "klaviyo" ? "rotate-180" : ""
              }`}
            />
          </div>
        </div>
        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            expandedCard === "klaviyo" ? "max-h-[600px]" : "max-h-0"
          }`}
        >
          <div className="space-y-4 p-6 pt-0 border-t border-white/[0.06]">
            <div className="pt-4 space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="klaviyo-api-key" className="text-xs">
                    API Key
                  </Label>
                  {workspace.hasKlaviyoApiKey && <EncryptedBadge />}
                </div>
                <Input
                  id="klaviyo-api-key"
                  type="password"
                  value={klaviyoApiKey}
                  onChange={(e) => setKlaviyoApiKey(e.target.value)}
                  placeholder={
                    workspace.hasKlaviyoApiKey
                      ? "leave blank to keep current"
                      : "pk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  }
                />
              </div>
              <div className="flex justify-end pt-2">
                <Button
                  variant="brand"
                  size="sm"
                  onClick={saveKlaviyo}
                  disabled={savingKlaviyo}
                >
                  {savingKlaviyo ? "Saving..." : "Save credentials"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
        </div>
      </div>
    </div>
  );
}
