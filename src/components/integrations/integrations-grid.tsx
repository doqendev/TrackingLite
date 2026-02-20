"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { SiMeta, SiGoogleads, SiTiktok, SiGoogleanalytics } from "react-icons/si";

export interface IntegrationWorkspace {
  id: string;
  // Meta
  metaPixelId: string | null;
  metaTestEventCode: string | null;
  hasAccessToken: boolean;
  enableMeta: boolean;
  // Google Ads — boolean flags only (values are encrypted at rest, never sent to client)
  hasGoogleAdsConversionId: boolean;
  hasGoogleAdsViewContentLabel: boolean;
  hasGoogleAdsAddToCartLabel: boolean;
  hasGoogleAdsCheckoutLabel: boolean;
  hasGoogleAdsPurchaseLabel: boolean;
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

function KlaviyoIcon() {
  return (
    <svg viewBox="0 0 152 152" className="h-5 w-5" fill="currentColor">
      <path d="M148.76,124.01H3.24V26.63H148.76l-30.55,48.69,30.55,48.69Z" />
    </svg>
  );
}

function EncryptedBadge({ label }: { label: string }) {
  return (
    <span className="text-[10px] font-medium text-brand-500/70 bg-brand-500/10 px-1.5 py-0.5 rounded">
      {label}
    </span>
  );
}

function StatusBadge({ connected, connectedLabel, notConnectedLabel }: { connected: boolean; connectedLabel: string; notConnectedLabel: string }) {
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
      {connected ? connectedLabel : notConnectedLabel}
    </span>
  );
}

export function IntegrationsGrid({ workspace }: IntegrationsGridProps) {
  const t = useTranslations("integrations");
  const tc = useTranslations("common");
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  // Meta state
  const [metaPixelId, setMetaPixelId] = useState(workspace.metaPixelId ?? "");
  const [metaAccessToken, setMetaAccessToken] = useState("");
  const [metaTestEventCode, setMetaTestEventCode] = useState(
    workspace.metaTestEventCode ?? ""
  );
  const [metaEnabled, setMetaEnabled] = useState(workspace.enableMeta);
  const [savingMeta, setSavingMeta] = useState(false);

  // Google Ads state — fields are encrypted at rest; inputs always start empty
  const [googleConversionId, setGoogleConversionId] = useState("");
  const [googleViewContentLabel, setGoogleViewContentLabel] = useState("");
  const [googleAddToCartLabel, setGoogleAddToCartLabel] = useState("");
  const [googleCheckoutLabel, setGoogleCheckoutLabel] = useState("");
  const [googlePurchaseLabel, setGooglePurchaseLabel] = useState("");
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
      meta: "enableMeta",
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
      toast.success(t(enabled ? "platformEnabled" : "platformDisabled", { platform: platformName }));
    } catch {
      toast.error(t("failedToUpdate"));
    }
  }

  async function saveMeta() {
    setSavingMeta(true);
    try {
      const body: Record<string, string | boolean | null> = {
        metaPixelId: metaPixelId || null,
        metaTestEventCode: metaTestEventCode || null,
        enableMeta: metaEnabled,
      };
      if (metaAccessToken) body.metaAccessToken = metaAccessToken;

      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success(t("credentialsSaved", { platform: "Meta" }));
      setMetaAccessToken("");
    } catch {
      toast.error(t("failedToSave", { platform: "Meta" }));
    } finally {
      setSavingMeta(false);
    }
  }

  async function saveGoogle() {
    setSavingGoogle(true);
    try {
      const body: Record<string, string | boolean | null> = {
        enableGoogleAds: googleEnabled,
      };
      // Only send a field if the user typed a new value; empty means "keep existing"
      if (googleConversionId) body.googleAdsConversionId = googleConversionId;
      if (googleViewContentLabel) body.googleAdsViewContentLabel = googleViewContentLabel;
      if (googleAddToCartLabel) body.googleAdsAddToCartLabel = googleAddToCartLabel;
      if (googleCheckoutLabel) body.googleAdsCheckoutLabel = googleCheckoutLabel;
      if (googlePurchaseLabel) body.googleAdsPurchaseLabel = googlePurchaseLabel;

      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success(t("credentialsSaved", { platform: "Google Ads" }));
      setGoogleConversionId("");
      setGoogleViewContentLabel("");
      setGoogleAddToCartLabel("");
      setGoogleCheckoutLabel("");
      setGooglePurchaseLabel("");
    } catch {
      toast.error(t("failedToSave", { platform: "Google Ads" }));
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
      toast.success(t("credentialsSaved", { platform: "TikTok" }));
      setTiktokAccessToken("");
    } catch {
      toast.error(t("failedToSave", { platform: "TikTok" }));
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
      toast.success(t("credentialsSaved", { platform: "GA4" }));
      setGa4ApiSecret("");
    } catch {
      toast.error(t("failedToSave", { platform: "GA4" }));
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
      toast.success(t("credentialsSaved", { platform: "Klaviyo" }));
      setKlaviyoApiKey("");
    } catch {
      toast.error(t("failedToSave", { platform: "Klaviyo" }));
    } finally {
      setSavingKlaviyo(false);
    }
  }

  const metaConnected =
    workspace.hasAccessToken && !!workspace.metaPixelId;
  const googleConnected = workspace.hasGoogleAdsConversionId;
  const tiktokConnected =
    workspace.hasTiktokAccessToken && !!workspace.tiktokPixelId;
  const ga4Connected =
    workspace.hasGA4ApiSecret && !!workspace.ga4MeasurementId;
  const klaviyoConnected = workspace.hasKlaviyoApiKey;

  return (
    <div className="space-y-8">
      {/* Advertising Platforms */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t("advertisingPlatforms")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
      {/* Meta CAPI */}
      <div className="rounded-lg border border-white/[0.06] bg-card border-l-[3px] border-l-blue-500 overflow-hidden">
        <div
          className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
          onClick={() => toggleCard("meta")}
        >
          <div className="text-blue-500 shrink-0">
            <SiMeta className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground text-sm">Meta CAPI</p>
            <p className="text-xs text-muted-foreground truncate">
              {t("metaDesc")}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge connected={metaConnected} connectedLabel={t("connected")} notConnectedLabel={t("notConnected")} />
            <Switch
              checked={metaEnabled}
              onCheckedChange={(val) => {
                setMetaEnabled(val);
                handleToggle("meta", val, "Meta");
              }}
              onClick={(e) => e.stopPropagation()}
              className="scale-90"
            />
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
                  {t("pixelId")}
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
                    {t("accessToken")}
                  </Label>
                  {workspace.hasAccessToken && <EncryptedBadge label={t("encryptedAtRest")} />}
                </div>
                <Input
                  id="meta-access-token"
                  type="password"
                  value={metaAccessToken}
                  onChange={(e) => setMetaAccessToken(e.target.value)}
                  placeholder={
                    workspace.hasAccessToken
                      ? t("leaveBlankToKeep")
                      : "EAAxxxxx..."
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="meta-test-code" className="text-xs">
                  {t("testEventCode")}{" "}
                  <span className="text-muted-foreground">({t("optional")})</span>
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
                  {savingMeta ? tc("saving") : t("saveCredentials")}
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
            <SiGoogleads className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground text-sm">Google Ads</p>
            <p className="text-xs text-muted-foreground truncate">
              {t("googleDesc")}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge connected={googleConnected} connectedLabel={t("connected")} notConnectedLabel={t("notConnected")} />
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
            expandedCard === "google" ? "max-h-[800px]" : "max-h-0"
          }`}
        >
          <div className="space-y-4 p-6 pt-0 border-t border-white/[0.06]">
            <div className="pt-4 space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="google-conversion-id" className="text-xs">
                    Conversion ID
                  </Label>
                  {workspace.hasGoogleAdsConversionId && <EncryptedBadge label={t("encryptedAtRest")} />}
                </div>
                <Input
                  id="google-conversion-id"
                  value={googleConversionId}
                  onChange={(e) => setGoogleConversionId(e.target.value)}
                  placeholder={workspace.hasGoogleAdsConversionId ? t("leaveBlankToKeep") : "e.g. 11366583402"}
                />
                <p className="text-[10px] text-muted-foreground">
                  Find this in Google Ads &gt; Goals &gt; Conversions &gt; Settings &gt; Tag setup
                </p>
              </div>
              <div className="space-y-3">
                <p className="text-xs font-medium text-foreground">Conversion Labels</p>
                <p className="text-[10px] text-muted-foreground -mt-1">
                  Match these to your Google Ads conversion actions. Leave blank to skip.
                </p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="google-view-content-label" className="text-xs text-muted-foreground">
                      Page View Label <span className="text-muted-foreground/60">(product page views)</span>
                    </Label>
                    {workspace.hasGoogleAdsViewContentLabel && <EncryptedBadge label={t("encryptedAtRest")} />}
                  </div>
                  <Input
                    id="google-view-content-label"
                    value={googleViewContentLabel}
                    onChange={(e) => setGoogleViewContentLabel(e.target.value)}
                    placeholder={workspace.hasGoogleAdsViewContentLabel ? t("leaveBlankToKeep") : "e.g. P_HrCM-G0eAaEOqYgawq"}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="google-add-to-cart-label" className="text-xs text-muted-foreground">
                      Add to Cart Label
                    </Label>
                    {workspace.hasGoogleAdsAddToCartLabel && <EncryptedBadge label={t("encryptedAtRest")} />}
                  </div>
                  <Input
                    id="google-add-to-cart-label"
                    value={googleAddToCartLabel}
                    onChange={(e) => setGoogleAddToCartLabel(e.target.value)}
                    placeholder={workspace.hasGoogleAdsAddToCartLabel ? t("leaveBlankToKeep") : "e.g. P_HrCM-G0eAaEOqYgawq"}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="google-checkout-label" className="text-xs text-muted-foreground">
                      Begin Checkout Label
                    </Label>
                    {workspace.hasGoogleAdsCheckoutLabel && <EncryptedBadge label={t("encryptedAtRest")} />}
                  </div>
                  <Input
                    id="google-checkout-label"
                    value={googleCheckoutLabel}
                    onChange={(e) => setGoogleCheckoutLabel(e.target.value)}
                    placeholder={workspace.hasGoogleAdsCheckoutLabel ? t("leaveBlankToKeep") : "e.g. P_HrCM-G0eAaEOqYgawq"}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="google-purchase-label" className="text-xs text-muted-foreground">
                      Purchase Label
                    </Label>
                    {workspace.hasGoogleAdsPurchaseLabel && <EncryptedBadge label={t("encryptedAtRest")} />}
                  </div>
                  <Input
                    id="google-purchase-label"
                    value={googlePurchaseLabel}
                    onChange={(e) => setGooglePurchaseLabel(e.target.value)}
                    placeholder={workspace.hasGoogleAdsPurchaseLabel ? t("leaveBlankToKeep") : "e.g. P_HrCM-G0eAaEOqYgawq"}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Find your Conversion Labels in Google Ads &gt; Goals &gt; Conversions &gt; Details
                </p>
              </div>
              <div className="flex justify-end pt-2">
                <Button
                  variant="brand"
                  size="sm"
                  onClick={saveGoogle}
                  disabled={savingGoogle}
                >
                  {savingGoogle ? tc("saving") : t("saveCredentials")}
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
            <SiTiktok className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground text-sm">TikTok</p>
            <p className="text-xs text-muted-foreground truncate">
              {t("tiktokDesc")}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge connected={tiktokConnected} connectedLabel={t("connected")} notConnectedLabel={t("notConnected")} />
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
                  {t("pixelId")}
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
                    {t("accessToken")}
                  </Label>
                  {workspace.hasTiktokAccessToken && <EncryptedBadge label={t("encryptedAtRest")} />}
                </div>
                <Input
                  id="tiktok-access-token"
                  type="password"
                  value={tiktokAccessToken}
                  onChange={(e) => setTiktokAccessToken(e.target.value)}
                  placeholder={
                    workspace.hasTiktokAccessToken
                      ? t("leaveBlankToKeep")
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
                  {savingTiktok ? tc("saving") : t("saveCredentials")}
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
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t("analyticsAutomation")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
      {/* GA4 */}
      <div className="rounded-lg border border-white/[0.06] bg-card border-l-[3px] border-l-orange-500 overflow-hidden">
        <div
          className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
          onClick={() => toggleCard("ga4")}
        >
          <div className="text-orange-500 shrink-0">
            <SiGoogleanalytics className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground text-sm">GA4</p>
            <p className="text-xs text-muted-foreground truncate">
              {t("ga4Desc")}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge connected={ga4Connected} connectedLabel={t("connected")} notConnectedLabel={t("notConnected")} />
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
                  {t("measurementId")}
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
                    {t("apiSecret")}
                  </Label>
                  {workspace.hasGA4ApiSecret && <EncryptedBadge label={t("encryptedAtRest")} />}
                </div>
                <Input
                  id="ga4-api-secret"
                  type="password"
                  value={ga4ApiSecret}
                  onChange={(e) => setGa4ApiSecret(e.target.value)}
                  placeholder={
                    workspace.hasGA4ApiSecret
                      ? t("leaveBlankToKeep")
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
                  {savingGA4 ? tc("saving") : t("saveCredentials")}
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
              {t("klaviyoDesc")}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge connected={klaviyoConnected} connectedLabel={t("connected")} notConnectedLabel={t("notConnected")} />
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
                    {t("apiKey")}
                  </Label>
                  {workspace.hasKlaviyoApiKey && <EncryptedBadge label={t("encryptedAtRest")} />}
                </div>
                <Input
                  id="klaviyo-api-key"
                  type="password"
                  value={klaviyoApiKey}
                  onChange={(e) => setKlaviyoApiKey(e.target.value)}
                  placeholder={
                    workspace.hasKlaviyoApiKey
                      ? t("leaveBlankToKeep")
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
                  {savingKlaviyo ? tc("saving") : t("saveCredentials")}
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
