import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Check, Users, ShoppingCart, Mail } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Klaviyo Server-Side Tracking for Shopify",
  description:
    "Send Shopify ecommerce events to Klaviyo server-side. Capture browsing behavior for better email segmentation and abandoned cart flows.",
  keywords: [
    "klaviyo tracking shopify",
    "klaviyo server side",
    "klaviyo events api",
    "shopify klaviyo tracking",
    "klaviyo ecommerce events",
  ],
  alternates: { canonical: "/klaviyo-tracking" },
};

export default function KlaviyoTrackingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Nav */}
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="text-sm font-semibold tracking-tight text-foreground">
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
        {/* Hero */}
        <section className="border-b border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-medium uppercase tracking-widest text-brand-500/80">
                Klaviyo Events API
              </p>
              <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tighter text-foreground sm:text-5xl">
                Server-side Klaviyo tracking for Shopify
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
                Klaviyo&apos;s browser-side tracking misses events from users with ad blockers or
                privacy tools. Track Clear sends every Shopify event to Klaviyo server-side,
                enriching customer profiles and keeping your email and SMS flows fully triggered.
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

        {/* Why server-side Klaviyo */}
        <section className="border-b border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
            <h2 className="mb-12 text-center text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Why server-side Klaviyo tracking matters
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card className="border-white/[0.06] bg-white/[0.02] shadow-none">
                <CardContent className="p-6">
                  <Users className="mb-4 h-5 w-5 text-brand-500" />
                  <h3 className="mb-2 text-sm font-semibold text-foreground">Richer customer profiles</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Browsing and cart activity flows into Klaviyo profiles in real time. Segment
                    by product viewed, category interest, or cart value for more targeted email
                    and SMS campaigns with higher conversion rates.
                  </p>
                </CardContent>
              </Card>
              <Card className="border-white/[0.06] bg-white/[0.02] shadow-none">
                <CardContent className="p-6">
                  <ShoppingCart className="mb-4 h-5 w-5 text-brand-500" />
                  <h3 className="mb-2 text-sm font-semibold text-foreground">Abandoned cart recovery</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Server-side delivery ensures Klaviyo sees every AddToCart and InitiateCheckout
                    event, even from users with ad blockers. Your abandoned cart and checkout
                    abandonment flows trigger reliably for every shopper.
                  </p>
                </CardContent>
              </Card>
              <Card className="border-white/[0.06] bg-white/[0.02] shadow-none">
                <CardContent className="p-6">
                  <Mail className="mb-4 h-5 w-5 text-brand-500" />
                  <h3 className="mb-2 text-sm font-semibold text-foreground">Complete purchase data</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Every Purchase event flows to Klaviyo with order ID, revenue, and product
                    details. Post-purchase flows, win-back sequences, and revenue attribution
                    all stay accurate with no missed orders.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-b border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
            <h2 className="mb-12 text-center text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              How Track Clear works with Klaviyo
            </h2>
            <div className="mx-auto max-w-2xl space-y-8">
              {[
                {
                  step: "1",
                  title: "Paste our snippet into Shopify Custom Pixel",
                  desc: "One JavaScript snippet hooks into Shopify's analytics.subscribe() API. No theme changes, no app installs, no developer needed.",
                },
                {
                  step: "2",
                  title: "Events are captured with full customer context",
                  desc: "The snippet captures the customer's email address (collected at checkout), event name, product data, and revenue amounts on every Shopify event.",
                },
                {
                  step: "3",
                  title: "We forward to Klaviyo Events API server-to-server",
                  desc: "Events are sent to our servers and POSTed to the Klaviyo Events API using the customer's raw email address for profile matching. Klaviyo requires unhashed email, unlike ad platforms.",
                },
                {
                  step: "4",
                  title: "Klaviyo profiles update and flows trigger",
                  desc: "Customer profiles are enriched with browsing and purchase history. Flows like abandoned cart, post-purchase, and win-back trigger immediately from the server-side event.",
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
            <h2 className="mb-4 text-center text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              All 5 standard events supported
            </h2>
            <p className="mx-auto mb-12 max-w-lg text-center text-sm text-muted-foreground">
              Every Shopify funnel event is captured and forwarded to Klaviyo for profile enrichment and flow triggering.
            </p>
            <div className="mx-auto max-w-md space-y-3">
              {[
                { event: "PageView", desc: "Every page load on your store" },
                { event: "ViewContent", desc: "Product page views with product data" },
                { event: "AddToCart", desc: "Triggers abandoned cart flows with SKU and quantity" },
                { event: "InitiateCheckout", desc: "Triggers checkout abandonment flows with cart value" },
                { event: "Purchase", desc: "Completed orders for post-purchase flows and revenue attribution" },
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
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Set up Klaviyo server-side tracking in 10 minutes
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
          <span className="text-sm font-semibold tracking-tight text-foreground">
            <span className="text-brand-500">Track</span>&thinsp;Clear
          </span>
          <span className="text-xs text-muted-foreground/40">
            &copy; {new Date().getFullYear()} Track Clear
          </span>
        </div>
      </footer>
    </div>
  );
}
