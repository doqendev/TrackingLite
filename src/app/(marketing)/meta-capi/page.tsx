import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Check, Shield, Zap, Lock } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Meta Conversions API for Shopify - Server-Side Tracking",
  description:
    "Set up Meta Conversions API (Facebook CAPI) for your Shopify store in 10 minutes. Bypass ad blockers, improve attribution, and recover 20-40% of lost conversions.",
  keywords: [
    "meta conversions api shopify",
    "facebook capi shopify",
    "meta server side tracking",
    "facebook pixel server side",
    "shopify meta capi setup",
    "facebook conversions api",
  ],
  alternates: { canonical: "/meta-capi" },
};

export default function MetaCapiPage() {
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
                Meta Conversions API
              </p>
              <h1 className="font-display mt-4 text-4xl font-bold leading-tight tracking-wider text-foreground sm:text-5xl">
                Server-side Meta tracking for Shopify
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
                Ad blockers and iOS 14+ privacy changes silently drop 20-40% of your Meta pixel events.
                Track Clear sends conversion data server-to-server via the Meta Conversions API,
                bypassing every blocker.
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

        {/* Why CAPI */}
        <section className="border-b border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
            <h2 className="mb-12 text-center text-2xl font-bold tracking-wider text-foreground sm:text-3xl">
              Why you need the Meta Conversions API
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card className="border-white/[0.06] bg-white/[0.02] shadow-none">
                <CardContent className="p-6">
                  <Shield className="mb-4 h-5 w-5 text-brand-500" />
                  <h3 className="mb-2 text-sm font-semibold text-foreground">Bypass ad blockers</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    ~30% of desktop users block requests to connect.facebook.net. Server-side events
                    route through your own domain and are invisible to blockers.
                  </p>
                </CardContent>
              </Card>
              <Card className="border-white/[0.06] bg-white/[0.02] shadow-none">
                <CardContent className="p-6">
                  <Zap className="mb-4 h-5 w-5 text-brand-500" />
                  <h3 className="mb-2 text-sm font-semibold text-foreground">Better attribution</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    CAPI events include hashed PII (email, phone) which Meta uses for cross-device
                    matching. Higher Event Match Quality means better ad targeting and lower CPAs.
                  </p>
                </CardContent>
              </Card>
              <Card className="border-white/[0.06] bg-white/[0.02] shadow-none">
                <CardContent className="p-6">
                  <Lock className="mb-4 h-5 w-5 text-brand-500" />
                  <h3 className="mb-2 text-sm font-semibold text-foreground">iOS 14+ compliant</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Apple ATT and Safari ITP limit cookie lifetimes and suppress tracking signals.
                    Server-side events are unaffected by browser-level privacy restrictions.
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
              How Track Clear works with Meta CAPI
            </h2>
            <div className="mx-auto max-w-2xl space-y-8">
              {[
                { step: "1", title: "Paste our snippet into Shopify Custom Pixel", desc: "One JavaScript snippet hooks into Shopify's analytics.subscribe() API. No theme changes or app installs." },
                { step: "2", title: "Events are captured with full context", desc: "The snippet captures browser cookies (_fbp, _fbc), user agent, IP address, and event data including revenue amounts." },
                { step: "3", title: "We forward to Meta CAPI server-to-server", desc: "Your events are sent to our servers, PII is hashed with SHA-256, and we POST to Meta's Conversions API with the same event_id for deduplication." },
                { step: "4", title: "Meta deduplicates automatically", desc: "If you also have the Meta browser pixel, Meta matches events by event_id and deduplicates. You get the best of both channels." },
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
              Every Shopify funnel event is captured and forwarded with full custom data.
            </p>
            <div className="mx-auto max-w-md space-y-3">
              {[
                { event: "PageView", desc: "Every page load on your store" },
                { event: "ViewContent", desc: "Product page views with product data" },
                { event: "AddToCart", desc: "Cart additions with SKU and quantity" },
                { event: "InitiateCheckout", desc: "Checkout starts with cart value" },
                { event: "Purchase", desc: "Completed orders with revenue and order ID" },
              ].map((item) => (
                <div key={item.event} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
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
                Set up Meta CAPI in 10 minutes
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
