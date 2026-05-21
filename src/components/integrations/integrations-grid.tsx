"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { SiMeta, SiTiktok, SiGoogleanalytics, SiGoogleads, SiShopify } from "react-icons/si";
import { FaReddit, FaPinterest } from "react-icons/fa";
import { SetupGuide } from "@/components/integrations/setup-guide";

export interface IntegrationWorkspace {
  id: string;
  productMode: "SHOPIFY_META_TIKTOK_V1" | "LEGACY_ALL_DESTINATIONS";
  installType: "SHOPIFY_CUSTOM_PIXEL" | "HEADLESS_CUSTOM";
  // Meta
  metaPixelId: string | null;
  metaTestEventCode: string | null;
  hasAccessToken: boolean;
  enableMeta: boolean;
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
  // Reddit
  redditAccountId: string | null;
  hasRedditAccessToken: boolean;
  enableReddit: boolean;
  // Pinterest
  pinterestAdAccountId: string | null;
  hasPinterestConversionToken: boolean;
  enablePinterest: boolean;
  // Google Ads
  googleAdsConversionId: string | null;
  googleAdsLabelPurchase: string | null;
  googleAdsLabelAddToCart: string | null;
  googleAdsLabelInitiateCheckout: string | null;
  googleAdsLabelViewContent: string | null;
  enableGoogleAds: boolean;
  // Shopify Webhook
  hasShopifyWebhookSecret: boolean;
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

  // Reddit state
  const [redditAccountId, setRedditAccountId] = useState(workspace.redditAccountId ?? "");
  const [redditAccessToken, setRedditAccessToken] = useState("");
  const [redditEnabled, setRedditEnabled] = useState(workspace.enableReddit);
  const [savingReddit, setSavingReddit] = useState(false);

  // Pinterest state
  const [pinterestAdAccountId, setPinterestAdAccountId] = useState(workspace.pinterestAdAccountId ?? "");
  const [pinterestConversionToken, setPinterestConversionToken] = useState("");
  const [pinterestEnabled, setPinterestEnabled] = useState(workspace.enablePinterest);
  const [savingPinterest, setSavingPinterest] = useState(false);

  // Google Ads state
  const [googleAdsConversionId, setGoogleAdsConversionId] = useState(workspace.googleAdsConversionId ?? "");
  const [googleAdsLabelPurchase, setGoogleAdsLabelPurchase] = useState(workspace.googleAdsLabelPurchase ?? "");
  const [googleAdsLabelAddToCart, setGoogleAdsLabelAddToCart] = useState(workspace.googleAdsLabelAddToCart ?? "");
  const [googleAdsLabelInitiateCheckout, setGoogleAdsLabelInitiateCheckout] = useState(workspace.googleAdsLabelInitiateCheckout ?? "");
  const [googleAdsLabelViewContent, setGoogleAdsLabelViewContent] = useState(workspace.googleAdsLabelViewContent ?? "");
  const [googleAdsEnabled, setGoogleAdsEnabled] = useState(workspace.enableGoogleAds);
  const [savingGoogleAds, setSavingGoogleAds] = useState(false);

  // Shopify Webhook state
  const [webhookSecret, setWebhookSecret] = useState("");
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [webhookConnected, setWebhookConnected] = useState(workspace.hasShopifyWebhookSecret);
  const [webhookUrlCopied, setWebhookUrlCopied] = useState(false);

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://www.trackclear.io"}/api/webhooks/shopify`;

  function toggleCard(key: string) {
    setExpandedCard((prev) => (prev === key ? null : key));
  }

  async function handleToggle(platform: string, enabled: boolean, platformName: string) {
    const fieldMap: Record<string, string> = {
      meta: "enableMeta",
      tiktok: "enableTikTok",
      ga4: "enableGA4",
      klaviyo: "enableKlaviyo",
      reddit: "enableReddit",
      pinterest: "enablePinterest",
      googleAds: "enableGoogleAds",
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

  async function saveReddit() {
    setSavingReddit(true);
    try {
      const body: Record<string, string | boolean | null> = {
        redditAccountId: redditAccountId || null,
        enableReddit: redditEnabled,
      };
      if (redditAccessToken) body.redditAccessToken = redditAccessToken;

      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success(t("credentialsSaved", { platform: "Reddit" }));
      setRedditAccessToken("");
    } catch {
      toast.error(t("failedToSave", { platform: "Reddit" }));
    } finally {
      setSavingReddit(false);
    }
  }

  async function savePinterest() {
    setSavingPinterest(true);
    try {
      const body: Record<string, string | boolean | null> = {
        pinterestAdAccountId: pinterestAdAccountId || null,
        enablePinterest: pinterestEnabled,
      };
      if (pinterestConversionToken) body.pinterestConversionToken = pinterestConversionToken;

      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success(t("credentialsSaved", { platform: "Pinterest" }));
      setPinterestConversionToken("");
    } catch {
      toast.error(t("failedToSave", { platform: "Pinterest" }));
    } finally {
      setSavingPinterest(false);
    }
  }

  async function saveGoogleAds() {
    setSavingGoogleAds(true);
    try {
      const body: Record<string, string | boolean | null> = {
        googleAdsConversionId: googleAdsConversionId || null,
        googleAdsLabelPurchase: googleAdsLabelPurchase || null,
        googleAdsLabelAddToCart: googleAdsLabelAddToCart || null,
        googleAdsLabelInitiateCheckout: googleAdsLabelInitiateCheckout || null,
        googleAdsLabelViewContent: googleAdsLabelViewContent || null,
        enableGoogleAds: googleAdsEnabled,
      };

      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success(t("credentialsSaved", { platform: "Google Ads" }));
    } catch {
      toast.error(t("failedToSave", { platform: "Google Ads" }));
    } finally {
      setSavingGoogleAds(false);
    }
  }

  async function saveWebhookSecret() {
    setSavingWebhook(true);
    try {
      const body: Record<string, string> = {};
      if (webhookSecret) body.shopifyWebhookSecret = webhookSecret;
      else {
        setSavingWebhook(false);
        return;
      }

      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success(t("webhookSaved"));
      setWebhookSecret("");
      setWebhookConnected(true);
    } catch {
      toast.error(t("failedToSave", { platform: "Shopify Webhook" }));
    } finally {
      setSavingWebhook(false);
    }
  }

  function copyWebhookUrl() {
    navigator.clipboard.writeText(webhookUrl);
    setWebhookUrlCopied(true);
    setTimeout(() => setWebhookUrlCopied(false), 2000);
  }

  const metaConnected = workspace.hasAccessToken && !!workspace.metaPixelId;
  const tiktokConnected = workspace.hasTiktokAccessToken && !!workspace.tiktokPixelId;
  const ga4Connected = workspace.hasGA4ApiSecret && !!workspace.ga4MeasurementId;
  const klaviyoConnected = workspace.hasKlaviyoApiKey;
  const redditConnected = workspace.hasRedditAccessToken;
  const pinterestConnected = workspace.hasPinterestConversionToken;
  const googleAdsConnected = !!workspace.googleAdsConversionId;
  const showLegacyDestinations = workspace.productMode !== "SHOPIFY_META_TIKTOK_V1";

  return (
    <div className="space-y-8">
      {/* Shopify Webhook Fallback */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t("shopifyWebhookSection")}</h2>
        <div className="grid grid-cols-1 gap-4 items-start">
          <div className="rounded-lg border border-white/[0.06] bg-card border-l-[3px] border-l-green-500 overflow-hidden">
            <div
              className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
              onClick={() => toggleCard("shopifyWebhook")}
            >
              <div className="text-green-500 shrink-0">
                <SiShopify className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm">{t("shopifyWebhook")}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {t("shopifyWebhookDesc")}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge
                  connected={webhookConnected}
                  connectedLabel={t("shopifyWebhookConnected")}
                  notConnectedLabel={t("shopifyWebhookNotConfigured")}
                />
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                    expandedCard === "shopifyWebhook" ? "rotate-180" : ""
                  }`}
                />
              </div>
            </div>
            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                expandedCard === "shopifyWebhook" ? "max-h-[1200px]" : "max-h-0"
              }`}
            >
              <div className="space-y-4 p-6 pt-0 border-t border-white/[0.06]">
                <div className="pt-4 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="webhook-url" className="text-xs">
                      {t("webhookUrl")}
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="webhook-url"
                        value={webhookUrl}
                        readOnly
                        className="font-mono text-xs"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={copyWebhookUrl}
                        className="shrink-0 px-3"
                      >
                        {webhookUrlCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="webhook-secret" className="text-xs">
                        {t("webhookSigningSecret")}
                      </Label>
                      {webhookConnected && <EncryptedBadge label={t("encryptedAtRest")} />}
                    </div>
                    <Input
                      id="webhook-secret"
                      type="password"
                      value={webhookSecret}
                      onChange={(e) => setWebhookSecret(e.target.value)}
                      placeholder={
                        webhookConnected
                          ? t("leaveBlankToKeep")
                          : t("webhookSigningSecretPlaceholder")
                      }
                    />
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button
                      variant="brand"
                      size="sm"
                      onClick={saveWebhookSecret}
                      disabled={savingWebhook}
                    >
                      {savingWebhook ? tc("saving") : t("saveCredentials")}
                    </Button>
                  </div>
                  <SetupGuide platformKey="shopifyWebhook" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

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
            expandedCard === "meta" ? "max-h-[1200px]" : "max-h-0"
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
              <SetupGuide platformKey="meta" />
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
            expandedCard === "tiktok" ? "max-h-[1200px]" : "max-h-0"
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
              <SetupGuide platformKey="tiktok" />
            </div>
          </div>
        </div>
      </div>

      {showLegacyDestinations && (
      <>
      {/* Reddit */}
      <div className="rounded-lg border border-white/[0.06] bg-card border-l-[3px] border-l-orange-500 overflow-hidden">
        <div
          className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
          onClick={() => toggleCard("reddit")}
        >
          <div className="text-orange-500 shrink-0">
            <FaReddit className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground text-sm">{t("redditTitle")}</p>
            <p className="text-xs text-muted-foreground truncate">
              {t("redditDesc")}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge connected={redditConnected} connectedLabel={t("connected")} notConnectedLabel={t("notConnected")} />
            <Switch
              checked={redditEnabled}
              onCheckedChange={(val) => {
                setRedditEnabled(val);
                handleToggle("reddit", val, "Reddit");
              }}
              onClick={(e) => e.stopPropagation()}
              className="scale-90"
            />
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                expandedCard === "reddit" ? "rotate-180" : ""
              }`}
            />
          </div>
        </div>
        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            expandedCard === "reddit" ? "max-h-[1200px]" : "max-h-0"
          }`}
        >
          <div className="space-y-4 p-6 pt-0 border-t border-white/[0.06]">
            <div className="pt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="reddit-account-id" className="text-xs">
                  {t("redditAccountId")}
                </Label>
                <Input
                  id="reddit-account-id"
                  value={redditAccountId}
                  onChange={(e) => setRedditAccountId(e.target.value)}
                  placeholder={t("redditAccountIdPlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="reddit-access-token" className="text-xs">
                    {t("redditAccessToken")}
                  </Label>
                  {workspace.hasRedditAccessToken && <EncryptedBadge label={t("encryptedAtRest")} />}
                </div>
                <Input
                  id="reddit-access-token"
                  type="password"
                  value={redditAccessToken}
                  onChange={(e) => setRedditAccessToken(e.target.value)}
                  placeholder={
                    workspace.hasRedditAccessToken
                      ? t("leaveBlankToKeep")
                      : t("redditAccessTokenPlaceholder")
                  }
                />
              </div>
              <div className="flex justify-end pt-2">
                <Button
                  variant="brand"
                  size="sm"
                  onClick={saveReddit}
                  disabled={savingReddit}
                >
                  {savingReddit ? tc("saving") : t("saveCredentials")}
                </Button>
              </div>
              <SetupGuide platformKey="reddit" />
            </div>
          </div>
        </div>
      </div>

      {/* Pinterest */}
      <div className="rounded-lg border border-white/[0.06] bg-card border-l-[3px] border-l-red-500 overflow-hidden">
        <div
          className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
          onClick={() => toggleCard("pinterest")}
        >
          <div className="text-red-500 shrink-0">
            <FaPinterest className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground text-sm">{t("pinterestTitle")}</p>
            <p className="text-xs text-muted-foreground truncate">
              {t("pinterestDesc")}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge connected={pinterestConnected} connectedLabel={t("connected")} notConnectedLabel={t("notConnected")} />
            <Switch
              checked={pinterestEnabled}
              onCheckedChange={(val) => {
                setPinterestEnabled(val);
                handleToggle("pinterest", val, "Pinterest");
              }}
              onClick={(e) => e.stopPropagation()}
              className="scale-90"
            />
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                expandedCard === "pinterest" ? "rotate-180" : ""
              }`}
            />
          </div>
        </div>
        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            expandedCard === "pinterest" ? "max-h-[1200px]" : "max-h-0"
          }`}
        >
          <div className="space-y-4 p-6 pt-0 border-t border-white/[0.06]">
            <div className="pt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="pinterest-ad-account-id" className="text-xs">
                  {t("pinterestAdAccountId")}
                </Label>
                <Input
                  id="pinterest-ad-account-id"
                  value={pinterestAdAccountId}
                  onChange={(e) => setPinterestAdAccountId(e.target.value)}
                  placeholder={t("pinterestAdAccountIdPlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="pinterest-conversion-token" className="text-xs">
                    {t("pinterestConversionToken")}
                  </Label>
                  {workspace.hasPinterestConversionToken && <EncryptedBadge label={t("encryptedAtRest")} />}
                </div>
                <Input
                  id="pinterest-conversion-token"
                  type="password"
                  value={pinterestConversionToken}
                  onChange={(e) => setPinterestConversionToken(e.target.value)}
                  placeholder={
                    workspace.hasPinterestConversionToken
                      ? t("leaveBlankToKeep")
                      : t("pinterestConversionTokenPlaceholder")
                  }
                />
              </div>
              <div className="flex justify-end pt-2">
                <Button
                  variant="brand"
                  size="sm"
                  onClick={savePinterest}
                  disabled={savingPinterest}
                >
                  {savingPinterest ? tc("saving") : t("saveCredentials")}
                </Button>
              </div>
              <SetupGuide platformKey="pinterest" />
            </div>
          </div>
        </div>
      </div>

      {/* Google Ads */}
      <div className="rounded-lg border border-white/[0.06] bg-card border-l-[3px] border-l-yellow-500 overflow-hidden">
        <div
          className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
          onClick={() => toggleCard("googleAds")}
        >
          <div className="text-yellow-500 shrink-0">
            <SiGoogleads className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground text-sm">{t("googleAdsTitle")}</p>
            <p className="text-xs text-muted-foreground truncate">
              {t("googleAdsDesc")}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge connected={googleAdsConnected} connectedLabel={t("connected")} notConnectedLabel={t("notConnected")} />
            <Switch
              checked={googleAdsEnabled}
              onCheckedChange={(val) => {
                setGoogleAdsEnabled(val);
                handleToggle("googleAds", val, "Google Ads");
              }}
              onClick={(e) => e.stopPropagation()}
              className="scale-90"
            />
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                expandedCard === "googleAds" ? "rotate-180" : ""
              }`}
            />
          </div>
        </div>
        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            expandedCard === "googleAds" ? "max-h-[1200px]" : "max-h-0"
          }`}
        >
          <div className="space-y-4 p-6 pt-0 border-t border-white/[0.06]">
            <div className="pt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="google-ads-conversion-id" className="text-xs">
                  {t("googleAdsConversionId")}
                </Label>
                <Input
                  id="google-ads-conversion-id"
                  value={googleAdsConversionId}
                  onChange={(e) => setGoogleAdsConversionId(e.target.value)}
                  placeholder={t("googleAdsConversionIdPlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="google-ads-label-purchase" className="text-xs">
                  {t("googleAdsLabelPurchase")}
                </Label>
                <Input
                  id="google-ads-label-purchase"
                  value={googleAdsLabelPurchase}
                  onChange={(e) => setGoogleAdsLabelPurchase(e.target.value)}
                  placeholder={t("googleAdsLabelPlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="google-ads-label-add-to-cart" className="text-xs">
                  {t("googleAdsLabelAddToCart")}
                  {" "}
                  <span className="text-muted-foreground">({t("optional")})</span>
                </Label>
                <Input
                  id="google-ads-label-add-to-cart"
                  value={googleAdsLabelAddToCart}
                  onChange={(e) => setGoogleAdsLabelAddToCart(e.target.value)}
                  placeholder={t("googleAdsLabelPlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="google-ads-label-checkout" className="text-xs">
                  {t("googleAdsLabelInitiateCheckout")}
                  {" "}
                  <span className="text-muted-foreground">({t("optional")})</span>
                </Label>
                <Input
                  id="google-ads-label-checkout"
                  value={googleAdsLabelInitiateCheckout}
                  onChange={(e) => setGoogleAdsLabelInitiateCheckout(e.target.value)}
                  placeholder={t("googleAdsLabelPlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="google-ads-label-view-content" className="text-xs">
                  {t("googleAdsLabelViewContent")}
                  {" "}
                  <span className="text-muted-foreground">({t("optional")})</span>
                </Label>
                <Input
                  id="google-ads-label-view-content"
                  value={googleAdsLabelViewContent}
                  onChange={(e) => setGoogleAdsLabelViewContent(e.target.value)}
                  placeholder={t("googleAdsLabelPlaceholder")}
                />
              </div>
              <div className="flex justify-end pt-2">
                <Button
                  variant="brand"
                  size="sm"
                  onClick={saveGoogleAds}
                  disabled={savingGoogleAds}
                >
                  {savingGoogleAds ? tc("saving") : t("saveCredentials")}
                </Button>
              </div>
              <SetupGuide platformKey="googleAds" />
            </div>
          </div>
        </div>
      </div>
      </>
      )}

        </div>
      </div>

      {showLegacyDestinations && (
      <>
      {/* Analytics & Automation */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t("analyticsAutomation")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">

      {/* GA4 */}
      <div className="rounded-lg border border-white/[0.06] bg-card border-l-[3px] border-l-amber-500 overflow-hidden">
        <div
          className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
          onClick={() => toggleCard("ga4")}
        >
          <div className="text-amber-500 shrink-0">
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
            expandedCard === "ga4" ? "max-h-[1200px]" : "max-h-0"
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
              <SetupGuide platformKey="ga4" />
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
            expandedCard === "klaviyo" ? "max-h-[1200px]" : "max-h-0"
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
              <SetupGuide platformKey="klaviyo" />
            </div>
          </div>
        </div>
      </div>

        </div>
      </div>
      </>
      )}
    </div>
  );
}
