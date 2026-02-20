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
import { Check, Copy } from "lucide-react";

type Step = 0 | 1 | 2;

const EVENT_NAMES = ["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase"] as const;

function MetaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a4.892 4.892 0 0 0 1.227 2.31c.58.597 1.31.88 2.084.88 1.077 0 2.026-.382 2.985-1.275.916-.853 1.858-2.13 2.874-3.842l.158-.267.156.267c.803 1.357 1.655 2.453 2.529 3.232.942.84 1.94 1.313 3.074 1.313.743 0 1.443-.257 2.035-.81.563-.525.981-1.278 1.226-2.17.256-.93.357-1.848.357-2.76 0-2.394-.7-4.82-1.955-6.752C15.696 5.248 13.974 4.03 12 4.03c-1.37 0-2.534.546-3.52 1.47l-.48.446-.48-.445C6.525 4.488 5.728 4.03 4.915 4.03h2zm0 1.84c.574 0 1.236.28 1.953.917.466.414.94.963 1.418 1.622l.15.209-.15.21c-1.538 2.167-2.637 3.478-3.384 4.182-.771.726-1.34.97-1.837.97-.376 0-.682-.124-.986-.454-.33-.358-.574-.869-.734-1.49a7.697 7.697 0 0 1-.197-1.587c0-2.275.604-4.548 1.596-6.124.487-.773 1.047-1.455 1.67-1.455h.5zm7.584 0c.658 0 1.312.38 1.937 1.083.635.713 1.2 1.725 1.637 2.91.467 1.267.713 2.636.713 3.586 0 .768-.078 1.498-.264 2.138-.173.594-.42 1.04-.73 1.337-.278.266-.56.372-.857.372-.654 0-1.312-.377-1.978-1.08-.62-.654-1.252-1.582-1.918-2.735l-.138-.238.138-.238c1.516-2.616 2.635-4.19 3.46-5.135z" />
    </svg>
  );
}

function GoogleAdsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7a5 5 0 0 0-5 5 5 5 0 0 0 5 5h4v-1.9H7A3.1 3.1 0 0 1 3.9 12M8 13h8v-2H8zm9-6h-4v1.9h4a3.1 3.1 0 0 1 3.1 3.1A3.1 3.1 0 0 1 17 15.1h-4V17h4a5 5 0 0 0 5-5 5 5 0 0 0-5-5" />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V9.21a8.16 8.16 0 0 0 4.76 1.52v-3.4a4.85 4.85 0 0 1-1-.64z" />
    </svg>
  );
}

function GA4Icon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.84 2.9v18.2a2.9 2.9 0 0 1-5.8 0V2.9a2.9 2.9 0 0 1 5.8 0zM14.1 21.1a2.9 2.9 0 0 1-5.8 0V9.59a2.9 2.9 0 0 1 5.8 0zM5.4 21.1a2.9 2.9 0 1 1-5.8 0 2.9 2.9 0 0 1 5.8 0z" />
    </svg>
  );
}

function KlaviyoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L2 19h20L12 2zm0 4.5L17.5 17h-11L12 6.5z" />
    </svg>
  );
}

const PLATFORMS = [
  { key: "meta", color: "bg-blue-500/15", textColor: "text-blue-400", borderColor: "border-blue-500/30", label: "Meta", descKey: "metaDescription" as const, Icon: MetaIcon },
  { key: "google", color: "bg-amber-500/15", textColor: "text-amber-400", borderColor: "border-amber-500/30", label: "Google Ads", descKey: "googleDescription" as const, Icon: GoogleAdsIcon },
  { key: "tiktok", color: "bg-pink-500/15", textColor: "text-pink-400", borderColor: "border-pink-500/30", label: "TikTok", descKey: "tiktokDescription" as const, Icon: TikTokIcon },
  { key: "ga4", color: "bg-orange-500/15", textColor: "text-orange-400", borderColor: "border-orange-500/30", label: "GA4", descKey: "ga4Description" as const, Icon: GA4Icon },
  { key: "klaviyo", color: "bg-emerald-500/15", textColor: "text-emerald-400", borderColor: "border-emerald-500/30", label: "Klaviyo", descKey: "klaviyoDescription" as const, Icon: KlaviyoIcon },
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

  // Step 1 state
  const [snippet, setSnippet] = useState("");
  const [copied, setCopied] = useState(false);

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
                    onChange={(e) => setStoreUrl(e.target.value)}
                    placeholder={t("storeUrlPlaceholder")}
                    required
                  />
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
                    disabled={savingStep0}
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
                  onClick={() => router.push("/settings")}
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
