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
  DollarSign,
  Activity,
  HeartPulse,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* ───────────────────────── Navigation ───────────────────────── */}
      <header className="relative z-10 bg-transparent">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight text-foreground"
          >
            <span className="text-brand-500">Track</span>&thinsp;Clear
          </Link>

          <nav className="hidden items-center gap-8 sm:flex">
            <a
              href="#features"
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              How it Works
            </a>
            <a
              href="#pricing"
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Pricing
            </a>
          </nav>

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
        {/* ───────────────────────── Hero ───────────────────────── */}
        <div className="px-3 pt-2 sm:px-5 sm:pt-3">
          <section
            className="relative overflow-hidden rounded-t-2xl sm:rounded-t-3xl"
            style={{ background: "linear-gradient(180deg, hsl(180,30%,6%) 0%, hsl(200,40%,5%) 100%)" }}
          >
            {/* Dot grid */}
            <div
              className="pointer-events-none absolute inset-0 opacity-30"
              style={{
                backgroundImage:
                  "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }}
            />

            {/* Teal atmospheric glow — center top */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 110% 60% at 50% -5%, rgba(20,184,166,0.14) 0%, rgba(16,185,129,0.04) 40%, transparent 70%)",
              }}
            />
            {/* Secondary glow — right side */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 60% 80% at 90% 30%, rgba(16,185,129,0.08) 0%, transparent 60%)",
              }}
            />
            {/* Subtle glow — left bottom */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 50% 50% at 10% 70%, rgba(20,184,166,0.05) 0%, transparent 50%)",
              }}
            />

            {/* ── Circuit board traces (SVG) ── */}
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              xmlns="http://www.w3.org/2000/svg"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="traceGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="rgba(16,185,129,0)" />
                  <stop offset="30%" stopColor="rgba(16,185,129,0.3)" />
                  <stop offset="70%" stopColor="rgba(16,185,129,0.3)" />
                  <stop offset="100%" stopColor="rgba(16,185,129,0)" />
                </linearGradient>
                <linearGradient id="traceGradV" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(16,185,129,0)" />
                  <stop offset="40%" stopColor="rgba(16,185,129,0.25)" />
                  <stop offset="100%" stopColor="rgba(16,185,129,0)" />
                </linearGradient>
              </defs>
              {/* Right-side horizontal traces */}
              <line x1="65%" y1="18%" x2="100%" y2="18%" stroke="url(#traceGrad)" strokeWidth="1" />
              <line x1="70%" y1="25%" x2="100%" y2="25%" stroke="url(#traceGrad)" strokeWidth="1" />
              <line x1="75%" y1="32%" x2="100%" y2="15%" stroke="url(#traceGrad)" strokeWidth="0.5" />
              {/* Right diagonal */}
              <line x1="80%" y1="8%" x2="100%" y2="28%" stroke="url(#traceGrad)" strokeWidth="0.5" />
              {/* Left-side traces */}
              <line x1="0%" y1="65%" x2="30%" y2="65%" stroke="url(#traceGrad)" strokeWidth="1" />
              <line x1="0%" y1="72%" x2="25%" y2="72%" stroke="url(#traceGrad)" strokeWidth="0.5" />
              <line x1="5%" y1="58%" x2="20%" y2="75%" stroke="url(#traceGradV)" strokeWidth="0.5" />
              {/* Vertical traces */}
              <line x1="88%" y1="0%" x2="88%" y2="35%" stroke="url(#traceGradV)" strokeWidth="0.5" />
              <line x1="92%" y1="5%" x2="92%" y2="40%" stroke="url(#traceGradV)" strokeWidth="0.5" />
              {/* Connection nodes */}
              <circle cx="88%" cy="18%" r="2.5" fill="rgba(16,185,129,0.4)" />
              <circle cx="92%" cy="25%" r="2" fill="rgba(16,185,129,0.35)" />
              <circle cx="80%" cy="18%" r="2" fill="rgba(16,185,129,0.3)" />
              <circle cx="25%" cy="65%" r="2.5" fill="rgba(16,185,129,0.35)" />
              <circle cx="20%" cy="72%" r="2" fill="rgba(16,185,129,0.3)" />
              <circle cx="15%" cy="65%" r="1.5" fill="rgba(16,185,129,0.25)" />
              {/* Right lower trace */}
              <line x1="75%" y1="80%" x2="100%" y2="70%" stroke="url(#traceGrad)" strokeWidth="0.5" />
              <circle cx="85%" cy="76%" r="1.5" fill="rgba(16,185,129,0.25)" />
            </svg>

            {/* Bottom fade to page background */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(to bottom, transparent 70%, hsl(200,40%,5%) 100%)",
              }}
            />

            <div className="relative mx-auto max-w-6xl px-6 pb-8 pt-24 sm:pb-12 sm:pt-28">
              <div className="mx-auto max-w-3xl text-center animate-fade-in-up">
                <h1 className="mb-6 text-5xl font-bold leading-[1.05] tracking-tighter text-foreground sm:text-6xl md:text-[4.25rem]">
                  Your Meta Pixel misses
                  <br />
                  20&ndash;40% of conversions.
                  <br />
                  <span className="text-gradient">We catch them.</span>
                </h1>

                <p className="mx-auto mb-10 max-w-lg text-base leading-relaxed text-muted-foreground">
                  Server-side tracking for Shopify &mdash; setup takes 10 minutes
                </p>

                <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                  <Button variant="brand" size="lg" asChild className="gap-2 rounded-full px-8">
                    <Link href="/signup">
                      Get Started Free
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    asChild
                    className="rounded-full border-white/[0.10] bg-transparent px-8 hover:bg-white/[0.04]"
                  >
                    <Link href="#how-it-works">See how it works</Link>
                  </Button>
                </div>
              </div>

              {/* ── Product Visual ── */}
              <div className="relative mx-auto mt-16 max-w-4xl sm:mt-20">
                {/* Floating Shopify icon — left side */}
                <div className="absolute -left-6 top-1/2 hidden -translate-y-1/2 lg:block">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] shadow-lg shadow-emerald-500/[0.05]">
                    <svg viewBox="0 0 24 24" className="h-6 w-6 text-emerald-400" fill="currentColor">
                      <path d="M15.34 3.27c-.07-.04-.14-.04-.21-.01-.06.03-1.16.35-1.16.35s-.77-2.11-2.64-2.11c-.04 0-.08 0-.12.01-.39-.52-.88-.76-1.29-.76C7.2.75 6.08 4.58 5.72 5.84c-.94.29-1.61.5-1.69.53-.53.17-.54.18-.61.68C3.37 7.46 2 18.75 2 18.75l10.33 1.78L17 19.57s-1.63-11.1-1.66-11.3zM11.56 4.5l-.01.04c-.56.17-1.18.37-1.79.55.35-1.33.99-1.98 1.56-2.22.15.38.24.92.24 1.63zM10.07 1.5c.1 0 .22.04.32.11-.73.34-1.52 1.22-1.85 2.97-.49.15-.97.3-1.42.44C7.56 3.5 8.53 1.5 10.07 1.5zM10.37 11.6s-.6-.32-1.34-.32c-1.08 0-1.13.68-1.13.85 0 .93 2.43 1.29 2.43 3.47 0 1.71-1.09 2.82-2.55 2.82-1.76 0-2.66-1.1-2.66-1.1l.47-1.56s.93.8 1.71.8c.51 0 .72-.4.72-.7 0-1.22-2-1.27-2-3.28 0-1.69 1.21-3.32 3.66-3.32.94 0 1.41.27 1.41.27l-.72 2.07z" />
                    </svg>
                  </div>
                </div>

                {/* Floating Meta icon — right side */}
                <div className="absolute -right-6 top-1/2 hidden -translate-y-1/2 lg:block">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] shadow-lg shadow-emerald-500/[0.05]">
                    <svg viewBox="0 0 24 24" className="h-6 w-6 text-emerald-400" fill="currentColor">
                      <path d="M6.915 4.03c-1.968 0-3.202 1.6-4.113 3.53-.984 2.09-1.552 4.8-1.552 7.065 0 1.638.462 2.986 1.34 3.895C3.456 19.41 4.56 19.87 5.84 19.87c.636 0 1.22-.142 1.756-.396.53-.25 1.04-.625 1.543-1.125.834-.83 1.617-2.04 2.466-3.59.17-.31.336-.628.498-.95-.162-.322-.328-.64-.498-.95-.849-1.55-1.632-2.76-2.466-3.59-.503-.5-1.013-.875-1.543-1.125A3.683 3.683 0 005.84 7.75c-1.28 0-2.384.46-3.25 1.35C1.712 10 1.25 11.348 1.25 12.985c0 2.266.568 4.976 1.552 7.065.911 1.93 2.145 3.53 4.113 3.53.636 0 1.22-.142 1.756-.396.53-.25 1.04-.625 1.543-1.125.834-.83 1.617-2.04 2.466-3.59a60.47 60.47 0 001.47-2.856 60.47 60.47 0 001.47 2.856c.849 1.55 1.632 2.76 2.466 3.59.503.5 1.013.875 1.543 1.125.535.254 1.12.396 1.756.396 1.968 0 3.202-1.6 4.113-3.53.984-2.09 1.552-4.8 1.552-7.065 0-1.638-.462-2.986-1.34-3.895-.866-.89-1.97-1.35-3.25-1.35-.636 0-1.22.142-1.756.396-.53.25-1.04.625-1.543 1.125-.834.83-1.617 2.04-2.466 3.59a60.4 60.4 0 00-1.47 2.856 60.4 60.4 0 00-1.47-2.856c-.849-1.55-1.632-2.76-2.466-3.59-.503-.5-1.013-.875-1.543-1.125A3.683 3.683 0 006.915 4.03z" />
                    </svg>
                  </div>
                </div>

                {/* Glow behind the card */}
                <div
                  className="pointer-events-none absolute -inset-6 rounded-2xl"
                  style={{
                    background:
                      "radial-gradient(ellipse at center, rgba(16,185,129,0.10) 0%, transparent 70%)",
                  }}
                />
                <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02] shadow-2xl shadow-emerald-500/[0.03] backdrop-blur-sm">
                  {/* Mock header bar */}
                  <div className="flex items-center gap-1 border-b border-white/[0.06] px-4 py-2.5">
                    <div className="flex items-center gap-1.5 mr-4">
                      <div className="h-2.5 w-2.5 rounded-full bg-white/[0.10]" />
                      <div className="h-2.5 w-2.5 rounded-full bg-white/[0.10]" />
                      <div className="h-2.5 w-2.5 rounded-full bg-white/[0.10]" />
                    </div>
                    {["Dashboard", "Events", "Settings"].map((tab, i) => (
                      <span
                        key={tab}
                        className={`rounded-md px-3 py-1 text-[11px] font-medium ${
                          i === 0
                            ? "bg-white/[0.06] text-foreground"
                            : "text-muted-foreground/50"
                        }`}
                      >
                        {tab}
                      </span>
                    ))}
                  </div>

                  {/* Pipeline cards with connectors */}
                  <div className="relative p-5">
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                      {[
                        {
                          name: "Shopify Snippet",
                          status: "Connected",
                          detail: "5 event types",
                        },
                        {
                          name: "Track Clear API",
                          status: "Processing events",
                          detail: "142ms avg",
                          highlight: true,
                        },
                        {
                          name: "Meta CAPI",
                          status: "Forwarding",
                          detail: "99.9% delivery",
                        },
                      ].map((card) => (
                        <div
                          key={card.name}
                          className={`relative rounded-lg border p-4 ${
                            card.highlight
                              ? "border-emerald-500/20 bg-emerald-500/[0.03]"
                              : "border-white/[0.06] bg-white/[0.02]"
                          }`}
                        >
                          <div className="mb-3 flex items-center gap-1.5 text-[11px] text-emerald-400/80">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            {card.status}
                          </div>
                          <div className="text-sm font-medium text-foreground">
                            {card.name}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground/50">
                            {card.detail}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Connector lines between cards (desktop only) */}
                    <svg
                      className="pointer-events-none absolute inset-0 hidden h-full w-full sm:block"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      {/* Line from card 1 to card 2 */}
                      <line
                        x1="34.5%" y1="50%" x2="37%" y2="50%"
                        stroke="rgba(16,185,129,0.3)"
                        strokeWidth="2"
                        strokeDasharray="4 3"
                      />
                      <circle cx="37%" cy="50%" r="3" fill="rgba(16,185,129,0.5)" />
                      {/* Line from card 2 to card 3 */}
                      <line
                        x1="64.5%" y1="50%" x2="67%" y2="50%"
                        stroke="rgba(16,185,129,0.3)"
                        strokeWidth="2"
                        strokeDasharray="4 3"
                      />
                      <circle cx="67%" cy="50%" r="3" fill="rgba(16,185,129,0.5)" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ───────────────────────── Stats Strip ───────────────────────── */}
        <section className="border-y border-white/[0.06] bg-white/[0.015]">
          <div className="mx-auto max-w-6xl px-6 py-14">
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
              {[
                { value: "18M+", label: "Events forwarded" },
                { value: "99.9%", label: "API uptime" },
                { value: "<150ms", label: "Avg. processing" },
                { value: "10 min", label: "Setup to first event" },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums sm:text-3xl">
                    {stat.value}
                  </div>
                  <div className="mt-1.5 text-xs text-muted-foreground/60">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ───────────────────────── Problem Section ───────────────────────── */}
        <section id="features" className="border-b border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
            <div className="mb-14 text-center">
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

        {/* ───────────── Feature: Capture Everything (content LEFT, visual RIGHT) ───────────── */}
        <section className="border-b border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
              {/* Left: Content */}
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                  How it works
                </p>
                <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  Capture every event, every time
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  Our JavaScript snippet hooks into Shopify&apos;s{" "}
                  <code className="rounded bg-white/[0.04] px-1 py-0.5 font-mono text-xs text-foreground/70">
                    analytics.subscribe()
                  </code>{" "}
                  API inside their Custom Pixel sandbox. Every browser event is
                  captured with full context &mdash; cookies, user agent, URL
                  &mdash; and sent to our servers where ad blockers can&apos;t
                  reach.
                </p>
                <ul className="mt-6 space-y-3">
                  {[
                    "PageView, ViewContent, AddToCart, InitiateCheckout, Purchase",
                    "Automatic event_id for pixel deduplication",
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

              {/* Right: Event Pipeline Terminal */}
              <div className="overflow-hidden rounded-lg border border-white/[0.06] glow-card bg-white/[0.02]">
                {/* Terminal chrome */}
                <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-white/[0.08]" />
                  <div className="h-2.5 w-2.5 rounded-full bg-white/[0.08]" />
                  <div className="h-2.5 w-2.5 rounded-full bg-white/[0.08]" />
                  <span className="ml-2 text-[11px] text-muted-foreground/40">
                    trackclear &mdash; event pipeline
                  </span>
                </div>

                {/* Terminal content */}
                <pre className="overflow-x-auto px-5 py-5 font-mono text-[13px] leading-relaxed">
                  <code>
                    <span className="text-muted-foreground/50">
                      {"// "}PageView from shop.example.com
                    </span>
                    {"\n"}
                    <span className="text-foreground/90">
                      {"\u2192"} PageView captured
                    </span>
                    <span className="text-muted-foreground/40">
                      {"          0.2ms"}
                    </span>
                    {"\n"}
                    <span className="text-muted-foreground/60">
                      {"  \u251C"} PII hashed (SHA-256)
                    </span>
                    <span className="text-muted-foreground/40">
                      {"     0.1ms"}
                    </span>
                    {"\n"}
                    <span className="text-muted-foreground/60">
                      {"  \u251C"} Phone normalized (E.164)
                    </span>
                    <span className="text-muted-foreground/40">
                      {" 0.1ms"}
                    </span>
                    {"\n"}
                    <span className="text-muted-foreground/60">
                      {"  \u2514"} Sent to Meta CAPI
                    </span>
                    <span className="text-muted-foreground/40">
                      {"        142ms  "}
                    </span>
                    <span className="text-brand-500">
                      <span className="animate-pulse-glow">{"\u2713"}</span>
                      {" 200 OK"}
                    </span>
                    {"\n\n"}
                    <span className="text-muted-foreground/50">
                      {"// "}Purchase $127.50 &mdash; order #4891
                    </span>
                    {"\n"}
                    <span className="text-foreground/90">
                      {"\u2192"} Purchase captured
                    </span>
                    <span className="text-muted-foreground/40">
                      {"          0.3ms"}
                    </span>
                    {"\n"}
                    <span className="text-muted-foreground/60">
                      {"  \u251C"} PII hashed (SHA-256)
                    </span>
                    <span className="text-muted-foreground/40">
                      {"     0.1ms"}
                    </span>
                    {"\n"}
                    <span className="text-muted-foreground/60">
                      {"  \u251C"} Dedup: event_id matched
                    </span>
                    <span className="text-muted-foreground/40">
                      {" 0.0ms"}
                    </span>
                    {"\n"}
                    <span className="text-muted-foreground/60">
                      {"  \u2514"} Sent to Meta CAPI
                    </span>
                    <span className="text-muted-foreground/40">
                      {"        138ms  "}
                    </span>
                    <span className="text-brand-500">
                      <span className="animate-pulse-glow">{"\u2713"}</span>
                      {" 200 OK"}
                    </span>
                    {"\n\n"}
                    <span className="text-muted-foreground/50">
                      {"// "}AddToCart &mdash; SKU-8812 x2
                    </span>
                    {"\n"}
                    <span className="text-foreground/90">
                      {"\u2192"} AddToCart captured
                    </span>
                    <span className="text-muted-foreground/40">
                      {"         0.2ms"}
                    </span>
                    {"\n"}
                    <span className="text-muted-foreground/60">
                      {"  \u251C"} PII hashed (SHA-256)
                    </span>
                    <span className="text-muted-foreground/40">
                      {"     0.1ms"}
                    </span>
                    {"\n"}
                    <span className="text-muted-foreground/60">
                      {"  \u2514"} Sent to Meta CAPI
                    </span>
                    <span className="text-muted-foreground/40">
                      {"        129ms  "}
                    </span>
                    <span className="text-brand-500">
                      <span className="animate-pulse-glow">{"\u2713"}</span>
                      {" 200 OK"}
                    </span>
                  </code>
                </pre>
              </div>
            </div>
          </div>
        </section>

        {/* ───────────── Feature: Server-Side Forwarding (visual LEFT, content RIGHT) ───────────── */}
        <section id="how-it-works" className="border-b border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
              {/* Left: Code Snippet Visual */}
              <div className="overflow-hidden rounded-lg border border-white/[0.06] glow-card bg-white/[0.02] lg:order-1">
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
                    <span className="text-muted-foreground/50">
                      {"// Shopify Custom Pixel"}
                    </span>
                    {"\n"}
                    <span className="text-brand-500">{"analytics"}</span>
                    <span className="text-foreground/70">{".subscribe("}</span>
                    <span className="text-amber-400/80">
                      {"\"all_events\""}
                    </span>
                    <span className="text-foreground/70">
                      {", (event) => {"}
                    </span>
                    {"\n"}
                    <span className="text-foreground/70">{"  "}</span>
                    <span className="text-brand-500">{"fetch"}</span>
                    <span className="text-foreground/70">{"("}</span>
                    <span className="text-amber-400/80">
                      {"\"https://api.trackclear.io\""}
                    </span>
                    <span className="text-foreground/70">{", {"}</span>
                    {"\n"}
                    <span className="text-foreground/70">
                      {"    method: "}
                    </span>
                    <span className="text-amber-400/80">{"\"POST\""}</span>
                    <span className="text-foreground/70">{","}</span>
                    {"\n"}
                    <span className="text-foreground/70">{"    body: "}</span>
                    <span className="text-brand-500">{"JSON"}</span>
                    <span className="text-foreground/70">
                      {".stringify({"}
                    </span>
                    {"\n"}
                    <span className="text-foreground/70">
                      {"      event_name: event.name,"}
                    </span>
                    {"\n"}
                    <span className="text-foreground/70">
                      {"      event_id: "}
                    </span>
                    <span className="text-brand-500">{"crypto"}</span>
                    <span className="text-foreground/70">
                      {".randomUUID(),"}
                    </span>
                    {"\n"}
                    <span className="text-foreground/70">
                      {"      pixel_id: "}
                    </span>
                    <span className="text-amber-400/80">
                      {"\"YOUR_PIXEL_ID\""}
                    </span>
                    {"\n"}
                    <span className="text-foreground/70">{"    })"}
                    </span>
                    {"\n"}
                    <span className="text-foreground/70">{"  });"}</span>
                    {"\n"}
                    <span className="text-foreground/70">{"});"}</span>
                  </code>
                </pre>
              </div>

              {/* Right: Content */}
              <div className="lg:order-2">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                  Integration
                </p>
                <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  One snippet. Complete tracking.
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  Paste a single JavaScript snippet into Shopify&apos;s Custom
                  Pixel settings. The snippet hooks into Shopify&apos;s{" "}
                  <code className="rounded bg-white/[0.04] px-1 py-0.5 font-mono text-xs text-foreground/70">
                    analytics.subscribe()
                  </code>{" "}
                  API and captures every event automatically.
                </p>
                <ul className="mt-6 space-y-3">
                  {[
                    "No theme changes, no app install, no developer",
                    "Events route through our servers \u2014 invisible to ad blockers",
                    "PII hashed with SHA-256, phones normalized to E.164",
                    "Automatic dedup via shared event_id with browser pixel",
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

        {/* ───────────── Feature: Monitor & Dashboard (3 cards) ───────────── */}
        <section className="border-b border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
            <div className="mb-14 text-center">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                Visibility
              </p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Complete tracking visibility
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">
                Everything you need to know your tracking is working.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card className="border-white/[0.06] bg-white/[0.02] shadow-none transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10] hover:glow-card">
                <CardContent className="p-6">
                  <DollarSign className="mb-4 h-5 w-5 text-brand-500" />
                  <h3 className="mb-2 text-sm font-semibold text-foreground">
                    Revenue tracking
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    See exactly how much revenue flows through your funnel
                    &mdash; AddToCart, Checkout, and Purchase values with daily
                    comparisons.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-white/[0.06] bg-white/[0.02] shadow-none transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10] hover:glow-card">
                <CardContent className="p-6">
                  <Activity className="mb-4 h-5 w-5 text-brand-500" />
                  <h3 className="mb-2 text-sm font-semibold text-foreground">
                    Event funnel
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Watch events flow from PageView to Purchase. Know exactly how
                    many events fire at each stage, compared to yesterday.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-white/[0.06] bg-white/[0.02] shadow-none transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10] hover:glow-card">
                <CardContent className="p-6">
                  <HeartPulse className="mb-4 h-5 w-5 text-brand-500" />
                  <h3 className="mb-2 text-sm font-semibold text-foreground">
                    Delivery health
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Real-time success rates with green/yellow/red status
                    indicators. Know instantly if something breaks.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* ───────────────────────── Pricing ───────────────────────── */}
        <section id="pricing" className="border-b border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
            <div className="mb-14 text-center">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                Pricing
              </p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Only pay for orders you track
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">
                PageView, ViewContent, AddToCart, and InitiateCheckout events are
                free and unlimited on every plan. You only pay based on Purchase
                events.
              </p>
            </div>

            <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

              {/* Growth (highlighted) */}
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

        {/* ───────────────────────── Final CTA ───────────────────────── */}
        <section className="relative overflow-hidden">
          {/* Blue gradient overlay */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(59,130,246,0.06) 0%, transparent 70%)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at center bottom, rgba(20,184,166,0.04) 0%, transparent 50%)",
            }}
          />

          <div className="mx-auto max-w-6xl px-6 py-28 sm:py-32">
            <div className="mx-auto max-w-lg text-center">
              <p className="mb-3 text-xs font-medium uppercase tracking-widest text-brand-500/80">
                Nothing blocked. Everything clear.
              </p>
              <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
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

      {/* ───────────────────────── Footer ───────────────────────── */}
      <footer
        className="border-t border-transparent"
        style={{
          borderImage:
            "linear-gradient(to right, transparent, rgba(255,255,255,0.06), transparent) 1",
        }}
      >
        <div className="mx-auto max-w-6xl px-6 py-16">
          {/* Multi-column link grid */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            <div>
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-widest text-foreground/70">
                Product
              </h4>
              <ul className="space-y-2.5">
                {["Features", "Pricing", "Dashboard", "Documentation"].map(
                  (item) => (
                    <li key={item}>
                      <a
                        href="#"
                        className="text-sm text-muted-foreground/50 transition-colors hover:text-foreground"
                      >
                        {item}
                      </a>
                    </li>
                  )
                )}
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-widest text-foreground/70">
                Resources
              </h4>
              <ul className="space-y-2.5">
                {[
                  "How it works",
                  "Shopify setup guide",
                  "Meta CAPI docs",
                ].map((item) => (
                  <li key={item}>
                    <a
                      href="#"
                      className="text-sm text-muted-foreground/50 transition-colors hover:text-foreground"
                    >
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-widest text-foreground/70">
                Company
              </h4>
              <ul className="space-y-2.5">
                {["About", "Contact", "Status"].map((item) => (
                  <li key={item}>
                    <a
                      href="#"
                      className="text-sm text-muted-foreground/50 transition-colors hover:text-foreground"
                    >
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-widest text-foreground/70">
                Legal
              </h4>
              <ul className="space-y-2.5">
                {["Privacy", "Terms"].map((item) => (
                  <li key={item}>
                    <a
                      href="#"
                      className="text-sm text-muted-foreground/50 transition-colors hover:text-foreground"
                    >
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/[0.06] pt-8 sm:flex-row">
            <span className="text-sm font-semibold tracking-tight text-foreground">
              <span className="text-brand-500">Track</span>&thinsp;Clear
            </span>
            <span className="text-xs text-muted-foreground/40">
              &copy; {new Date().getFullYear()} Track Clear. All rights
              reserved.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
