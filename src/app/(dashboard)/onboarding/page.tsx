"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Check, Copy, Loader2 } from "lucide-react";
import { SiMeta, SiTiktok, SiGoogleanalytics, SiGoogleads } from "react-icons/si";
import { FaReddit, FaPinterest } from "react-icons/fa";
import type { IconType } from "react-icons";

type Step = 0 | 1 | 2;

const EVENT_NAMES = ["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase"] as const;

const KlaviyoIcon: IconType = ({ className, size, ...props }) => (
  <svg
    className={className}
    width={size ?? "1em"}
    height={size ?? "1em"}
    viewBox="0 0 152 152"
    fill="currentColor"
    {...props}
  >
    <path d="M148.76,124.01H3.24V26.63H148.76l-30.55,48.69,30.55,48.69Z" />
  </svg>
);

const PLATFORMS = [
  { key: "meta", color: "bg-blue-500/15", textColor: "text-blue-400", borderColor: "border-blue-500/30", label: "Meta", descKey: "metaDescription" as const, Icon: SiMeta },
  { key: "tiktok", color: "bg-pink-500/15", textColor: "text-pink-400", borderColor: "border-pink-500/30", label: "TikTok", descKey: "tiktokDescription" as const, Icon: SiTiktok },
  { key: "ga4", color: "bg-orange-500/15", textColor: "text-orange-400", borderColor: "border-orange-500/30", label: "GA4", descKey: "ga4Description" as const, Icon: SiGoogleanalytics },
  { key: "klaviyo", color: "bg-emerald-500/15", textColor: "text-emerald-400", borderColor: "border-emerald-500/30", label: "Klaviyo", descKey: "klaviyoDescription" as const, Icon: KlaviyoIcon },
  { key: "reddit", color: "bg-orange-500/15", textColor: "text-orange-400", borderColor: "border-orange-500/30", label: "Reddit", descKey: "redditDescription" as const, Icon: FaReddit },
  { key: "pinterest", color: "bg-red-500/15", textColor: "text-red-400", borderColor: "border-red-500/30", label: "Pinterest", descKey: "pinterestDescription" as const, Icon: FaPinterest },
  { key: "googleAds", color: "bg-yellow-500/15", textColor: "text-yellow-400", borderColor: "border-yellow-500/30", label: "Google Ads", descKey: "googleAdsDescription" as const, Icon: SiGoogleads },
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const t = useTranslations("onboarding");

  const STEPS = [t("step1"), t("step2"), t("step3")] as const;

  const [step, setStep] = useState<Step>(0);

  // Step 0 state
  const [workspaceName, setWorkspaceName] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [createdWorkspace, setCreatedWorkspace] = useState<{ id: string; apiKey: string } | null>(null);
  const [savingStep0, setSavingStep0] = useState(false);
  const [step0Error, setStep0Error] = useState("");

  // Domain resolution state
  const [domainStatus, setDomainStatus] = useState<"idle" | "resolving" | "verified" | "taken" | "not_shopify" | "error">("idle");
  const [resolvedDomain, setResolvedDomain] = useState("");

  // Step 1 state
  const [snippet, setSnippet] = useState("");
  const [copied, setCopied] = useState(false);

  async function handleResolveDomain(domain: string) {
    if (!domain.trim()) {
      setDomainStatus("idle");
      setResolvedDomain("");
      return;
    }
    setDomainStatus("resolving");
    try {
      const res = await fetch("/api/workspaces/resolve-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.trim() }),
      });
      if (!res.ok) {
        setDomainStatus("error");
        return;
      }
      const data = await res.json();
      if (data.error === "not_shopify_store") {
        setDomainStatus("not_shopify");
        setResolvedDomain("");
      } else if (data.available === false) {
        setDomainStatus("taken");
        setResolvedDomain(data.shopifyDomain);
      } else {
        setDomainStatus("verified");
        setResolvedDomain(data.shopifyDomain);
      }
    } catch {
      setDomainStatus("error");
    }
  }

  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceName.trim()) {
      setStep0Error(t("workspaceNameRequired"));
      return;
    }
    if (!storeUrl.trim()) {
      setStep0Error(t("storeUrlRequired"));
      return;
    }
    setSavingStep0(true);
    setStep0Error("");
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: workspaceName.trim(),
          domain: storeUrl.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Failed to create workspace");
      }
      const data = await res.json() as { id: string; apiKey: string };
      setCreatedWorkspace({ id: data.id, apiKey: data.apiKey });

      // Fetch the canonical snippet from the API
      const snippetRes = await fetch(`/api/snippet/${data.id}`);
      if (snippetRes.ok) {
        const snippetData = await snippetRes.json();
        setSnippet(snippetData.snippet);
      } else {
        setSnippet(t("failedSnippet"));
      }

      setStep(1);
    } catch (err) {
      setStep0Error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSavingStep0(false);
    }
  }

  async function handleCopySnippet() {
    if (!snippet) return;
    await navigator.clipboard.writeText(snippet).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Render as a full-screen overlay that covers the dashboard sidebar layout.
  // This avoids needing a separate route group while still giving onboarding
  // a clean, distraction-free full-page appearance.
  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto flex flex-col items-center justify-start py-12 px-4">
      {/* Background effects */}
      <div className="pointer-events-none fixed inset-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
      <div className="pointer-events-none fixed inset-0" style={{ background: 'radial-gradient(ellipse at center top, rgba(20,184,166,0.06) 0%, transparent 60%)' }} />
      {/* Logo */}
      <div className="mb-8 relative z-10">
        <span className="text-2xl font-bold text-foreground tracking-tight"><span className="text-brand-500">Track</span>&thinsp;Clear</span>
      </div>

      {/* Progress indicator */}
      <div className="w-full max-w-xl mb-8 relative z-10">
        <div className="flex items-center justify-between relative">
          <div className="absolute top-4 left-0 right-0 h-0.5 bg-border z-0" />
          <div
            className="absolute top-4 left-0 h-0.5 bg-gradient-to-r from-brand-600 to-brand-400 z-0 transition-all duration-500"
            style={{ width: step === 0 ? "0%" : step === 1 ? "50%" : "100%" }}
          />
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-col items-center z-10 gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${
                  i < step
                    ? "bg-brand-600 border-brand-600 text-white"
                    : i === step
                    ? "bg-card border-brand-500 text-brand-500 shadow-md shadow-brand-500/20"
                    : "bg-card border-border text-muted-foreground"
                }`}
              >
                {i < step ? (
                  <Check className="h-4 w-4" />
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`text-xs font-medium ${
                  i === step ? "text-brand-500" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="w-full max-w-xl relative z-10">
        {/* Step 0 — Create Workspace */}
        {step === 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">{t("createTitle")}</CardTitle>
              <CardDescription>{t("createDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateWorkspace} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="onb-workspace-name">
                    {t("workspaceName")} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="onb-workspace-name"
                    type="text"
                    autoComplete="organization"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    placeholder={t("workspaceNamePlaceholder")}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="onb-store-url">
                    {t("storeUrl")} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="onb-store-url"
                    type="text"
                    autoComplete="url"
                    value={storeUrl}
                    onChange={(e) => { setStoreUrl(e.target.value); setDomainStatus("idle"); }}
                    onBlur={() => handleResolveDomain(storeUrl)}
                    placeholder={t("storeUrlPlaceholder")}
                    required
                  />
                  {domainStatus === "resolving" && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t("domainResolving")}
                    </p>
                  )}
                  {domainStatus === "verified" && (
                    <p className="text-sm text-green-500 flex items-center gap-1.5 mt-1">
                      <Check className="h-3.5 w-3.5" />
                      {t("domainVerified", { shopifyDomain: resolvedDomain })}
                    </p>
                  )}
                  {domainStatus === "taken" && (
                    <p className="text-sm text-red-500 flex items-center gap-1.5 mt-1">
                      {t("domainTaken")}
                    </p>
                  )}
                  {domainStatus === "not_shopify" && (
                    <p className="text-sm text-yellow-500 flex items-center gap-1.5 mt-1">
                      {t("domainNotShopify")}
                    </p>
                  )}
                  {domainStatus === "error" && (
                    <p className="text-sm text-orange-500 flex items-center gap-1.5 mt-1">
                      {t("domainError")}
                    </p>
                  )}
                </div>

                {step0Error && (
                  <Alert variant="destructive">
                    <AlertDescription>{step0Error}</AlertDescription>
                  </Alert>
                )}

                <div className="flex items-center justify-between pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => router.push("/")}
                  >
                    {t("backToHome")}
                  </Button>
                  <Button
                    type="submit"
                    variant="brand"
                    disabled={savingStep0 || domainStatus === "taken"}
                  >
                    {savingStep0 ? t("creating") : t("continue")}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Step 1 — Install snippet */}
        {step === 1 && createdWorkspace && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">{t("installTitle")}</CardTitle>
              <CardDescription>{t("installDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <div className="relative">
                  <div className="bg-black/60 border border-white/[0.06] rounded-lg overflow-hidden">
                    <pre className="p-4 text-xs text-foreground/60 leading-relaxed font-mono whitespace-pre-wrap break-all max-h-24 overflow-hidden">
                      {snippet || t("loadingSnippet")}
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
                            {t("copiedSnippet")}
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4 mr-2" />
                            {t("copySnippet")}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <Alert className="border-brand-500/20 bg-brand-500/10">
                <AlertDescription>
                  <p className="text-sm font-semibold text-brand-400 mb-2">{t("shopifySteps")}</p>
                  <ol className="list-decimal list-inside space-y-1.5 text-sm text-brand-300">
                    <li>{t("shopifyStep1")}</li>
                    <li>{t("shopifyStep2")}</li>
                    <li>{t("shopifyStep3")}</li>
                    <li>{t("shopifyStep4")}</li>
                  </ol>
                </AlertDescription>
              </Alert>

              <div>
                <p className="text-sm font-medium text-foreground mb-2">{t("trackedEvents")}</p>
                <div className="flex flex-wrap gap-2">
                  {EVENT_NAMES.map((name) => (
                    <Badge key={name} variant="secondary">
                      {name}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep(2)}
                >
                  {t("skipForNow")}
                </Button>
                <Button
                  type="button"
                  variant="brand"
                  onClick={() => setStep(2)}
                >
                  {t("continue")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2 — Connect Platforms */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">{t("connectTitle")}</CardTitle>
              <CardDescription>{t("connectDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {PLATFORMS.map((platform) => (
                  <div
                    key={platform.key}
                    className={`flex items-center gap-3 rounded-lg border ${platform.borderColor} ${platform.color} px-4 py-3`}
                  >
                    <div className="h-9 w-9 flex-shrink-0 flex items-center justify-center">
                      <platform.Icon className={`h-7 w-7 ${platform.textColor}`} />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${platform.textColor} leading-tight`}>{platform.label}</p>
                      <p className="text-xs text-muted-foreground leading-tight mt-0.5">{t(platform.descKey)}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="brand"
                  className="w-full"
                  onClick={() => router.push("/integrations")}
                >
                  {t("setupIntegrations")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => router.push("/dashboard")}
                >
                  {t("goToDashboard")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
