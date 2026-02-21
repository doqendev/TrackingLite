"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, Check } from "lucide-react";
import { AnimatedDashboard } from "@/components/landing/animated-dashboard";
import { ScrollReveal } from "@/components/landing/scroll-reveal";
import { SpotlightCard } from "@/components/landing/spotlight-card";
import {
  FaMeta,
  FaTiktok,
  FaPinterest,
  FaRedditAlien,
} from "react-icons/fa6";
import { SiGoogleanalytics } from "react-icons/si";

function KlaviyoIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="1em"
      height="1em"
      viewBox="0 0 152 152"
      fill="currentColor"
    >
      <path d="M148.76,124.01H3.24V26.63H148.76l-30.55,48.69,30.55,48.69Z" />
    </svg>
  );
}

export default function HomePage() {
  const [billingCycle, setBillingCycle] = useState("yearly");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Organization",
                "name": "Track Clear",
                "url": "https://trackclear.io",
                "description": "Server-side event tracking for Shopify stores",
              },
              {
                "@type": "WebSite",
                "name": "Track Clear",
                "url": "https://trackclear.io",
              },
              {
                "@type": "SoftwareApplication",
                "name": "Track Clear",
                "applicationCategory": "BusinessApplication",
                "operatingSystem": "Web",
                "description": "Server-side event tracking for Shopify. Forward conversions to Meta, TikTok, GA4, Klaviyo, Reddit, and Pinterest.",
                "offers": [
                  {
                    "@type": "Offer",
                    "name": "Free",
                    "price": "0",
                    "priceCurrency": "USD",
                    "description": "50 orders/month, unlimited other events",
                  },
                  {
                    "@type": "Offer",
                    "name": "Starter",
                    "price": "29",
                    "priceCurrency": "USD",
                    "description": "500 orders/month, unlimited other events",
                  },
                  {
                    "@type": "Offer",
                    "name": "Growth",
                    "price": "49",
                    "priceCurrency": "USD",
                    "description": "1000 orders/month, 30-day event log",
                  },
                  {
                    "@type": "Offer",
                    "name": "Scale",
                    "price": "99",
                    "priceCurrency": "USD",
                    "description": "5000 orders/month, 30-day event log, priority support",
                  },
                ],
              },
            ],
          }),
        }}
      />

      {/* ───────────────────────── Navigation ───────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80"
          >
            <img src="/logo.png" alt="Track Clear" width={32} height={32} className="h-8 w-8" />
            <span className="text-base font-bold tracking-tight">trackclear<span className="text-brand-500">.io</span></span>
          </Link>

          <nav className="hidden items-center gap-8 sm:flex">
            <a
              href="#features"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              How it Works
            </a>
            <a
              href="#pricing"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Pricing
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="default" asChild>
              <Link href="/login">Log in</Link>
            </Button>
            <Button variant="brand" size="default" asChild className="rounded-lg px-5 shadow-lg shadow-brand-500/10">
              <Link href="/signup">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ───────────────────────── Hero ───────────────────────── */}
        <section className="relative overflow-hidden">
          {/* Deep dark background */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, hsl(220,40%,5%) 0%, hsl(220,30%,4%) 100%)",
            }}
          />

          {/* Dot grid */}
          <div className="pointer-events-none absolute inset-0 opacity-25 bg-dot-white" />

          {/* Vibrant atmospheric glows */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 110% 60% at 50% -5%, rgba(14,135,233,0.18) 0%, rgba(6,182,212,0.06) 40%, transparent 70%)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 60% 80% at 90% 30%, rgba(6,182,212,0.1) 0%, transparent 60%)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 50% 50% at 10% 70%, rgba(14,135,233,0.08) 0%, transparent 50%)",
            }}
          />

          {/* Bottom fade to page background */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, transparent 75%, hsl(222,28%,4%) 100%)",
            }}
          />

          <div className="relative mx-auto max-w-6xl px-6 pb-16 pt-24 sm:pb-20 sm:pt-32">
            <div className="mx-auto max-w-4xl text-center animate-fade-in-up">
              <Badge variant="outline" className="mb-8 rounded-full border-brand-500/20 bg-brand-500/5 px-4 py-1 text-xs font-semibold text-brand-400 backdrop-blur-md">
                Server-side tracking made simple
              </Badge>
              <h1 className="mb-6 text-5xl font-extrabold leading-[1.05] tracking-tight text-foreground sm:text-7xl md:text-[5rem]">
                Your ad pixels miss
                <br />
                20&ndash;40% of conversions.
                <br />
                <span className="text-gradient drop-shadow-sm">We catch them.</span>
              </h1>

              <p className="mx-auto mb-10 max-w-xl text-lg leading-relaxed text-muted-foreground/90">
                The most affordable server-side tracking for Shopify. Forward high-quality events to Meta, TikTok, GA4, Klaviyo, and more in 10 minutes.
              </p>

              <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <Button
                  variant="brand"
                  size="lg"
                  asChild
                  className="h-14 gap-2 rounded-xl border border-white/[0.1] px-8 text-lg font-bold shadow-xl shadow-brand-500/20 transition-all hover:scale-[1.02] hover:brightness-110 active:scale-[0.98]"
                >
                  <Link href="/signup">
                    Get Started Free
                    <ArrowRight className="h-5 w-5" />
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  asChild
                  className="h-14 rounded-xl border-white/[0.1] bg-white/[0.03] px-8 text-lg font-bold backdrop-blur-md transition-all hover:bg-white/[0.08] hover:brightness-110 active:scale-[0.98]"
                >
                  <Link href="#how-it-works">See how it works</Link>
                </Button>
              </div>
            </div>

            {/* ── Social Proof / Trusted By ── */}
            <div className="mx-auto mt-20 max-w-3xl animate-fade-in-up-delay-1">
              <p className="mb-8 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40">
                TRUSTED BY 200+ SHOPIFY STORES WORLDWIDE
              </p>
              <div className="flex flex-wrap items-center justify-center gap-8 opacity-40 grayscale transition-all hover:opacity-60 hover:grayscale-0 sm:gap-14">
                <div className="flex items-center gap-2">
                  <FaMeta className="h-6 w-6" />
                  <span className="font-semibold text-lg">Meta</span>
                </div>
                <div className="flex items-center gap-2">
                  <SiGoogleanalytics className="h-6 w-6" />
                  <span className="font-semibold text-lg">Google</span>
                </div>
                <div className="flex items-center gap-2">
                  <Image src="/shopify.svg" alt="Shopify" width={24} height={24} className="h-6 w-6" />
                  <span className="font-semibold text-lg">Shopify</span>
                </div>
                <div className="flex items-center gap-2">
                  <KlaviyoIcon className="h-6 w-6" />
                  <span className="font-semibold text-lg">Klaviyo</span>
                </div>
              </div>
            </div>

            {/* ── Product Visual ── */}
            <div className="relative mx-auto mt-20 max-w-5xl animate-fade-in-up-delay-2">
              <div
                className="pointer-events-none absolute -inset-10 rounded-2xl opacity-60"
                style={{
                  background:
                    "radial-gradient(ellipse at center, rgba(14,135,233,0.15) 0%, transparent 70%)",
                }}
              />
              <div className="relative overflow-hidden rounded-2xl border border-white/[0.1] bg-white/[0.03] shadow-[0_0_100px_rgba(0,0,0,0.5)] backdrop-blur-xl">
                {/* Mock header bar */}
                <div className="flex items-center gap-1 border-b border-white/[0.08] px-5 py-4">
                  <div className="flex items-center gap-1.5 mr-6">
                    <div className="h-3 w-3 rounded-full bg-red-500/20" />
                    <div className="h-3 w-3 rounded-full bg-yellow-500/20" />
                    <div className="h-3 w-3 rounded-full bg-green-500/20" />
                  </div>
                  {["Dashboard", "Events", "Settings"].map((tab, i) => (
                    <span
                      key={tab}
                      className={`rounded-lg px-4 py-1.5 text-xs font-semibold ${
                        i === 0
                          ? "bg-brand-500/10 text-brand-400"
                          : "text-muted-foreground/40"
                      }`}
                    >
                      {tab}
                    </span>
                  ))}
                </div>

                {/* Pipeline visual */}
                <div className="relative p-8">
                  <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
                    <div className="relative rounded-xl border border-white/[0.08] bg-white/[0.03] p-6 transition-colors hover:border-white/[0.15]">
                      <Image src="/shopify.svg" alt="Shopify" width={24} height={24} className="absolute right-4 top-4 opacity-70" />
                      <div className="mb-4 flex items-center gap-2 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                        Live Snippet
                      </div>
                      <div className="text-base font-bold text-foreground">Shopify Store</div>
                      <div className="mt-1 text-sm text-muted-foreground/50">Collecting events...</div>
                    </div>

                    <div className="relative rounded-xl border border-brand-500/30 bg-brand-500/[0.05] p-6 shadow-2xl shadow-brand-500/5 ring-1 ring-brand-500/20">
                      <div className="mb-4 flex items-center gap-2 text-[10px] font-bold text-brand-400 uppercase tracking-wider">
                        <span className="h-2 w-2 rounded-full bg-brand-400 animate-pulse" />
                        Track Clear API
                      </div>
                      <div className="text-base font-bold text-foreground">Server-Side Hub</div>
                      <div className="mt-1 text-sm text-muted-foreground/50">142ms latency</div>
                    </div>

                    <div className="relative rounded-xl border border-white/[0.08] bg-white/[0.03] p-6 transition-colors hover:border-white/[0.15]">
                      <div className="mb-4 flex items-center gap-2 text-[10px] font-bold text-cyan-400 uppercase tracking-wider">
                        <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                        Connected
                      </div>
                      <div className="text-base font-bold text-foreground">6 Destinations</div>
                      <div className="mt-1 text-sm text-muted-foreground/50">Forwarding data...</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ───────────────────────── Stats Strip ───────────────────────── */}
        <section
          className="border-y border-white/[0.06] bg-white/[0.01]"
        >
          <div className="mx-auto max-w-6xl px-6 py-12">
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
              {[
                { value: "6", label: "Platforms supported" },
                { value: "<150ms", label: "Avg. processing" },
                { value: "$0", label: "To get started" },
                { value: "10 min", label: "Setup to first event" },
              ].map((stat, i) => (
                <ScrollReveal key={stat.label} delay={i * 100}>
                  <div className="text-center group">
                    <div className="text-3xl font-extrabold tracking-tight text-brand-400 tabular-nums sm:text-4xl transition-transform group-hover:scale-110 duration-300">
                      {stat.value}
                    </div>
                    <div className="mt-2 text-xs font-bold uppercase tracking-widest text-muted-foreground/40">
                      {stat.label}
                    </div>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        {/* ───────────────────────── Problem Section ───────────────────────── */}
        <section id="features" className="relative border-b border-white/[0.06] py-24 sm:py-32">
          <div className="pointer-events-none absolute inset-0 bg-grid-white opacity-20" />
          <div className="relative mx-auto max-w-6xl px-6">
            <ScrollReveal>
              <div className="mb-16 text-center">
                <Badge variant="outline" className="mb-4 rounded-full border-red-500/20 bg-red-500/5 px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-red-400">
                  The problem
                </Badge>
                <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
                  Your pixel data is incomplete
                </h2>
              </div>
            </ScrollReveal>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <ScrollReveal delay={0}>
                <SpotlightCard glowColor="rgba(239, 68, 68, 0.1)">
                  <h3 className="mb-3 text-lg font-bold text-foreground">
                    Ad blockers kill the pixel
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground/80">
                    ~30% of desktop users run ad blockers. Every one silently
                    drops requests to{" "}
                    <code className="font-mono text-[11px] text-brand-400 bg-brand-500/5 px-1.5 py-0.5 rounded">
                      connect.facebook.net
                    </code>{" "}
                    before your pixel fires.
                  </p>
                </SpotlightCard>
              </ScrollReveal>

              <ScrollReveal delay={150}>
                <SpotlightCard glowColor="rgba(239, 68, 68, 0.1)">
                  <h3 className="mb-3 text-lg font-bold text-foreground">
                    iOS 14+ breaks attribution
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground/80">
                    Apple&apos;s ATT prompt and Intelligent Tracking Prevention
                    limit cookie lifetimes to 7 days and suppress cross-site
                    signals on Safari.
                  </p>
                </SpotlightCard>
              </ScrollReveal>

              <ScrollReveal delay={300}>
                <SpotlightCard glowColor="rgba(239, 68, 68, 0.1)">
                  <h3 className="mb-3 text-lg font-bold text-foreground">
                    Missing events waste ad spend
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground/80">
                    Meta&apos;s algorithm optimizes on the conversions it sees.
                    Incomplete data means it targets the wrong people and
                    overpays for them.
                  </p>
                </SpotlightCard>
              </ScrollReveal>
            </div>
          </div>
        </section>

        {/* ───────────── Feature: Capture Everything (content LEFT, visual RIGHT) ───────────── */}
        <section className="relative border-b border-white/[0.06] overflow-hidden">
          <div className="pointer-events-none absolute -right-20 top-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-500/10 rounded-full blur-[120px]" />
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
            <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2 lg:gap-24">
              {/* Left: Content */}
              <ScrollReveal direction="left">
              <div>
                <Badge variant="outline" className="mb-4 rounded-full border-brand-500/20 bg-brand-500/5 px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-brand-400">
                  Reliability
                </Badge>
                <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  Capture every event, <span className="text-brand-400">every time</span>
                </h2>
                <p className="mt-6 text-base leading-relaxed text-muted-foreground">
                  Our JavaScript snippet hooks into Shopify&apos;s{" "}
                  <code className="rounded bg-white/[0.04] px-2 py-1 font-mono text-xs text-brand-300">
                    analytics.subscribe()
                  </code>{" "}
                  API inside their Custom Pixel sandbox. Every browser event is
                  captured with full context &mdash; cookies, user agent, URL
                  &mdash; and sent to our servers where ad blockers can&apos;t
                  reach.
                </p>
                <ul className="mt-8 space-y-4">
                  {[
                    "PageView, ViewContent, AddToCart, Checkout, Purchase",
                    "Automatic event_id for pixel deduplication",
                    "Consent-aware via Shopify Customer Privacy API",
                    "Works alongside your existing Meta browser pixel",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-3">
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500/10">
                        <Check className="h-3 w-3 text-brand-400" />
                      </div>
                      <span className="text-sm font-medium text-muted-foreground/90">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              </ScrollReveal>

              {/* Right: Event Pipeline Terminal */}
              <ScrollReveal direction="right">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-brand-500 to-cyan-500 rounded-xl blur opacity-20 group-hover:opacity-30 transition duration-1000"></div>
                <div className="relative overflow-hidden rounded-xl border border-white/[0.1] bg-black/40 backdrop-blur-xl">
                  {/* Terminal chrome */}
                  <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3 bg-white/[0.02]">
                    <div className="h-2.5 w-2.5 rounded-full bg-white/[0.1]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-white/[0.1]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-white/[0.1]" />
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/30">
                      trackclear pipeline
                    </span>
                  </div>

                  {/* Terminal content */}
                  <pre className="overflow-x-auto px-6 py-6 font-mono text-[13px] leading-relaxed">
                    <code>
                      <span className="text-muted-foreground/40 italic">
                        {"// "}PageView from shop.example.com
                      </span>
                      {"\n"}
                      <span className="text-brand-400 font-bold">
                        {"\u2192"} PageView captured
                      </span>
                      {"\n"}
                      <span className="text-muted-foreground/60">
                        {"  \u251C"} PII hashed (SHA-256)
                      </span>
                      {"\n"}
                      <span className="text-muted-foreground/60">
                        {"  \u251C"} Phone normalized (E.164)
                      </span>
                      {"\n"}
                      <span className="text-muted-foreground/60">
                        {"  \u2514"} Forwarded to 3 destinations
                      </span>
                      {"  "}
                      <span className="text-emerald-400 font-bold">
                        {"\u2713"} 200 OK
                      </span>
                      {"\n\n"}
                      <span className="text-muted-foreground/40 italic">
                        {"// "}Purchase $127.50 &mdash; order #4891
                      </span>
                      {"\n"}
                      <span className="text-brand-400 font-bold">
                        {"\u2192"} Purchase captured
                      </span>
                      {"\n"}
                      <span className="text-muted-foreground/60">
                        {"  \u251C"} PII hashed (SHA-256)
                      </span>
                      {"\n"}
                      <span className="text-muted-foreground/60">
                        {"  \u251C"} Dedup: event_id matched
                      </span>
                      {"\n"}
                      <span className="text-muted-foreground/60">
                        {"  \u2514"} Forwarded to 5 destinations
                      </span>
                      {"  "}
                      <span className="text-emerald-400 font-bold">
                        {"\u2713"} 200 OK
                      </span>
                    </code>
                  </pre>
                </div>
              </div>
              </ScrollReveal>
            </div>
          </div>
        </section>

        {/* ───────────── Feature: Server-Side Forwarding (visual LEFT, content RIGHT) ───────────── */}
        <section id="how-it-works" className="relative border-b border-white/[0.06] overflow-hidden">
          <div className="pointer-events-none absolute -left-20 top-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-[120px]" />
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
            <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2 lg:gap-24">
              {/* Left: Code Snippet Visual */}
              <ScrollReveal direction="left">
              <div className="relative group lg:order-1">
                <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-brand-500 rounded-xl blur opacity-20 group-hover:opacity-30 transition duration-1000"></div>
                <div className="relative overflow-hidden rounded-xl border border-white/[0.1] bg-black/40 backdrop-blur-xl">
                  <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3 bg-white/[0.02]">
                    <div className="h-2.5 w-2.5 rounded-full bg-white/[0.1]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-white/[0.1]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-white/[0.1]" />
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/30">
                      custom-pixel.js
                    </span>
                  </div>
                  <pre className="overflow-x-auto px-6 py-6 font-mono text-[13px] leading-relaxed">
                    <code>
                      <span className="text-muted-foreground/50">{"// Shopify Custom Pixel"}</span>
                      {"\n"}
                      <span className="text-brand-400">{"analytics"}</span>
                      <span className="text-foreground/70">{".subscribe("}</span>
                      <span className="text-cyan-400">{"\"all_events\""}</span>
                      <span className="text-foreground/70">{", (event) => {"}
                      {"\n"}
                      <span className="text-foreground/70">{"  "}</span>
                      <span className="text-brand-400">{"fetch"}</span>
                      <span className="text-foreground/70">{"("}</span>
                      <span className="text-cyan-400">{"\"https://api.trackclear.io\""}</span>
                      <span className="text-foreground/70">{", {"}
                      {"\n"}
                      <span className="text-foreground/70">{"    method: "}</span>
                      <span className="text-cyan-400">{"\"POST\""}</span>
                      {"\n"}
                      <span className="text-foreground/70">{"    body: "}</span>
                      <span className="text-brand-400">{"JSON"}</span>
                      <span className="text-foreground/70">{".stringify({"}
                      {"\n"}
                      <span className="text-foreground/70">{"      event_name: event.name,"}</span>
                      {"\n"}
                      <span className="text-foreground/70">{"      event_id: "}</span>
                      <span className="text-brand-400">{"crypto"}</span>
                      <span className="text-foreground/70">{".randomUUID()"}</span>
                      {"\n"}
                      <span className="text-foreground/70">{"    })"}</span>
                      {"\n"}
                      <span className="text-foreground/70">{"  });"}</span>
                      {"\n"}
                      <span className="text-foreground/70">{"});"}</span>
                    </code>
                  </pre>
                </div>
              </div>
              </ScrollReveal>

              {/* Right: Content */}
              <ScrollReveal direction="right">
              <div className="lg:order-2">
                <Badge variant="outline" className="mb-4 rounded-full border-cyan-500/20 bg-cyan-500/5 px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-400">
                  Integration
                </Badge>
                <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  One snippet. <span className="text-cyan-400">Complete tracking.</span>
                </h2>
                <p className="mt-6 text-base leading-relaxed text-muted-foreground">
                  Paste a single JavaScript snippet into Shopify&apos;s Custom
                  Pixel settings. No theme changes, no app install, and no
                  developer needed. 
                </p>
                <ul className="mt-8 space-y-4">
                  {[
                    "No theme liquid changes required",
                    "Invisible to ad blockers and tracking preventions",
                    "PII hashed with SHA-256 for maximum privacy",
                    "Automatic dedup via shared event_id",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-3">
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/10">
                        <Check className="h-3 w-3 text-cyan-400" />
                      </div>
                      <span className="text-sm font-medium text-muted-foreground/90">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              </ScrollReveal>
            </div>
          </div>
        </section>

        {/* ───────────── Feature: Monitor & Dashboard (3 cards) ───────────── */}
        <section className="relative border-b border-white/[0.06] py-24 sm:py-32">
          <div className="pointer-events-none absolute inset-0 bg-dot-white opacity-20" />
          <div className="relative mx-auto max-w-6xl px-6">
            <ScrollReveal>
              <div className="mb-16 text-center">
                <Badge variant="outline" className="mb-4 rounded-full border-brand-500/20 bg-brand-500/5 px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-brand-400">
                  Visibility
                </Badge>
                <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  Complete tracking visibility
                </h2>
                <p className="mx-auto mt-4 max-w-lg text-base text-muted-foreground/80">
                  Everything you need to know your tracking is working, in real-time.
                </p>
              </div>
            </ScrollReveal>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <ScrollReveal delay={0}>
                <SpotlightCard>
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10 text-brand-400">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="mb-3 text-lg font-bold text-foreground">
                    Revenue tracking
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground/80">
                    See exactly how much revenue flows through your funnel
                    &mdash; AddToCart, Checkout, and Purchase values with daily
                    comparisons.
                  </p>
                </SpotlightCard>
              </ScrollReveal>

              <ScrollReveal delay={150}>
                <SpotlightCard>
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="mb-3 text-lg font-bold text-foreground">
                    Event funnel
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground/80">
                    Watch events flow from PageView to Purchase. Know exactly how
                    many events fire at each stage, compared to yesterday.
                  </p>
                </SpotlightCard>
              </ScrollReveal>

              <ScrollReveal delay={300}>
                <SpotlightCard>
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <h3 className="mb-3 text-lg font-bold text-foreground">
                    Delivery health
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground/80">
                    Real-time success rates with green/yellow/red status
                    indicators. Know instantly if something breaks.
                  </p>
                </SpotlightCard>
              </ScrollReveal>
            </div>
          </div>
        </section>

        {/* ───────────── Animated Dashboard Showcase ───────────── */}
        <section className="relative border-b border-white/[0.06] py-24 sm:py-32 overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-grid-white opacity-10" />
          <div className="relative mx-auto max-w-6xl px-6">
            <ScrollReveal>
              <div className="mb-16 text-center">
                <Badge variant="outline" className="mb-4 rounded-full border-brand-500/20 bg-brand-500/5 px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-brand-400">
                  Dashboard
                </Badge>
                <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
                  Your tracking hub, <span className="text-brand-400">reimagined</span>
                </h2>
                <p className="mx-auto mt-4 max-w-lg text-base text-muted-foreground/80">
                  Real-time revenue, funnels, and live event delivery in one beautiful interface.
                </p>
              </div>
            </ScrollReveal>

            <AnimatedDashboard />
          </div>
        </section>

        {/* ───────────────────────── Pricing ───────────────────────── */}
        <section id="pricing" className="relative border-b border-white/[0.06] py-24 sm:py-32">
          <div className="pointer-events-none absolute inset-0 bg-grid-white opacity-20" />
          <div className="relative mx-auto max-w-6xl px-6">
            <ScrollReveal>
              <div className="mb-14 text-center">
                <Badge variant="outline" className="mb-4 rounded-full border-brand-500/20 bg-brand-500/5 px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-brand-400">
                  Pricing
                </Badge>
                <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
                  Scale your tracking, <span className="text-brand-400">not your costs</span>
                </h2>
                <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground/80">
                  Other tools charge $100&ndash;300/mo for the same thing. Track Clear starts free and only charges for Purchase events. All other events are unlimited.
                </p>

                {/* Pricing Toggle */}
                <div className="mt-12 flex items-center justify-center gap-4">
                  <span className={`text-sm font-bold transition-colors ${billingCycle === "monthly" ? "text-foreground" : "text-muted-foreground"}`}>Monthly</span>
                  <button
                    onClick={() => setBillingCycle(billingCycle === "monthly" ? "yearly" : "monthly")}
                    className="relative h-7 w-12 rounded-full bg-white/[0.1] transition-colors hover:bg-white/[0.15]"
                  >
                    <div className={`absolute top-1 h-5 w-5 rounded-full bg-brand-500 transition-all ${billingCycle === "yearly" ? "left-6" : "left-1"}`} />
                  </button>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold transition-colors ${billingCycle === "yearly" ? "text-foreground" : "text-muted-foreground"}`}>Yearly</span>
                    <Badge className="rounded-full bg-brand-500/10 text-[10px] font-bold text-brand-400 ring-1 ring-brand-500/20">2 MONTHS FREE</Badge>
                  </div>
                </div>
              </div>
            </ScrollReveal>

            <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  name: "Free",
                  price: 0,
                  orders: "50",
                  features: ["50 orders/month", "Unlimited other events", "7-day event log"],
                  cta: "Get started free",
                  highlight: false
                },
                {
                  name: "Starter",
                  price: billingCycle === "monthly" ? 29 : 24,
                  orders: "500",
                  features: ["500 orders/month", "Unlimited other events", "7-day event log", "Email support"],
                  cta: "Start with Starter",
                  highlight: false
                },
                {
                  name: "Growth",
                  price: billingCycle === "monthly" ? 49 : 40,
                  orders: "1,000",
                  features: ["1,000 orders/month", "Unlimited other events", "30-day event log", "Priority support"],
                  cta: "Start with Growth",
                  highlight: true
                },
                {
                  name: "Scale",
                  price: billingCycle === "monthly" ? 99 : 82,
                  orders: "5,000",
                  features: ["5,000 orders/month", "Unlimited other events", "30-day event log", "Priority support"],
                  cta: "Start with Scale",
                  highlight: false
                },
              ].map((plan, i) => (
                <ScrollReveal key={plan.name} delay={i * 100}>
                  <div className={cn(
                    "relative flex h-full flex-col rounded-2xl border p-8 transition-all duration-300 hover:scale-[1.02]",
                    plan.highlight 
                      ? "border-brand-500/30 bg-brand-500/[0.03] shadow-xl shadow-brand-500/10 ring-1 ring-brand-500/20" 
                      : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]"
                  )}>
                    {plan.highlight && (
                      <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-500 px-3 py-0.5 text-[10px] font-bold text-white shadow-lg shadow-brand-500/20">
                        MOST POPULAR
                      </Badge>
                    )}
                    <div className="mb-1 text-xs font-bold uppercase tracking-widest text-muted-foreground/60">{plan.name}</div>
                    <div className="mb-6 flex items-baseline gap-1">
                      <span className="text-4xl font-extrabold tracking-tight text-foreground">${plan.price}</span>
                      <span className="text-sm font-medium text-muted-foreground/60">/mo</span>
                    </div>
                    <ul className="mb-8 flex-1 space-y-4">
                      {plan.features.map(feat => (
                        <li key={feat} className="flex items-start gap-3 text-sm text-muted-foreground/80">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                          {feat}
                        </li>
                      ))}
                    </ul>
                    <Button
                      variant={plan.highlight ? "brand" : "outline"}
                      className={cn("w-full rounded-xl font-bold py-6 transition-all", !plan.highlight && "border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.08]")}
                      asChild
                    >
                      <Link href="/signup">{plan.cta}</Link>
                    </Button>
                    {plan.name === "Free" && <div className="mt-4 text-center text-[10px] font-medium text-muted-foreground/40">No credit card required</div>}
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        {/* ───────────────────────── Final CTA ───────────────────────── */}
        <section className="relative overflow-hidden py-32 sm:py-48">
          <div className="pointer-events-none absolute inset-0 bg-grid-white opacity-10" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-brand-500/5 to-transparent" />
          
          <div className="relative mx-auto max-w-4xl px-6">
            <ScrollReveal>
              <div className="text-center">
                <Badge variant="outline" className="mb-6 rounded-full border-brand-500/20 bg-brand-500/5 px-4 py-1 text-xs font-bold text-brand-400">
                  Ready to fix your tracking?
                </Badge>
                <h2 className="mb-6 text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl">
                  Start tracking in <span className="text-gradient">10 minutes</span>
                </h2>
                <p className="mx-auto mb-10 max-w-xl text-lg text-muted-foreground/80 leading-relaxed">
                  Join 200+ Shopify stores catching every conversion. Free forever up to 50 orders/mo. No credit card required.
                </p>
                <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                  <Button variant="brand" size="lg" asChild className="h-14 gap-2 rounded-xl border border-white/[0.1] px-10 text-lg font-bold shadow-2xl shadow-brand-500/20 transition-all hover:scale-[1.05]">
                    <Link href="/signup">
                      Create your account
                      <ArrowRight className="h-5 w-5" />
                    </Link>
                  </Button>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </section>
      </main>

      {/* ───────────────────────── Footer ───────────────────────── */}
      <footer
        className="border-t border-transparent"
        style={{
          borderImage:
            "linear-gradient(to right, transparent, rgba(14,135,233,0.15), transparent) 1",
        }}
      >
        <div className="mx-auto max-w-6xl px-6 py-16">
          {/* Multi-column link grid */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            <div>
              <h4 className="mb-4 text-xs font-bold uppercase tracking-widest text-foreground/80">
                Product
              </h4>
              <ul className="space-y-3">
                <li>
                  <a href="#features" className="text-sm font-medium text-muted-foreground/50 transition-colors hover:text-foreground">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="text-sm font-medium text-muted-foreground/50 transition-colors hover:text-foreground">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="/login" className="text-sm font-medium text-muted-foreground/50 transition-colors hover:text-foreground">
                    Dashboard
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-xs font-bold uppercase tracking-widest text-foreground/80">
                Resources
              </h4>
              <ul className="space-y-3">
                <li>
                  <a href="#how-it-works" className="text-sm font-medium text-muted-foreground/50 transition-colors hover:text-foreground">
                    How it works
                  </a>
                </li>
                <li>
                  <a href="#how-it-works" className="text-sm font-medium text-muted-foreground/50 transition-colors hover:text-foreground">
                    Shopify setup guide
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-xs font-bold uppercase tracking-widest text-foreground/80">
                Company
              </h4>
              <ul className="space-y-3">
                <li>
                  <a href="#" className="text-sm font-medium text-muted-foreground/50 transition-colors hover:text-foreground">
                    About
                  </a>
                </li>
                <li>
                  <a href="#" className="text-sm font-medium text-muted-foreground/50 transition-colors hover:text-foreground">
                    Contact
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-xs font-bold uppercase tracking-widest text-foreground/80">
                Legal
              </h4>
              <ul className="space-y-3">
                <li>
                  <Link
                    href="/privacy"
                    className="text-sm font-medium text-muted-foreground/50 transition-colors hover:text-foreground"
                  >
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link
                    href="/terms"
                    className="text-sm font-medium text-muted-foreground/50 transition-colors hover:text-foreground"
                  >
                    Terms
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-16 flex flex-col items-center justify-between gap-6 border-t border-white/[0.06] pt-8 sm:flex-row">
            <span className="flex items-center gap-2 text-sm font-bold tracking-tight text-foreground">
              <img src="/logo.png" alt="Track Clear" width={28} height={28} className="h-7 w-7" />
              <span className="text-base font-bold tracking-tight transition-opacity hover:opacity-80">
                trackclear<span className="text-brand-500">.io</span>
              </span>
            </span>
            <span className="text-xs font-medium text-muted-foreground/40">
              &copy; {new Date().getFullYear()} Track Clear. All rights
              reserved.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
