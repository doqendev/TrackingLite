"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Check, Copy, Zap, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

const STEPS = ["Workspace & Meta", "Install Snippet", "Verify"] as const;
type Step = 0 | 1 | 2;

const EVENT_NAMES = ["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase"] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);

  // Step 0 state
  const [workspaceName, setWorkspaceName] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [createdWorkspace, setCreatedWorkspace] = useState<{ id: string; apiKey: string } | null>(null);
  const [savingStep0, setSavingStep0] = useState(false);
  const [step0Error, setStep0Error] = useState("");

  // Step 1 state
  const [snippet, setSnippet] = useState("");
  const [copied, setCopied] = useState(false);

  // Step 2 state
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<"success" | "failure" | null>(null);
  const [verifyMessage, setVerifyMessage] = useState("");

  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceName.trim()) {
      setStep0Error("Workspace name is required.");
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
          metaPixelId: pixelId.trim() || undefined,
          metaAccessToken: accessToken.trim() || undefined,
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
        setSnippet("// Failed to load snippet. Please check Settings after setup.");
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

  async function handleSendTestEvent() {
    if (!createdWorkspace) return;
    setVerifying(true);
    setVerifyResult(null);
    setVerifyMessage("");
    try {
      const res = await fetch("/api/events/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-TL-API-Key": createdWorkspace.apiKey,
        },
        body: JSON.stringify({
          eventName: "PageView",
          eventId: crypto.randomUUID(),
          timestamp: Date.now(),
          url: window.location.href,
          referrer: "",
          consent: { analyticsAllowed: true, marketingAllowed: true },
        }),
      });
      if (res.ok) {
        setVerifyResult("success");
        setVerifyMessage("Test event received! Your snippet is working correctly.");
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setVerifyResult("failure");
        setVerifyMessage(body.error ?? "Event not received. Check your snippet installation.");
      }
    } catch {
      setVerifyResult("failure");
      setVerifyMessage("Could not reach the ingest endpoint. Make sure the app is deployed.");
    } finally {
      setVerifying(false);
    }
  }

  function handleFinish() {
    router.push("/dashboard");
  }

  // Render as a full-screen overlay that covers the dashboard sidebar layout.
  // This avoids needing a separate route group while still giving onboarding
  // a clean, distraction-free full-page appearance.
  return (
    <div className="fixed inset-0 z-50 bg-muted overflow-y-auto flex flex-col items-center justify-start py-12 px-4">
      {/* Logo */}
      <div className="mb-8">
        <span className="text-2xl font-bold text-brand-500">TrackingLite</span>
      </div>

      {/* Progress indicator */}
      <div className="w-full max-w-xl mb-8">
        <div className="flex items-center justify-between relative">
          <div className="absolute top-4 left-0 right-0 h-0.5 bg-border z-0" />
          <div
            className="absolute top-4 left-0 h-0.5 bg-brand-500 z-0 transition-all duration-500"
            style={{ width: step === 0 ? "0%" : step === 1 ? "50%" : "100%" }}
          />
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-col items-center z-10 gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${
                  i < step
                    ? "bg-brand-600 border-brand-600 text-white"
                    : i === step
                    ? "bg-card border-brand-500 text-brand-500"
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
                  i === step ? "text-brand-500" : i < step ? "text-muted-foreground" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="w-full max-w-xl">
        {/* Step 0 — Workspace & Meta credentials */}
        {step === 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Create your workspace</CardTitle>
              <CardDescription>
                Set up your store and optionally add Meta credentials. You can add them later in Settings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateWorkspace} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="workspaceName">
                    Workspace Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="workspaceName"
                    type="text"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    placeholder="My Shopify Store"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="storeUrl">
                    Store URL <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="storeUrl"
                    type="text"
                    value={storeUrl}
                    onChange={(e) => setStoreUrl(e.target.value)}
                    placeholder="mystore.myshopify.com"
                  />
                </div>

                <div className="border-t border-border pt-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Meta CAPI (optional — add later in Settings)
                  </p>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="pixelId">Meta Pixel ID</Label>
                      <Input
                        id="pixelId"
                        type="text"
                        value={pixelId}
                        onChange={(e) => setPixelId(e.target.value)}
                        placeholder="123456789012345"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="accessToken">Access Token</Label>
                      <Input
                        id="accessToken"
                        type="password"
                        value={accessToken}
                        onChange={(e) => setAccessToken(e.target.value)}
                        placeholder="EAAxxxxx..."
                      />
                    </div>
                  </div>
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
                    onClick={() => router.push("/dashboard")}
                  >
                    Skip for now
                  </Button>
                  <Button
                    type="submit"
                    variant="brand"
                    disabled={savingStep0}
                  >
                    {savingStep0 ? "Creating..." : "Continue"}
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
              <CardTitle className="text-xl">Install the tracking snippet</CardTitle>
              <CardDescription>
                Go to Shopify Admin &gt; Settings &gt; Customer Events &gt; Add Custom Pixel, then paste the snippet above.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-foreground">Your JS Snippet</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCopySnippet}
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copy snippet
                      </>
                    )}
                  </Button>
                </div>
                <pre className="bg-zinc-900 text-zinc-100 rounded-lg p-4 text-xs overflow-x-auto leading-relaxed font-mono whitespace-pre-wrap break-all">
                  {snippet || "Loading snippet..."}
                </pre>
              </div>

              <Alert className="border-brand-500/20 bg-brand-500/10">
                <AlertDescription>
                  <p className="text-sm font-semibold text-brand-400 mb-2">Shopify Installation Steps</p>
                  <ol className="list-decimal list-inside space-y-1.5 text-sm text-brand-300">
                    <li>Go to <strong>Settings &rarr; Customer Events</strong> in your Shopify admin</li>
                    <li>Click <strong>Add Custom Pixel</strong></li>
                    <li>Give it a name (e.g. &quot;TrackingLite&quot;) and paste the snippet above</li>
                    <li>Click <strong>Save &amp; Connect</strong></li>
                  </ol>
                </AlertDescription>
              </Alert>

              <div>
                <p className="text-sm font-medium text-foreground mb-2">Events that will be tracked:</p>
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
                  Skip for now
                </Button>
                <Button
                  type="button"
                  variant="brand"
                  onClick={() => setStep(2)}
                >
                  Continue to verify
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2 — Verify */}
        {step === 2 && createdWorkspace && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Verify your setup</CardTitle>
              <CardDescription>
                Send a test event to confirm everything is working end-to-end.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <Card className="bg-muted shadow-none">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">Your API Key</p>
                  <code className="text-sm font-mono text-foreground">{createdWorkspace.apiKey}</code>
                </CardContent>
              </Card>

              <Button
                type="button"
                variant="brand"
                className="w-full"
                onClick={handleSendTestEvent}
                disabled={verifying}
              >
                {verifying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending test event...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Send Test Event
                  </>
                )}
              </Button>

              {verifyResult === "success" && (
                <Alert className="border-green-500/20 bg-green-500/10">
                  <CheckCircle2 className="h-5 w-5 text-green-400" />
                  <AlertDescription className="text-green-400">
                    <p className="font-semibold">It&apos;s working!</p>
                    <p className="mt-0.5">{verifyMessage}</p>
                  </AlertDescription>
                </Alert>
              )}

              {verifyResult === "failure" && (
                <Alert variant="destructive">
                  <AlertCircle className="h-5 w-5" />
                  <AlertDescription>
                    <p className="font-semibold">Something went wrong</p>
                    <p className="mt-0.5">{verifyMessage}</p>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleFinish}
                >
                  Skip for now
                </Button>
                <Button
                  type="button"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={handleFinish}
                >
                  Go to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
