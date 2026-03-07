import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Check, Shield, Zap, Target } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reddit Server-Side Tracking for Shopify",
  description:
    "Forward Shopify conversion events to Reddit Ads via the Conversions API. Server-side tracking that captures rdt_cid for accurate Reddit ad attribution.",
  keywords: [
    "reddit tracking shopify",
    "reddit conversions api",
    "reddit ads tracking",
    "reddit server side tracking",
    "reddit pixel shopify",
  ],
  alternates: { canonical: "/reddit-tracking" },
};

export default function RedditTrackingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Nav */}
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 font-mono text-sm font-bold tracking-widest text-foreground">
            <img src="/logo.png" alt="" width={22} height={22} className="w-[22px] h-[22px]" /><span className="text-cyan-500">TRACK</span> {"// "}CLEAR
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
        {/* Hero */}
        <section className="border-b border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-medium uppercase tracking-widest text-brand-500/80">
                Reddit Conversions API
              </p>
              <h1 className="font-display mt-4 text-4xl font-bold leading-tight tracking-wider text-foreground sm:text-5xl">
                Server-side Reddit tracking for Shopify
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
                Ad blockers silently drop Reddit Pixel events before they reach Reddit Ads.
                Track Clear captures the rdt_cid click ID and forwards conversion data
                server-to-server via the Reddit Conversions API, bypassing every blocker.
              </p>
              <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <Button variant="brand" size="lg" asChild className="gap-2">
                  <Link href="/signup">
                    Start Free
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Why Reddit CAPI */}
        <section className="border-b border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
            <h2 className="mb-12 text-center text-2xl font-bold tracking-wider text-foreground sm:text-3xl">
              Why you need the Reddit Conversions API
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card className="border-white/[0.06] bg-white/[0.02] shadow-none">
                <CardContent className="p-6">
                  <Target className="mb-4 h-5 w-5 text-brand-500" />
                  <h3 className="mb-2 text-sm font-semibold text-foreground">rdt_cid attribution capture</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Our snippet captures the rdt_cid click ID from URL parameters on landing and
                    passes it with every conversion event, giving Reddit full click-to-purchase
                    attribution even when the browser pixel is blocked.
                  </p>
                </CardContent>
              </Card>
              <Card className="border-white/[0.06] bg-white/[0.02] shadow-none">
                <CardContent className="p-6">
                  <Shield className="mb-4 h-5 w-5 text-brand-500" />
                  <h3 className="mb-2 text-sm font-semibold text-foreground">Bypass ad blockers</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Requests to alb.reddit.com are blocked by most major ad blockers. Server-side
                    events route through your own domain and are invisible to browser extensions
                    and privacy tools.
                  </p>
                </CardContent>
              </Card>
              <Card className="border-white/[0.06] bg-white/[0.02] shadow-none">
                <CardContent className="p-6">
                  <Zap className="mb-4 h-5 w-5 text-brand-500" />
                  <h3 className="mb-2 text-sm font-semibold text-foreground">Better Reddit ad optimization</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    More conversion signals mean Reddit&apos;s algorithm can optimize your campaigns
                    toward real buyers. Recover lost purchase events and lower your cost per
                    acquisition on Reddit Ads.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-b border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
            <h2 className="mb-12 text-center text-2xl font-bold tracking-wider text-foreground sm:text-3xl">
              How Track Clear works with Reddit Conversions API
            </h2>
            <div className="mx-auto max-w-2xl space-y-8">
              {[
                {
                  step: "1",
                  title: "Paste our snippet into Shopify Custom Pixel",
                  desc: "One JavaScript snippet hooks into Shopify&apos;s analytics.subscribe() API. No theme changes or app installs required.",
                },
                {
                  step: "2",
                  title: "rdt_cid and event data are captured",
                  desc: "The snippet reads the rdt_cid click ID from the landing page URL and captures it alongside browser context, user data, and revenue amounts on every event.",
                },
                {
                  step: "3",
                  title: "We forward to Reddit CAPI server-to-server",
                  desc: "Events are sent to our servers, PII is hashed with SHA-256, and we POST to the Reddit Conversions API with the captured rdt_cid for accurate attribution.",
                },
                {
                  step: "4",
                  title: "Reddit matches clicks to conversions",
                  desc: "Reddit uses the rdt_cid to tie your ad clicks directly to purchases and other conversion events, giving you accurate ROAS data in your Reddit Ads dashboard.",
                },
              ].map((item) => (
                <div key={item.step} className="flex gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-brand-500/20 bg-brand-500/10 text-sm font-bold text-brand-500">
                    {item.step}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Supported events */}
        <section className="border-b border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
            <h2 className="mb-4 text-center text-2xl font-bold tracking-wider text-foreground sm:text-3xl">
              All 5 standard events supported
            </h2>
            <p className="mx-auto mb-12 max-w-lg text-center text-sm text-muted-foreground">
              Every Shopify funnel event is captured and forwarded to Reddit with full custom data.
            </p>
            <div className="mx-auto max-w-md space-y-3">
              {[
                { event: "PageView", desc: "Every page load on your store" },
                { event: "ViewContent", desc: "Product page views with product data" },
                { event: "AddToCart", desc: "Cart additions with SKU and quantity" },
                { event: "InitiateCheckout", desc: "Checkout starts with cart value" },
                { event: "Purchase", desc: "Completed orders with revenue and order ID" },
              ].map((item) => (
                <div
                  key={item.event}
                  className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3"
                >
                  <Check className="h-4 w-4 shrink-0 text-brand-500" />
                  <div>
                    <span className="text-sm font-medium text-foreground">{item.event}</span>
                    <span className="ml-2 text-sm text-muted-foreground">{item.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section>
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
            <div className="mx-auto max-w-lg text-center">
              <h2 className="text-3xl font-bold tracking-wider text-foreground sm:text-4xl">
                Set up Reddit CAPI in 10 minutes
              </h2>
              <p className="mt-4 text-sm text-muted-foreground">
                Free plan includes 50 orders/month. No credit card required.
              </p>
              <Button variant="brand" size="lg" asChild className="mt-8 gap-2">
                <Link href="/signup">
                  Get Started Free
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8">
          <span className="flex items-center gap-2 font-mono text-sm font-bold tracking-widest text-foreground">
            <img src="/logo.png" alt="" width={22} height={22} className="w-[22px] h-[22px]" /><span className="text-cyan-500">TRACK</span> {"// "}CLEAR
          </span>
          <span className="text-xs text-muted-foreground/40">
            &copy; {new Date().getFullYear()} Track Clear
          </span>
        </div>
      </footer>
    </div>
  );
}
