"use client";

import { useState, useEffect, useCallback } from "react";
import { ConsentMode } from "@prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { Copy, Check, Globe2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface Workspace {
  id: string;
  consentMode: ConsentMode;
  catalogIdMode: string;
  catalogIdPrefix: string | null;
  catalogIdSuffix: string | null;
  catalogIdTemplate: string | null;
  customIngestDomain: string | null;
  customIngestDomainVerifiedAt: string | null;
  customIngestDomainLastCheckedAt: string | null;
  customIngestDomainLastError: string | null;
  enablePageView: boolean;
  enableViewContent: boolean;
  enableAddToCart: boolean;
  enableInitiateCheckout: boolean;
  enablePurchase: boolean;
}

interface UserPreferences {
  displayCurrency: string;
  language: string;
}

interface SettingsFormProps {
  workspace: Workspace;
  userPreferences: UserPreferences;
}

const CURRENCIES: { code: string; symbol: string }[] = [
  { code: "USD", symbol: "$" },
  { code: "EUR", symbol: "\u20AC" },
  { code: "GBP", symbol: "\u00A3" },
  { code: "CHF", symbol: "CHF" },
  { code: "BRL", symbol: "R$" },
  { code: "AUD", symbol: "A$" },
  { code: "CAD", symbol: "C$" },
  { code: "JPY", symbol: "\u00A5" },
  { code: "INR", symbol: "\u20B9" },
  { code: "MXN", symbol: "MX$" },
  { code: "PLN", symbol: "z\u0142" },
  { code: "SEK", symbol: "kr" },
  { code: "NOK", symbol: "kr" },
  { code: "DKK", symbol: "kr" },
  { code: "CZK", symbol: "K\u010D" },
  { code: "HUF", symbol: "Ft" },
  { code: "RON", symbol: "lei" },
  { code: "BGN", symbol: "\u043B\u0432" },
  { code: "TRY", symbol: "\u20BA" },
  { code: "ZAR", symbol: "R" },
  { code: "NZD", symbol: "NZ$" },
  { code: "SGD", symbol: "S$" },
  { code: "HKD", symbol: "HK$" },
  { code: "KRW", symbol: "\u20A9" },
];

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "pt", label: "Portuguese" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
];

const CATALOG_ID_MODES = [
  {
    value: "VARIANT_NUMERIC_ID",
    label: "Variant numeric ID",
    description: "Default for Shopify catalogs that use variant IDs.",
  },
  {
    value: "PRODUCT_NUMERIC_ID",
    label: "Product numeric ID",
    description: "Use when Meta/TikTok catalogs are keyed by product ID.",
  },
  {
    value: "VARIANT_GRAPHQL_ID",
    label: "Variant GraphQL ID",
    description: "Use full Shopify variant GIDs.",
  },
  {
    value: "PRODUCT_GRAPHQL_ID",
    label: "Product GraphQL ID",
    description: "Use full Shopify product GIDs.",
  },
  {
    value: "SKU",
    label: "SKU",
    description: "Use SKU values when the ad catalog is SKU keyed.",
  },
  {
    value: "CUSTOM",
    label: "Custom template",
    description: "Render a template such as {{variant_id}}_{{country}}.",
  },
] as const;

const CUSTOM_INGEST_CNAME_TARGET =
  process.env.NEXT_PUBLIC_CUSTOM_INGEST_CNAME_TARGET || "cname.vercel-dns.com";
const TRACKCLEAR_APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://www.trackclear.io").replace(
  /\/$/,
  ""
);

export function SettingsForm({ workspace, userPreferences }: SettingsFormProps) {
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

  // Catalog ID state
  const [catalogSettings, setCatalogSettings] = useState({
    catalogIdMode: workspace.catalogIdMode ?? "VARIANT_NUMERIC_ID",
    catalogIdPrefix: workspace.catalogIdPrefix ?? "",
    catalogIdSuffix: workspace.catalogIdSuffix ?? "",
    catalogIdTemplate: workspace.catalogIdTemplate ?? "",
  });
  const [savingCatalog, setSavingCatalog] = useState(false);

  // Custom ingest domain state
  const [customDomain, setCustomDomain] = useState({
    input: workspace.customIngestDomain ?? "",
    savedDomain: workspace.customIngestDomain ?? "",
    verifiedAt: workspace.customIngestDomainVerifiedAt,
    lastCheckedAt: workspace.customIngestDomainLastCheckedAt,
    lastError: workspace.customIngestDomainLastError,
  });
  const [savingCustomDomain, setSavingCustomDomain] = useState(false);
  const [verifyingCustomDomain, setVerifyingCustomDomain] = useState(false);

  // User preferences state
  const [displayCurrency, setDisplayCurrency] = useState(userPreferences.displayCurrency);
  const [language, setLanguage] = useState(userPreferences.language);
  const [savingPreferences, setSavingPreferences] = useState(false);

  // Snippet state
  const [snippet, setSnippet] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [helperCopied, setHelperCopied] = useState(false);

  // Danger zone state
  const [rotatingKey, setRotatingKey] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  const loadSnippet = useCallback(() => {
    return fetch(`/api/snippet/${workspace.id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setSnippet(data.snippet))
      .catch(() => setSnippet("// Failed to load snippet. Please refresh."));
  }, [workspace.id]);

  useEffect(() => {
    loadSnippet();
  }, [loadSnippet]);

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

  async function handleSaveCatalog(e: React.FormEvent) {
    e.preventDefault();
    setSavingCatalog(true);
    try {
      await patchWorkspace({
        catalogIdMode: catalogSettings.catalogIdMode,
        catalogIdPrefix: catalogSettings.catalogIdPrefix.trim() || null,
        catalogIdSuffix: catalogSettings.catalogIdSuffix.trim() || null,
        catalogIdTemplate: catalogSettings.catalogIdTemplate.trim() || null,
      });
      toast.success("Catalog ID settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingCatalog(false);
    }
  }

  async function handleSaveCustomDomain(e: React.FormEvent) {
    e.preventDefault();
    setSavingCustomDomain(true);
    try {
      const data = await patchWorkspace({
        customIngestDomain: customDomain.input.trim() || null,
      });
      setCustomDomain({
        input: data.customIngestDomain ?? "",
        savedDomain: data.customIngestDomain ?? "",
        verifiedAt: data.customIngestDomainVerifiedAt ?? null,
        lastCheckedAt: data.customIngestDomainLastCheckedAt ?? null,
        lastError: data.customIngestDomainLastError ?? null,
      });
      await loadSnippet();
      toast.success(data.customIngestDomain ? "Custom ingest domain saved" : "Custom ingest domain cleared");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingCustomDomain(false);
    }
  }

  async function handleVerifyCustomDomain() {
    setVerifyingCustomDomain(true);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/custom-ingest-domain/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      setCustomDomain((prev) => ({
        ...prev,
        savedDomain: data.customIngestDomain ?? prev.savedDomain,
        verifiedAt: data.customIngestDomainVerifiedAt ?? null,
        lastCheckedAt: data.customIngestDomainLastCheckedAt ?? null,
        lastError: data.customIngestDomainLastError ?? data.error ?? null,
      }));
      if (!res.ok) {
        throw new Error(data.error ?? "Domain verification failed");
      }
      await loadSnippet();
      toast.success("Custom ingest domain verified");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Domain verification failed");
    } finally {
      setVerifyingCustomDomain(false);
    }
  }

  async function handleSavePreferences(e: React.FormEvent) {
    e.preventDefault();
    setSavingPreferences(true);
    try {
      const res = await fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayCurrency, language }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save");
      }

      // Set locale cookie for next-intl
      document.cookie = `locale=${language};path=/;max-age=31536000;samesite=lax`;

      toast.success("Preferences saved");

      // Reload if language changed to apply translations
      if (language !== userPreferences.language) {
        window.location.reload();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingPreferences(false);
    }
  }

  async function handleCopySnippet() {
    await navigator.clipboard.writeText(snippet).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleCopyCartHelper() {
    await navigator.clipboard.writeText(cartHelperSnippet).catch(() => {});
    setHelperCopied(true);
    setTimeout(() => setHelperCopied(false), 2000);
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

  const normalizedCustomDomainInput = customDomain.input.trim().toLowerCase();
  const customDomainDirty = normalizedCustomDomainInput !== customDomain.savedDomain;
  const customDomainVerified =
    !!customDomain.savedDomain && !customDomainDirty && !!customDomain.verifiedAt;
  const customDomainStatus = !customDomain.savedDomain
    ? "Not configured"
    : customDomainDirty
      ? "Unsaved changes"
      : customDomainVerified
        ? "Verified"
        : "Needs verification";
  const customDomainStatusClass = customDomainVerified
    ? "border-green-500/30 bg-green-500/10 text-green-300"
    : customDomainDirty
      ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
      : customDomain.savedDomain
        ? "border-red-500/30 bg-red-500/10 text-red-300"
        : "border-white/[0.08] bg-white/[0.03] text-muted-foreground";
  const customDomainLastChecked = customDomain.lastCheckedAt
    ? new Date(customDomain.lastCheckedAt).toLocaleString()
    : null;
  const cartHelperSnippet = `<script async src="${TRACKCLEAR_APP_URL}/api/cart-helper/${workspace.id}"></script>`;

  return (
    <div className="space-y-8">
      {/* Display Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Display Preferences</CardTitle>
          <CardDescription>Set your preferred currency and language for the dashboard.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSavePreferences}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="displayCurrency">Display Currency</Label>
                <select
                  id="displayCurrency"
                  value={displayCurrency}
                  onChange={(e) => setDisplayCurrency(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">Revenue values will be converted to this currency.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <select
                  id="language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">Dashboard and UI text will display in this language.</p>
              </div>
            </div>
            <div className="flex justify-end pt-4">
              <Button type="submit" variant="brand" disabled={savingPreferences}>
                {savingPreferences ? "Saving\u2026" : "Save preferences"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Event Toggles */}
      <Card>
        <CardHeader>
          <CardTitle>Event Toggles</CardTitle>
          <CardDescription>Choose which events to forward to your connected platforms.</CardDescription>
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

      {/* Consent Mode */}
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
                  <p className="text-xs text-muted-foreground mt-0.5">Forward events unless the relevant analytics or marketing consent is explicitly denied.</p>
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

      {/* Catalog ID Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Catalog ID Matching</CardTitle>
          <CardDescription>
            Match TrackClear content IDs to the IDs used by your Meta and TikTok product catalogs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveCatalog} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="catalogIdMode">Content ID mode</Label>
              <select
                id="catalogIdMode"
                value={catalogSettings.catalogIdMode}
                onChange={(e) =>
                  setCatalogSettings((prev) => ({ ...prev, catalogIdMode: e.target.value }))
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {CATALOG_ID_MODES.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {CATALOG_ID_MODES.find((mode) => mode.value === catalogSettings.catalogIdMode)?.description}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="catalogIdPrefix">Prefix</Label>
                <Input
                  id="catalogIdPrefix"
                  value={catalogSettings.catalogIdPrefix}
                  onChange={(e) =>
                    setCatalogSettings((prev) => ({ ...prev, catalogIdPrefix: e.target.value }))
                  }
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="catalogIdSuffix">Suffix</Label>
                <Input
                  id="catalogIdSuffix"
                  value={catalogSettings.catalogIdSuffix}
                  onChange={(e) =>
                    setCatalogSettings((prev) => ({ ...prev, catalogIdSuffix: e.target.value }))
                  }
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="catalogIdTemplate">Custom template</Label>
              <Input
                id="catalogIdTemplate"
                value={catalogSettings.catalogIdTemplate}
                onChange={(e) =>
                  setCatalogSettings((prev) => ({ ...prev, catalogIdTemplate: e.target.value }))
                }
                placeholder="{{variant_id}}"
              />
              <p className="text-xs text-muted-foreground">
                Available tokens: {"{{variant_id}}"}, {"{{product_id}}"}, {"{{variant_graphql_id}}"}, {"{{product_graphql_id}}"}, {"{{sku}}"}, {"{{country}}"}.
              </p>
            </div>

            <div className="flex justify-end">
              <Button type="submit" variant="brand" disabled={savingCatalog}>
                {savingCatalog ? "Saving\u2026" : "Save catalog settings"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Custom Ingest Domain */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Custom Ingest Domain</CardTitle>
              <CardDescription>
                Route the pixel loader and event ingest through a verified merchant-owned subdomain.
              </CardDescription>
            </div>
            <Badge variant="outline" className={customDomainStatusClass}>
              {customDomainStatus}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveCustomDomain} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="customIngestDomain">Subdomain</Label>
              <Input
                id="customIngestDomain"
                value={customDomain.input}
                onChange={(e) =>
                  setCustomDomain((prev) => ({ ...prev, input: e.target.value }))
                }
                placeholder="t.example.com"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                Use a dedicated subdomain such as t.yourstore.com. After TrackClear adds it in Vercel,
                create the DNS record Vercel requests. Common CNAME target:{" "}
                <code className="rounded bg-black/40 px-1 py-0.5 text-foreground/70">
                  {CUSTOM_INGEST_CNAME_TARGET}
                </code>
                .
              </p>
            </div>

            <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-muted-foreground">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <span className="text-foreground/80">Active endpoint:</span>{" "}
                  {customDomainVerified
                    ? `https://${customDomain.savedDomain}/api/events/ingest`
                    : "Default TrackClear ingest endpoint"}
                </div>
                <div>
                  <span className="text-foreground/80">Last checked:</span>{" "}
                  {customDomainLastChecked ?? "Never"}
                </div>
              </div>
              {customDomain.lastError && !customDomainVerified && (
                <p className="mt-2 text-red-300">{customDomain.lastError}</p>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="submit" variant="outline" disabled={savingCustomDomain}>
                <Globe2 className="h-4 w-4 mr-2" />
                {savingCustomDomain ? "Saving..." : "Save domain"}
              </Button>
              <Button
                type="button"
                variant="brand"
                onClick={handleVerifyCustomDomain}
                disabled={
                  verifyingCustomDomain ||
                  savingCustomDomain ||
                  !customDomain.savedDomain ||
                  customDomainDirty
                }
                title={customDomainDirty ? "Save the domain before verifying." : undefined}
              >
                <ShieldCheck className="h-4 w-4 mr-2" />
                {verifyingCustomDomain ? "Verifying..." : "Verify domain"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Cart Attribution Helper */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Cart Attribution Helper</CardTitle>
              <CardDescription>
                Required for reliable Shopify purchase attribution. Install this helper in your Shopify theme so click IDs and TrackClear session IDs survive into Shopify order webhooks.
              </CardDescription>
            </div>
            <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
              Required
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="relative">
              <div className="bg-black/60 border border-white/[0.06] rounded-lg overflow-hidden">
                <pre className="p-4 text-xs text-foreground/60 leading-relaxed font-mono whitespace-pre-wrap break-all max-h-24 overflow-hidden">
                  {cartHelperSnippet}
                </pre>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent pt-12 pb-3 px-4 rounded-b-lg">
                  <Button
                    type="button"
                    variant="brand"
                    className="w-full"
                    onClick={handleCopyCartHelper}
                  >
                    {helperCopied ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy helper
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Add this to Shopify Admin &gt; Online Store &gt; Themes &gt; Edit code &gt; <code className="rounded bg-black/40 px-1 py-0.5 text-foreground/70">theme.liquid</code> before <code className="rounded bg-black/40 px-1 py-0.5 text-foreground/70">&lt;/head&gt;</code>, or install it with a Custom Liquid block/theme app block equivalent.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* JS Snippet */}
      <Card>
        <CardHeader>
          <CardTitle>JS Snippet</CardTitle>
          <CardDescription>Add this script to your Shopify Custom Pixel.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <div className="bg-black/60 border border-white/[0.06] rounded-lg overflow-hidden">
              <pre className="p-4 text-xs text-foreground/60 leading-relaxed font-mono whitespace-pre-wrap break-all max-h-24 overflow-hidden">
                {snippet || "Loading snippet\u2026"}
              </pre>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent pt-12 pb-3 px-4 rounded-b-lg">
                <Button
                  type="button"
                  variant="brand"
                  className="w-full"
                  onClick={handleCopySnippet}
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy snippet
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Go to Shopify Admin &gt; Settings &gt; Customer Events &gt; Add Custom Pixel, then paste the snippet above.
          </p>
        </CardContent>
      </Card>

      {/* Danger Zone */}
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
