import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Check, X } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Track Clear vs Triple Whale - Shopify Tracking Comparison",
  description:
    "Compare Track Clear and Triple Whale for Shopify conversion tracking. See pricing, features, and setup differences side by side.",
  keywords: [
    "triple whale alternative",
    "triple whale vs track clear",
    "triple whale pricing",
    "triple whale shopify",
    "triple whale competitor",
    "shopify attribution tool comparison",
  ],
  alternates: { canonical: "/vs/triple-whale" },
};

export default function VsTripleWhalePage() {
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
                Comparison
              </p>
              <h1 className="font-display mt-4 text-4xl font-bold leading-tight tracking-wider text-foreground sm:text-5xl">
                Track Clear vs Triple Whale
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
                Triple Whale is a full analytics and attribution platform. Track Clear is focused on
                one thing: getting your conversion events to ad platforms server-side, reliably and affordably.
              </p>
            </div>
          </div>
        </section>

        {/* Comparison Table */}
        <section className="border-b border-white/[0.06]">
          <div className="mx-auto max-w-4xl px-6 py-24 sm:py-28">
            <h2 className="mb-12 text-center text-2xl font-bold tracking-wider text-foreground">
              Feature comparison
            </h2>
            <div className="overflow-hidden rounded-lg border border-white/[0.06]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                    <th className="px-6 py-4 text-left font-medium text-muted-foreground">Feature</th>
                    <th className="px-6 py-4 text-center font-semibold text-brand-500">Track Clear</th>
                    <th className="px-6 py-4 text-center font-medium text-muted-foreground">Triple Whale</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { feature: "Primary focus", tc: "Server-side tracking", tw: "Analytics & attribution", type: "text" },
                    { feature: "Setup time", tc: "10 minutes", tw: "30+ minutes", type: "text" },
                    { feature: "Shopify app required", tc: false, tw: true, type: "bool-invert" },
                    { feature: "Meta CAPI", tc: true, tw: true, type: "bool" },
                    { feature: "TikTok Events API", tc: true, tw: true, type: "bool" },
                    { feature: "GA4 server-side", tc: true, tw: true, type: "bool" },
                    { feature: "Klaviyo server-side", tc: true, tw: false, type: "bool" },
                    { feature: "Reddit Conversions API", tc: true, tw: false, type: "bool" },
                    { feature: "Pinterest Conversions API", tc: true, tw: false, type: "bool" },
                    { feature: "Free plan", tc: "50 orders/mo", tw: "None", type: "text" },
                    { feature: "Starting price", tc: "$29/mo", tw: "$100/mo", type: "text" },
                    { feature: "Attribution modeling", tc: false, tw: true, type: "bool" },
                    { feature: "Creative analytics", tc: false, tw: true, type: "bool" },
                    { feature: "Event deduplication", tc: true, tw: true, type: "bool" },
                    { feature: "PII hashing", tc: true, tw: true, type: "bool" },
                    { feature: "Email alerts", tc: true, tw: false, type: "bool" },
                    { feature: "Event replay", tc: true, tw: false, type: "bool" },
                    { feature: "Consent mode", tc: true, tw: true, type: "bool" },
                  ].map((row, i) => (
                    <tr key={row.feature} className={i % 2 === 0 ? "bg-white/[0.01]" : ""}>
                      <td className="px-6 py-3 text-foreground">{row.feature}</td>
                      <td className="px-6 py-3 text-center">
                        {row.type === "bool" ? (
                          row.tc ? <Check className="mx-auto h-4 w-4 text-brand-500" /> : <X className="mx-auto h-4 w-4 text-red-400" />
                        ) : row.type === "bool-invert" ? (
                          row.tc ? <X className="mx-auto h-4 w-4 text-red-400" /> : <Check className="mx-auto h-4 w-4 text-brand-500" />
                        ) : (
                          <span className="font-medium text-foreground">{row.tc as string}</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-center">
                        {row.type === "bool" ? (
                          row.tw ? <Check className="mx-auto h-4 w-4 text-brand-500" /> : <X className="mx-auto h-4 w-4 text-red-400" />
                        ) : row.type === "bool-invert" ? (
                          row.tw ? <X className="mx-auto h-4 w-4 text-red-400" /> : <Check className="mx-auto h-4 w-4 text-brand-500" />
                        ) : (
                          <span className="text-muted-foreground">{row.tw as string}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-6 text-center text-xs text-muted-foreground/50">
              Triple Whale offers advanced attribution modeling and creative analytics that Track Clear does not.
              Track Clear focuses on reliable server-side event forwarding at a lower price point.
            </p>
          </div>
        </section>

        {/* When to choose */}
        <section className="border-b border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
            <h2 className="mb-12 text-center text-2xl font-bold tracking-wider text-foreground">
              Which one is right for you?
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Card className="border-brand-500/20 bg-brand-500/[0.02] shadow-none">
                <CardContent className="p-6">
                  <h3 className="mb-3 text-sm font-semibold text-brand-500">Choose Track Clear if you:</h3>
                  <ul className="space-y-2">
                    {[
                      "Want reliable server-side tracking without complexity",
                      "Need to send events to 6 platforms from one integration",
                      "Are cost-conscious ($29/mo vs $100+/mo)",
                      "Prefer a 10-minute setup with no app installs",
                      "Need Reddit and Pinterest tracking",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <Card className="border-white/[0.06] bg-white/[0.02] shadow-none">
                <CardContent className="p-6">
                  <h3 className="mb-3 text-sm font-semibold text-foreground">Choose Triple Whale if you:</h3>
                  <ul className="space-y-2">
                    {[
                      "Need advanced multi-touch attribution modeling",
                      "Want creative performance analytics",
                      "Need a unified analytics dashboard across channels",
                      "Have budget for $100+/mo tooling",
                      "Want AI-powered ad recommendations",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section>
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
            <div className="mx-auto max-w-lg text-center">
              <h2 className="text-3xl font-bold tracking-wider text-foreground sm:text-4xl">
                Try Track Clear free
              </h2>
              <p className="mt-4 text-sm text-muted-foreground">
                50 orders/month on the free plan. No credit card required.
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
