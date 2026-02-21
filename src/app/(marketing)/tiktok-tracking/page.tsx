import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowRight,
  Check,
  Link2,
  Shield,
  TrendingUp,
  MousePointerClick,
  Zap,
  Globe,
  ShoppingCart,
  Eye,
  CreditCard,
} from "lucide-react";

export const metadata: Metadata = {
  title: "TikTok Server-Side Tracking for Shopify",
  description:
    "Forward Shopify conversion events to TikTok Events API server-side. Bypass ad blockers, capture ttclid for attribution, and improve TikTok ad performance.",
  keywords: [
    "tiktok tracking shopify",
    "tiktok events api",
    "tiktok server side tracking",
    "tiktok pixel shopify",
    "tiktok capi shopify",
  ],
  alternates: { canonical: "/tiktok-tracking" },
};

export default function TikTokTrackingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Track Clear — TikTok Server-Side Tracking",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            description:
              "Forward Shopify conversion events to TikTok Events API server-side. Bypass ad blockers and capture ttclid for accurate campaign attribution.",
            url: "https://trackclear.io/tiktok-tracking",
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
                  TikTok Events API integration
                </div>

                <h1 className="mb-6 text-5xl font-bold leading-[1.05] tracking-tighter text-foreground sm:text-6xl md:text-[4.25rem]">
                  Server-side TikTok tracking
                  <br />
                  <span className="text-gradient">for Shopify</span>
                </h1>

                <p className="mx-auto mb-10 max-w-xl text-base leading-relaxed text-muted-foreground">
                  TikTok&apos;s browser pixel misses conversions from ad blockers
                  and privacy restrictions. Track Clear captures every event and
                  forwards it via the TikTok Events API.
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
                Complete TikTok conversion data
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">
                The TikTok pixel alone can&apos;t see through ad blockers or iOS
                privacy restrictions. Server-side events fill the gaps.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card className="border-white/[0.06] bg-white/[0.02] shadow-none transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10] hover:glow-card">
                <CardContent className="p-6">
                  <Link2 className="mb-4 h-5 w-5 text-brand-500" />
                  <h3 className="mb-2 text-sm font-semibold text-foreground">
                    Capture ttclid for attribution
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Track Clear&apos;s snippet automatically captures the TikTok
                    click ID (ttclid) from URL parameters and passes it with
                    every event for accurate campaign attribution.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-white/[0.06] bg-white/[0.02] shadow-none transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10] hover:glow-card">
                <CardContent className="p-6">
                  <Shield className="mb-4 h-5 w-5 text-brand-500" />
                  <h3 className="mb-2 text-sm font-semibold text-foreground">
                    Bypass ad blockers
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    ~30% of desktop users block TikTok&apos;s pixel scripts
                    entirely. Server-side events route through our servers at{" "}
                    <code className="font-mono text-xs text-foreground/60">
                      api.trackclear.io
                    </code>{" "}
                    &mdash; a domain not on any block list.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-white/[0.06] bg-white/[0.02] shadow-none transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10] hover:glow-card">
                <CardContent className="p-6">
                  <TrendingUp className="mb-4 h-5 w-5 text-brand-500" />
                  <h3 className="mb-2 text-sm font-semibold text-foreground">
                    Better ad optimization
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Complete conversion data helps TikTok&apos;s algorithm find
                    your best customers. More signal means lower CPA and better
                    ROAS.
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
                  title: "Connect your TikTok pixel",
                  desc: "Enter your TikTok Pixel ID and Events API access token in the Track Clear dashboard. Credentials are encrypted at rest.",
                  icon: Zap,
                },
                {
                  step: "03",
                  title: "Events are captured server-side",
                  desc: "The snippet fires on every Shopify event. Our servers receive the data, hash PII, capture ttclid, and forward it to the TikTok Events API — invisible to ad blockers.",
                  icon: Globe,
                },
                {
                  step: "04",
                  title: "Monitor delivery in real time",
                  desc: "The Track Clear dashboard shows delivery rates, event counts, and campaign attribution so you always know your tracking is working.",
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
                All 5 Shopify events forwarded
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">
                Every standard Shopify ecommerce event is captured and sent to
                TikTok Events API server-side.
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
                  desc: "Product page views with content details",
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
                    ttclid captured
                  </div>
                  <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    TikTok click ID sent with every event for attribution
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
                Start tracking TikTok conversions today
              </h2>
              <p className="mb-8 text-sm text-muted-foreground">
                Free plan included. Paste one snippet, connect your TikTok pixel,
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
