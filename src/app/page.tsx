import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  ArrowRight,
  Check,
  Shield,
  BarChart3,
  Smartphone,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* ── Sticky Nav ── */}
      <header className="sticky top-0 z-50 border-b border-transparent bg-background/80 backdrop-blur-md" style={{ borderImage: 'linear-gradient(to right, transparent, rgba(255,255,255,0.06), transparent) 1' }}>
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight text-foreground"
          >
            <span className="text-brand-500">T</span>rackingLite
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Log in</Link>
            </Button>
            <Button variant="brand" size="sm" asChild>
              <Link href="/signup">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ── Hero ── */}
        <section
          className="relative overflow-hidden"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        >
          <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at center top, rgba(20,184,166,0.06) 0%, transparent 60%)' }} />
          <div className="mx-auto max-w-5xl px-6 pb-28 pt-24 sm:pb-32 sm:pt-28">
            <div className="mx-auto max-w-2xl text-center animate-fade-in-up">
              <Badge
                variant="outline"
                className="mb-8 rounded-full border-white/[0.10] bg-white/[0.03] px-3.5 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm"
              >
                Server-side Meta CAPI for Shopify
              </Badge>

              <h1 className="mb-6 text-4xl font-bold leading-[1.08] tracking-tighter text-foreground sm:text-5xl md:text-[3.5rem]">
                Your Meta Pixel misses
                <br />
                20-40% of conversions.
                <br />
                <span className="text-gradient">We catch them.</span>
              </h1>

              <p className="mx-auto mb-10 max-w-lg text-base leading-relaxed text-muted-foreground">
                Ad blockers silently drop requests to{" "}
                <code className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-xs text-foreground/70">
                  connect.facebook.net
                </code>{" "}
                before your pixel fires. TrackingLite captures every event
                server-side and forwards it to Meta&apos;s Conversions API. Setup
                takes 10 minutes. No developer needed.
              </p>

              <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Button variant="brand" size="lg" asChild className="gap-2">
                  <Link href="/signup">
                    Start free — no card needed
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  asChild
                  className="border-white/[0.08] bg-transparent hover:bg-white/[0.03]"
                >
                  <Link href="#how-it-works">See how it works</Link>
                </Button>
              </div>

              <p className="mt-5 text-xs text-muted-foreground/60">
                Free forever up to 50 orders/mo &middot; No credit card required
              </p>
            </div>
          </div>
        </section>

        {/* ── Event Flow Terminal ── */}
        <section className="border-t border-white/[0.06]">
          <div className="mx-auto max-w-5xl px-6 py-24">
            <div className="mb-8 text-center">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                Live event pipeline
              </p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Every event, every time
              </h2>
            </div>

            <div className="mx-auto max-w-2xl overflow-hidden rounded-lg border border-white/[0.06] glow-card bg-white/[0.02]">
              {/* Terminal chrome */}
              <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
                <div className="h-2.5 w-2.5 rounded-full bg-white/[0.08]" />
                <div className="h-2.5 w-2.5 rounded-full bg-white/[0.08]" />
                <div className="h-2.5 w-2.5 rounded-full bg-white/[0.08]" />
                <span className="ml-2 text-[11px] text-muted-foreground/40">
                  trackinglite &mdash; event pipeline
                </span>
              </div>

              {/* Terminal content */}
              <pre className="overflow-x-auto px-5 py-5 font-mono text-[13px] leading-relaxed">
                <code>
                  <span className="text-muted-foreground/50">{"// "}PageView from shop.example.com</span>
                  {"\n"}
                  <span className="text-foreground/90">{"\u2192"} PageView captured</span>
                  <span className="text-muted-foreground/40">{"          0.2ms"}</span>
                  {"\n"}
                  <span className="text-muted-foreground/60">{"  \u251C"} PII hashed (SHA-256)</span>
                  <span className="text-muted-foreground/40">{"     0.1ms"}</span>
                  {"\n"}
                  <span className="text-muted-foreground/60">{"  \u251C"} Phone normalized (E.164)</span>
                  <span className="text-muted-foreground/40">{" 0.1ms"}</span>
                  {"\n"}
                  <span className="text-muted-foreground/60">{"  \u2514"} Sent to Meta CAPI</span>
                  <span className="text-muted-foreground/40">{"        142ms  "}</span>
                  <span className="text-brand-500"><span className="animate-pulse-glow">{"\u2713"}</span>{" 200 OK"}</span>
                  {"\n\n"}
                  <span className="text-muted-foreground/50">{"// "}Purchase $127.50 &mdash; order #4891</span>
                  {"\n"}
                  <span className="text-foreground/90">{"\u2192"} Purchase captured</span>
                  <span className="text-muted-foreground/40">{"          0.3ms"}</span>
                  {"\n"}
                  <span className="text-muted-foreground/60">{"  \u251C"} PII hashed (SHA-256)</span>
                  <span className="text-muted-foreground/40">{"     0.1ms"}</span>
                  {"\n"}
                  <span className="text-muted-foreground/60">{"  \u251C"} Dedup: event_id matched</span>
                  <span className="text-muted-foreground/40">{" 0.0ms"}</span>
                  {"\n"}
                  <span className="text-muted-foreground/60">{"  \u2514"} Sent to Meta CAPI</span>
                  <span className="text-muted-foreground/40">{"        138ms  "}</span>
                  <span className="text-brand-500"><span className="animate-pulse-glow">{"\u2713"}</span>{" 200 OK"}</span>
                  {"\n\n"}
                  <span className="text-muted-foreground/50">{"// "}AddToCart &mdash; SKU-8812 x2</span>
                  {"\n"}
                  <span className="text-foreground/90">{"\u2192"} AddToCart captured</span>
                  <span className="text-muted-foreground/40">{"         0.2ms"}</span>
                  {"\n"}
                  <span className="text-muted-foreground/60">{"  \u251C"} PII hashed (SHA-256)</span>
                  <span className="text-muted-foreground/40">{"     0.1ms"}</span>
                  {"\n"}
                  <span className="text-muted-foreground/60">{"  \u2514"} Sent to Meta CAPI</span>
                  <span className="text-muted-foreground/40">{"        129ms  "}</span>
                  <span className="text-brand-500"><span className="animate-pulse-glow">{"\u2713"}</span>{" 200 OK"}</span>
                </code>
              </pre>
            </div>
          </div>
        </section>

        {/* ── Split Panel: Snippet + Explanation ── */}
        <section className="border-t border-white/[0.06]">
          <div className="mx-auto max-w-5xl px-6 py-24">
            <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2">
              {/* Left: Code snippet */}
              <div className="overflow-hidden rounded-lg border border-white/[0.06] glow-card bg-white/[0.02]">
                <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-white/[0.08]" />
                  <div className="h-2.5 w-2.5 rounded-full bg-white/[0.08]" />
                  <div className="h-2.5 w-2.5 rounded-full bg-white/[0.08]" />
                  <span className="ml-2 text-[11px] text-muted-foreground/40">
                    custom-pixel.js
                  </span>
                </div>
                <pre className="overflow-x-auto px-5 py-5 font-mono text-[13px] leading-relaxed">
                  <code>
                    <span className="text-muted-foreground/50">{"// Shopify Custom Pixel"}</span>
                    {"\n"}
                    <span className="text-brand-500">{"analytics"}</span>
                    <span className="text-foreground/70">{".subscribe("}</span>
                    <span className="text-amber-400/80">{'"all_events"'}</span>
                    <span className="text-foreground/70">{", (event) => {"}</span>
                    {"\n"}
                    <span className="text-foreground/70">{"  "}</span>
                    <span className="text-brand-500">{"fetch"}</span>
                    <span className="text-foreground/70">{"("}</span>
                    <span className="text-amber-400/80">{'"https://api.trackinglite.com"'}</span>
                    <span className="text-foreground/70">{", {"}</span>
                    {"\n"}
                    <span className="text-foreground/70">{"    method: "}</span>
                    <span className="text-amber-400/80">{'"POST"'}</span>
                    <span className="text-foreground/70">{","}</span>
                    {"\n"}
                    <span className="text-foreground/70">{"    body: "}</span>
                    <span className="text-brand-500">{"JSON"}</span>
                    <span className="text-foreground/70">{".stringify({"}</span>
                    {"\n"}
                    <span className="text-foreground/70">{"      event_name: event.name,"}</span>
                    {"\n"}
                    <span className="text-foreground/70">{"      event_id: "}</span>
                    <span className="text-brand-500">{"crypto"}</span>
                    <span className="text-foreground/70">{".randomUUID(),"}</span>
                    {"\n"}
                    <span className="text-foreground/70">{"      pixel_id: "}</span>
                    <span className="text-amber-400/80">{'"YOUR_PIXEL_ID"'}</span>
                    {"\n"}
                    <span className="text-foreground/70">{"    })"}</span>
                    {"\n"}
                    <span className="text-foreground/70">{"  });"}</span>
                    {"\n"}
                    <span className="text-foreground/70">{"});"}</span>
                  </code>
                </pre>
              </div>

              {/* Right: Explanation */}
              <div className="py-2 lg:py-6">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                  Integration
                </p>
                <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  One snippet.
                  <br />
                  Complete tracking.
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  Paste a single JavaScript snippet into Shopify&apos;s Custom Pixel
                  settings. No theme changes, no app install, no developer. The
                  snippet hooks into Shopify&apos;s{" "}
                  <code className="rounded bg-white/[0.04] px-1 py-0.5 font-mono text-xs text-foreground/70">
                    analytics.subscribe()
                  </code>{" "}
                  API and captures every event automatically.
                </p>
                <ul className="mt-6 space-y-3">
                  {[
                    "PageView, ViewContent, AddToCart, InitiateCheckout, Purchase",
                    "Automatic event_id generation for pixel deduplication",
                    "Consent-aware via Shopify Customer Privacy API",
                    "Works alongside your existing Meta browser pixel",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                      <span className="text-sm leading-relaxed text-muted-foreground">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ── Problem Section ── */}
        <section className="border-t border-white/[0.06]">
          <div className="mx-auto max-w-5xl px-6 py-24">
            <div className="mb-12 text-center">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                The problem
              </p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Your pixel data is incomplete
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card className="border-white/[0.06] bg-white/[0.02] shadow-none transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10] hover:glow-card">
                <CardContent className="p-6">
                  <Shield className="mb-4 h-5 w-5 text-brand-500" />
                  <h3 className="mb-2 text-sm font-semibold text-foreground">
                    Ad blockers kill the pixel
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    ~30% of desktop users run ad blockers. Every one silently
                    drops requests to{" "}
                    <code className="font-mono text-xs text-foreground/60">
                      connect.facebook.net
                    </code>{" "}
                    before your pixel fires.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-white/[0.06] bg-white/[0.02] shadow-none transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10] hover:glow-card">
                <CardContent className="p-6">
                  <Smartphone className="mb-4 h-5 w-5 text-brand-500" />
                  <h3 className="mb-2 text-sm font-semibold text-foreground">
                    iOS 14+ breaks attribution
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Apple&apos;s ATT prompt and Intelligent Tracking Prevention
                    limit cookie lifetimes to 7 days and suppress cross-site
                    signals on Safari.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-white/[0.06] bg-white/[0.02] shadow-none transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10] hover:glow-card">
                <CardContent className="p-6">
                  <BarChart3 className="mb-4 h-5 w-5 text-brand-500" />
                  <h3 className="mb-2 text-sm font-semibold text-foreground">
                    Missing events waste ad spend
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Meta&apos;s algorithm optimizes on the conversions it sees.
                    Incomplete data means it targets the wrong people and
                    overpays for them.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* ── How It Works ── */}
        <section
          id="how-it-works"
          className="border-t border-white/[0.06]"
        >
          <div className="mx-auto max-w-5xl px-6 py-24">
            <div className="mb-12 text-center">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                How it works
              </p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Three steps to complete data
              </h2>
            </div>

            <div className="mx-auto max-w-xl space-y-0">
              {/* Step 1 */}
              <div className="flex gap-6 pb-10">
                <div className="flex flex-col items-center">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] text-xs font-semibold text-foreground">
                    1
                  </div>
                  <div className="mt-3 w-px flex-1 bg-gradient-to-b from-white/[0.08] to-white/[0.02]" />
                </div>
                <div className="pb-2 pt-1">
                  <h3 className="mb-2 text-sm font-semibold text-foreground">
                    Paste a snippet into Shopify
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Copy your unique tracking snippet from the TrackingLite
                    dashboard. Paste it in Shopify Admin under Settings &rsaquo;
                    Customer Events &rsaquo; Add Custom Pixel. No theme edits, no
                    app install.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-6 pb-10">
                <div className="flex flex-col items-center">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] text-xs font-semibold text-foreground">
                    2
                  </div>
                  <div className="mt-3 w-px flex-1 bg-gradient-to-b from-white/[0.08] to-white/[0.02]" />
                </div>
                <div className="pb-2 pt-1">
                  <h3 className="mb-2 text-sm font-semibold text-foreground">
                    Events route through our servers
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    The snippet captures events via Shopify&apos;s analytics API
                    and sends them to{" "}
                    <code className="rounded bg-white/[0.04] px-1 py-0.5 font-mono text-xs text-foreground/70">
                      api.trackinglite.com
                    </code>{" "}
                    &mdash; a domain ad blockers don&apos;t target. We hash PII
                    with SHA-256, normalize phones to E.164, and queue the event.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-6">
                <div className="flex flex-col items-center">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-brand-500/30 bg-brand-500/10 text-xs font-semibold text-brand-400 shadow-sm shadow-brand-500/20">
                    3
                  </div>
                </div>
                <div className="pb-2 pt-1">
                  <h3 className="mb-2 text-sm font-semibold text-foreground">
                    Meta gets complete, deduplicated data
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    We forward every event server-to-server to Meta&apos;s
                    Conversions API. A shared{" "}
                    <code className="rounded bg-white/[0.04] px-1 py-0.5 font-mono text-xs text-foreground/70">
                      event_id
                    </code>{" "}
                    ensures Meta deduplicates against your browser pixel
                    automatically. No double-counting, no gaps.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Metrics Strip ── */}
        <section className="border-y border-white/[0.06] bg-white/[0.015]">
          <div className="mx-auto max-w-5xl px-6 py-14">
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
              <div className="text-center">
                <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
                  18M+
                </div>
                <div className="mt-1 text-xs text-muted-foreground/60">
                  Events forwarded
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
                  99.9%
                </div>
                <div className="mt-1 text-xs text-muted-foreground/60">
                  API uptime
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
                  &lt;150ms
                </div>
                <div className="mt-1 text-xs text-muted-foreground/60">
                  Avg. processing time
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
                  10 min
                </div>
                <div className="mt-1 text-xs text-muted-foreground/60">
                  Setup to first event
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section>
          <div className="mx-auto max-w-5xl px-6 py-24">
            <div className="mb-12 text-center">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                Pricing
              </p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Only pay for orders you track
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                PageView, ViewContent, AddToCart, and InitiateCheckout events are
                free and unlimited on every plan. You only pay based on Purchase
                events (orders).
              </p>
            </div>

            <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Free */}
              <Card className="border-white/[0.06] bg-white/[0.02] shadow-none transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10]">
                <CardContent className="flex flex-col p-6">
                  <div className="mb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                    Free
                  </div>
                  <div className="mb-4 flex items-baseline gap-1">
                    <span className="text-3xl font-bold tracking-tight text-foreground">
                      $0
                    </span>
                    <span className="text-sm text-muted-foreground/60">
                      /mo
                    </span>
                  </div>
                  <Separator className="mb-4 bg-white/[0.06]" />
                  <ul className="flex-1 space-y-2.5 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                      50 orders/month
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                      Unlimited other events
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                      7-day event log
                    </li>
                  </ul>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="mt-6 w-full border-white/[0.08] bg-transparent hover:bg-white/[0.03]"
                  >
                    <Link href="/signup">Get started free</Link>
                  </Button>
                </CardContent>
              </Card>

              {/* Starter */}
              <Card className="border-white/[0.06] bg-white/[0.02] shadow-none transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10]">
                <CardContent className="flex flex-col p-6">
                  <div className="mb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                    Starter
                  </div>
                  <div className="mb-4 flex items-baseline gap-1">
                    <span className="text-3xl font-bold tracking-tight text-foreground">
                      $29
                    </span>
                    <span className="text-sm text-muted-foreground/60">
                      /mo
                    </span>
                  </div>
                  <Separator className="mb-4 bg-white/[0.06]" />
                  <ul className="flex-1 space-y-2.5 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                      500 orders/month
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                      Unlimited other events
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                      7-day event log
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                      Email support
                    </li>
                  </ul>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="mt-6 w-full border-white/[0.08] bg-transparent hover:bg-white/[0.03]"
                  >
                    <Link href="/signup">Start with Starter</Link>
                  </Button>
                </CardContent>
              </Card>

              {/* Growth */}
              <Card className="relative border-brand-500/20 bg-gradient-to-b from-brand-500/[0.03] to-transparent shadow-none ring-1 ring-brand-500/20 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10]">
                <CardContent className="flex flex-col p-6">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                      Growth
                    </span>
                    <Badge
                      variant="outline"
                      className="rounded-full border-brand-500/20 bg-brand-500/10 px-2 py-0 text-[10px] font-medium text-brand-400 glow-brand"
                    >
                      Most popular
                    </Badge>
                  </div>
                  <div className="mb-4 flex items-baseline gap-1">
                    <span className="text-3xl font-bold tracking-tight text-foreground">
                      $49
                    </span>
                    <span className="text-sm text-muted-foreground/60">
                      /mo
                    </span>
                  </div>
                  <Separator className="mb-4 bg-white/[0.06]" />
                  <ul className="flex-1 space-y-2.5 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                      1,000 orders/month
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                      Unlimited other events
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                      30-day event log
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                      Priority support
                    </li>
                  </ul>
                  <Button
                    variant="brand"
                    size="sm"
                    asChild
                    className="mt-6 w-full"
                  >
                    <Link href="/signup">Start with Growth</Link>
                  </Button>
                </CardContent>
              </Card>

              {/* Scale */}
              <Card className="border-white/[0.06] bg-white/[0.02] shadow-none transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10]">
                <CardContent className="flex flex-col p-6">
                  <div className="mb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                    Scale
                  </div>
                  <div className="mb-4 flex items-baseline gap-1">
                    <span className="text-3xl font-bold tracking-tight text-foreground">
                      $99
                    </span>
                    <span className="text-sm text-muted-foreground/60">
                      /mo
                    </span>
                  </div>
                  <Separator className="mb-4 bg-white/[0.06]" />
                  <ul className="flex-1 space-y-2.5 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                      5,000 orders/month
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                      Unlimited other events
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                      30-day event log
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                      Priority support
                    </li>
                  </ul>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="mt-6 w-full border-white/[0.08] bg-transparent hover:bg-white/[0.03]"
                  >
                    <Link href="/signup">Start with Scale</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>

            <p className="mt-6 text-center text-xs text-muted-foreground/50">
              All plans include unlimited stores. Paid plans auto-upgrade when
              you exceed your order limit &mdash; your tracking never stops. No
              credit card required to start free.
            </p>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="relative overflow-hidden border-t border-white/[0.06]">
          <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, rgba(20,184,166,0.04) 0%, transparent 70%)' }} />
          <div className="mx-auto max-w-5xl px-6 py-24">
            <div className="mx-auto max-w-md text-center">
              <h2 className="mb-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Start tracking in 10 minutes
              </h2>
              <p className="mb-8 text-sm text-muted-foreground">
                One snippet. Five events. Complete server-side data flowing to
                Meta.
              </p>
              <Button variant="brand" size="lg" asChild className="gap-2">
                <Link href="/signup">
                  Create your account
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-transparent" style={{ borderImage: 'linear-gradient(to right, transparent, rgba(255,255,255,0.06), transparent) 1' }}>
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <span className="text-sm font-semibold tracking-tight text-foreground">
            <span className="text-brand-500">T</span>rackingLite
          </span>
          <div className="flex items-center gap-6 text-xs text-muted-foreground/50">
            <Link
              href="/login"
              className="transition-colors hover:text-foreground"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="transition-colors hover:text-foreground"
            >
              Sign up
            </Link>
            <span>&copy; {new Date().getFullYear()} TrackingLite</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
