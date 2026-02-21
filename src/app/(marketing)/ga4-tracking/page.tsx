import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowRight,
  Check,
  BarChart3,
  Shield,
  Layers,
  MousePointerClick,
  Zap,
  Globe,
  TrendingUp,
  Eye,
  ShoppingCart,
  CreditCard,
} from "lucide-react";

export const metadata: Metadata = {
  title: "GA4 Server-Side Tracking for Shopify",
  description:
    "Send Shopify events to Google Analytics 4 via the Measurement Protocol. Server-side GA4 tracking that bypasses ad blockers for complete analytics data.",
  keywords: [
    "ga4 server side shopify",
    "google analytics 4 shopify",
    "ga4 measurement protocol",
    "shopify ga4 tracking",
    "server side google analytics",
  ],
  alternates: { canonical: "/ga4-tracking" },
};

export default function GA4TrackingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Track Clear — GA4 Server-Side Tracking",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            description:
              "Send Shopify events to Google Analytics 4 via the Measurement Protocol. Server-side GA4 tracking that bypasses ad blockers for complete analytics data.",
            url: "https://trackclear.io/ga4-tracking",
          }),
        }}
      />

      {/* ───────────────────────── Navigation ───────────────────────── */}
      <header className="relative z-10 bg-transparent">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight text-foreground"
          >
            <span className="text-brand-500">Track</span>&thinsp;Clear
          </Link>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="default" asChild>
              <Link href="/login">Log in</Link>
            </Button>
            <Button variant="brand" size="default" asChild>
              <Link href="/signup">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ───────────────────────── Hero ───────────────────────── */}
        <div className="px-6 pt-2 sm:px-12 sm:pt-3">
          <section
            className="relative overflow-hidden rounded-t-2xl sm:rounded-t-3xl"
            style={{
              background:
                "linear-gradient(180deg, hsl(180,30%,6%) 0%, hsl(200,40%,5%) 100%)",
            }}
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

            {/* Atmospheric glow */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 110% 60% at 50% -5%, rgba(20,184,166,0.14) 0%, rgba(16,185,129,0.04) 40%, transparent 70%)",
              }}
            />
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 60% 80% at 90% 30%, rgba(16,185,129,0.08) 0%, transparent 60%)",
              }}
            />

            {/* Bottom fade */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(to bottom, transparent 70%, hsl(200,40%,5%) 100%)",
              }}
            />

            <div className="relative mx-auto max-w-6xl px-6 pb-16 pt-24 sm:pb-20 sm:pt-28">
              <div className="mx-auto max-w-3xl text-center">
                {/* Platform badge */}
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                  GA4 Measurement Protocol integration
                </div>

                <h1 className="mb-6 text-5xl font-bold leading-[1.05] tracking-tighter text-foreground sm:text-6xl md:text-[4.25rem]">
                  Server-side GA4 tracking
                  <br />
                  <span className="text-gradient">for Shopify</span>
                </h1>

                <p className="mx-auto mb-10 max-w-xl text-base leading-relaxed text-muted-foreground">
                  Get complete Google Analytics 4 data by sending events via the
                  Measurement Protocol. No more gaps from ad blockers or browser
                  privacy features.
                </p>

                <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                  <Button
                    variant="brand"
                    size="lg"
                    asChild
                    className="gap-2 rounded-lg border border-white/[0.15] px-6 py-3 text-lg font-medium tracking-tight transition-[filter] duration-150 hover:brightness-110"
                  >
                    <Link href="/signup">
                      Get Started Free
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    asChild
                    className="rounded-lg border-white/[0.15] bg-transparent px-6 py-3 text-lg font-medium tracking-tight transition-[filter] duration-150 hover:bg-white/[0.04] hover:brightness-110"
                  >
                    <Link href="#how-it-works">See how it works</Link>
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ───────────────────────── Feature Cards ───────────────────────── */}
        <section id="features" className="border-b border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
            <div className="mb-14 text-center">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                Why it matters
              </p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Accurate GA4 data you can trust
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">
                The GA4 tag alone is blocked by ~30% of desktop visitors.
                Server-side events ensure your analytics reflect actual user
                behavior.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card className="border-white/[0.06] bg-white/[0.02] shadow-none transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10] hover:glow-card">
                <CardContent className="p-6">
                  <BarChart3 className="mb-4 h-5 w-5 text-brand-500" />
                  <h3 className="mb-2 text-sm font-semibold text-foreground">
                    Complete analytics data
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Ad blockers block Google Analytics scripts on ~30% of desktop
                    sessions. Server-side events ensure your analytics reflect
                    actual user behavior.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-white/[0.06] bg-white/[0.02] shadow-none transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10] hover:glow-card">
                <CardContent className="p-6">
                  <Layers className="mb-4 h-5 w-5 text-brand-500" />
                  <h3 className="mb-2 text-sm font-semibold text-foreground">
                    Measurement Protocol
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Track Clear uses the GA4 Measurement Protocol to send events
                    directly to Google&apos;s collection servers. Simple API
                    secret auth, no OAuth complexity.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-white/[0.06] bg-white/[0.02] shadow-none transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10] hover:glow-card">
                <CardContent className="p-6">
                  <Shield className="mb-4 h-5 w-5 text-brand-500" />
                  <h3 className="mb-2 text-sm font-semibold text-foreground">
                    Accurate funnel analysis
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    See the real numbers for your ecommerce funnel. Every
                    AddToCart, Checkout, and Purchase is captured regardless of
                    browser restrictions.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* ───────────────────────── How It Works ───────────────────────── */}
        <section id="how-it-works" className="border-b border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
            <div className="mb-14 text-center">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                How it works
              </p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Set up in 4 steps
              </h2>
            </div>

            <div className="mx-auto max-w-2xl space-y-6">
              {[
                {
                  step: "01",
                  title: "Paste one snippet into Shopify",
                  desc: "Add Track Clear's JavaScript snippet to Shopify Admin > Settings > Customer Events. No theme edits. No developer needed.",
                  icon: MousePointerClick,
                },
                {
                  step: "02",
                  title: "Connect your GA4 property",
                  desc: "Enter your GA4 Measurement ID and API secret in the Track Clear dashboard. No OAuth flow — just a simple API secret from your GA4 property settings.",
                  icon: Zap,
                },
                {
                  step: "03",
                  title: "Events are forwarded via Measurement Protocol",
                  desc: "The snippet fires on every Shopify event. Our servers receive the data, hash PII, and send it directly to Google's GA4 collection endpoint — bypassing any browser blockers.",
                  icon: Globe,
                },
                {
                  step: "04",
                  title: "See complete data in GA4 and Track Clear",
                  desc: "GA4 reports fill in gaps that the browser tag was missing. Track Clear's dashboard shows delivery rates and event counts across all your destinations.",
                  icon: TrendingUp,
                },
              ].map(({ step, title, desc, icon: Icon }) => (
                <div
                  key={step}
                  className="flex gap-5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-5 transition-all duration-300 hover:border-white/[0.10]"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-brand-500/20 bg-brand-500/[0.06] text-xs font-bold tabular-nums text-brand-400">
                    {step}
                  </div>
                  <div className="flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <Icon className="h-4 w-4 text-brand-500" />
                      <h3 className="text-sm font-semibold text-foreground">
                        {title}
                      </h3>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ───────────────────────── Supported Events ───────────────────────── */}
        <section className="border-b border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
            <div className="mb-14 text-center">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                Events
              </p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                All 5 Shopify events forwarded to GA4
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">
                Every standard Shopify ecommerce event is captured and sent to
                GA4 via the Measurement Protocol.
              </p>
            </div>

            <div className="mx-auto grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  name: "PageView",
                  desc: "Every page visit, including blocked sessions",
                  icon: Eye,
                },
                {
                  name: "ViewContent",
                  desc: "Product page views with item details",
                  icon: Eye,
                },
                {
                  name: "AddToCart",
                  desc: "Cart additions with item value and SKU",
                  icon: ShoppingCart,
                },
                {
                  name: "InitiateCheckout",
                  desc: "Checkout starts with cart total",
                  icon: CreditCard,
                },
                {
                  name: "Purchase",
                  desc: "Orders with revenue, items, and order ID",
                  icon: CreditCard,
                },
              ].map(({ name, desc, icon: Icon }) => (
                <div
                  key={name}
                  className="flex items-start gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 transition-all duration-300 hover:border-white/[0.10]"
                >
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-500/[0.08]">
                    <Icon className="h-3.5 w-3.5 text-brand-500" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      {name}
                    </div>
                    <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {desc}
                    </div>
                  </div>
                </div>
              ))}

              {/* Sixth cell: summary */}
              <div className="flex items-start gap-3 rounded-lg border border-brand-500/[0.12] bg-brand-500/[0.03] p-4">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-500/[0.10]">
                  <Check className="h-3.5 w-3.5 text-brand-500" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    Measurement Protocol
                  </div>
                  <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    Direct server-to-server delivery to GA4 collection endpoint
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ───────────────────────── CTA ───────────────────────── */}
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(20,184,166,0.06) 0%, transparent 70%)",
            }}
          />

          <div className="mx-auto max-w-6xl px-6 py-28 sm:py-32">
            <div className="mx-auto max-w-lg text-center">
              <p className="mb-3 text-xs font-medium uppercase tracking-widest text-brand-500/80">
                Nothing blocked. Everything clear.
              </p>
              <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Start tracking GA4 conversions today
              </h2>
              <p className="mb-8 text-sm text-muted-foreground">
                Free plan included. Paste one snippet, connect your GA4 property,
                and start receiving server-side events in minutes.
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
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <Link
              href="/"
              className="text-sm font-semibold tracking-tight text-foreground"
            >
              <span className="text-brand-500">Track</span>&thinsp;Clear
            </Link>
            <div className="flex items-center gap-6 text-sm text-muted-foreground/50">
              <Link
                href="/"
                className="transition-colors hover:text-foreground"
              >
                Home
              </Link>
              <Link
                href="/signup"
                className="transition-colors hover:text-foreground"
              >
                Sign up
              </Link>
              <Link
                href="/login"
                className="transition-colors hover:text-foreground"
              >
                Log in
              </Link>
              <Link
                href="/privacy"
                className="transition-colors hover:text-foreground"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="transition-colors hover:text-foreground"
              >
                Terms
              </Link>
            </div>
            <span className="text-xs text-muted-foreground/40">
              &copy; {new Date().getFullYear()} Track Clear
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
