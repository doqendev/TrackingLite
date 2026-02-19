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
                      {/* Shopify card */}
                      <div className="relative rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                        <div className="absolute right-3 top-3">
                          <svg viewBox="0 0 32 32" className="h-5 w-5 text-emerald-400/60" fill="currentColor">
                            <path d="M20.919 4.546c-0.025 0-0.075 0.026-0.097 0.026s-0.361 0.094-0.892 0.262c-0.529-1.541-1.47-2.962-3.134-2.962h-0.144c-0.356-0.5-0.921-0.832-1.564-0.868l-0.005-0c-3.881 0-5.736 4.845-6.317 7.305-1.492 0.456-2.578 0.795-2.699 0.842-0.844 0.266-0.867 0.29-0.965 1.087-0.094 0.577-2.287 17.574-2.287 17.574l16.946 3.183zM17.18 2.935c0.867 0.092 1.426 1.083 1.786 2.193-0.436 0.142-0.919 0.289-1.447 0.457v-0.315c0.001-0.049 0.002-0.107 0.002-0.165 0-0.777-0.125-1.524-0.355-2.224l0.014 0.050zM16.506 5.727v0.169c-0.942 0.29-1.978 0.605-2.992 0.92 0.264-1.607 1.237-2.944 2.58-3.699l0.026-0.013c0.248 0.705 0.391 1.518 0.391 2.365 0 0.091-0.002 0.182-0.005 0.273l0-0.013zM14.963 2.042c0 0 0.001 0 0.001 0 0.19 0 0.366 0.063 0.507 0.17l-0.002-0.002c-1.749 1.048-2.947 2.861-3.132 4.964l-0.002 0.024c-0.82 0.266-1.616 0.506-2.361 0.722 0.648-2.231 2.216-5.867 4.988-5.867zM15.638 15.132c-0.648-0.32-1.408-0.514-2.211-0.53l-0.005-0c-1.808 0-1.879 1.132-1.879 1.426 0 1.54 4.049 2.143 4.049 5.785 0.014 0.128 0.021 0.277 0.021 0.427 0 2.359-1.912 4.271-4.271 4.271-0.002 0-0.005 0-0.007 0h0c-0.050 0.002-0.108 0.002-0.166 0.002-1.676 0-3.187-0.703-4.255-1.83l-0.003-0.003 0.807-2.607c0.774 0.68 1.745 1.154 2.817 1.328l0.033 0.004c0.012 0 0.025 0.001 0.039 0.001 0.646 0 1.171-0.52 1.18-1.165v-0.001c0-2.023-3.317-2.117-3.317-5.447-0-0.020-0-0.044-0-0.068 0-3.026 2.453-5.478 5.478-5.478 0.195 0 0.388 0.010 0.578 0.030l-0.024-0.002c0.077-0.004 0.167-0.007 0.258-0.007 0.756 0 1.474 0.169 2.116 0.471l-0.030-0.013-1.181 3.393zM20.17 30.97l9.017-1.951s-3.254-22.010-3.28-22.156c-0.018-0.133-0.128-0.235-0.263-0.24h-0c-0.121 0-2.411-0.17-2.411-0.17s-1.593-1.592-1.798-1.763c-0.043-0.039-0.093-0.070-0.148-0.091l-0.003-0.001-1.142 26.372z" />
                          </svg>
                        </div>
                        <div className="mb-3 flex items-center gap-1.5 text-[11px] text-emerald-400/80">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Connected
                        </div>
                        <div className="text-sm font-medium text-foreground">Shopify Snippet</div>
                        <div className="mt-1 text-xs text-muted-foreground/50">5 event types</div>
                      </div>

                      {/* Track Clear API card (highlighted) */}
                      <div className="relative rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] p-4">
                        <div className="mb-3 flex items-center gap-1.5 text-[11px] text-emerald-400/80">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Processing events
                        </div>
                        <div className="text-sm font-medium text-foreground">Track Clear API</div>
                        <div className="mt-1 text-xs text-muted-foreground/50">142ms avg</div>
                      </div>

                      {/* Meta CAPI card */}
                      <div className="relative rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                        <div className="absolute right-3 top-3">
                          <svg viewBox="0 0 24 24" className="h-5 w-5 text-emerald-400/60" fill="currentColor">
                            <path d="M8.06925,5.00237 C6.47461,4.89183 5.20472,5.81816 4.31715,6.9809 C3.42438,8.15046 2.79487,9.7015 2.44783,11.2489 C2.10089,12.7959 2.01419,14.4379 2.29341,15.813 C2.56477,17.1493 3.25726,18.5227 4.71368,18.9581 C6.10192,19.3731 7.34848,18.783 8.30022,17.9824 C9.25406,17.18 10.0806,16.0364 10.7459,14.9309 C11.2678,14.0637 11.7139,13.1803 12.0636,12.4265 C12.4134,13.1803 12.8595,14.0637 13.3814,14.9309 C14.0467,16.0364 14.8732,17.18 15.8271,17.9824 C16.7788,18.783 18.0254,19.3731 19.4136,18.9581 C20.87,18.5227 21.5625,17.1493 21.8339,15.813 C22.1131,14.4379 22.0264,12.7959 21.6795,11.2489 C21.3324,9.7015 20.7029,8.15046 19.8101,6.9809 C18.9226,5.81816 17.6527,4.89183 16.058,5.00237 C14.3243,5.12255 13.0879,6.47059 12.3715,7.49 C12.2613,7.64685 12.1586,7.80273 12.0636,7.95456 C11.9687,7.80273 11.866,7.64685 11.7558,7.49 C11.0394,6.47059 9.803,5.12255 8.06925,5.00237 Z M10.9193,10.0265 C10.6371,10.7417 9.95004,12.3747 9.03232,13.8996 C8.41066,14.9325 7.71866,15.8581 7.01275,16.4519 C6.30475,17.0474 5.7503,17.1805 5.28652,17.0419 C4.89094,16.9236 4.46993,16.4812 4.25341,15.415 C4.04476,14.3875 4.0958,13.0402 4.39936,11.6866 C4.70282,10.3335 5.23656,9.07262 5.90692,8.19443 C6.58247,7.30944 7.27559,6.95216 7.93095,6.99758 C8.69718,7.0507 9.46077,7.70266 10.1194,8.63992 C10.487,9.16295 10.7616,9.6916 10.9193,10.0265 Z M13.208,10.0265 C13.4902,10.7417 14.1773,12.3747 15.095,13.8996 C15.7166,14.9325 16.4086,15.8581 17.1145,16.4519 C17.8226,17.0474 18.377,17.1805 18.8408,17.0419 C19.2364,16.9236 19.6574,16.4812 19.8739,15.415 C20.0825,14.3875 20.0315,13.0402 19.7279,11.6866 C19.4245,10.3335 18.8907,9.07262 18.2204,8.19443 C17.5448,7.30944 16.8517,6.95216 16.1963,6.99758 C15.4301,7.0507 14.6665,7.70266 14.0079,8.63992 C13.6403,9.16295 13.3657,9.6916 13.208,10.0265 Z" />
                          </svg>
                        </div>
                        <div className="mb-3 flex items-center gap-1.5 text-[11px] text-emerald-400/80">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Forwarding
                        </div>
                        <div className="text-sm font-medium text-foreground">Meta CAPI</div>
                        <div className="mt-1 text-xs text-muted-foreground/50">99.9% delivery</div>
                      </div>
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
