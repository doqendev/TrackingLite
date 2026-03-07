import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Check, X, Minus } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Track Clear vs Elevar - Shopify Server-Side Tracking Comparison",
  description:
    "Compare Track Clear and Elevar for Shopify server-side tracking. See pricing, features, setup time, and platform support side by side.",
  keywords: [
    "elevar alternative",
    "elevar vs track clear",
    "elevar pricing",
    "elevar shopify tracking",
    "elevar competitor",
    "server side tracking shopify comparison",
  ],
  alternates: { canonical: "/vs/elevar" },
};

export default function VsElevarPage() {
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
                Track Clear vs Elevar
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
                Both tools solve the same problem: recovering conversion data lost to ad blockers
                and privacy restrictions. Here is how they compare.
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
                    <th className="px-6 py-4 text-center font-medium text-muted-foreground">Elevar</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { feature: "Setup time", tc: "10 minutes", el: "30-60 minutes", type: "text" },
                    { feature: "Shopify app install required", tc: false, el: true, type: "bool-invert" },
                    { feature: "Theme code changes", tc: false, el: true, type: "bool-invert" },
                    { feature: "Meta CAPI", tc: true, el: true, type: "bool" },
                    { feature: "TikTok Events API", tc: true, el: true, type: "bool" },
                    { feature: "GA4 Measurement Protocol", tc: true, el: true, type: "bool" },
                    { feature: "Klaviyo server-side", tc: true, el: true, type: "bool" },
                    { feature: "Reddit Conversions API", tc: true, el: false, type: "bool" },
                    { feature: "Pinterest Conversions API", tc: true, el: false, type: "bool" },
                    { feature: "Free plan", tc: "50 orders/mo", el: "None", type: "text" },
                    { feature: "Starting price", tc: "$29/mo", el: "$150/mo", type: "text" },
                    { feature: "PII hashing (SHA-256)", tc: true, el: true, type: "bool" },
                    { feature: "Event deduplication", tc: true, el: true, type: "bool" },
                    { feature: "Real-time dashboard", tc: true, el: true, type: "bool" },
                    { feature: "Consent mode support", tc: true, el: true, type: "bool" },
                    { feature: "Email alerts", tc: true, el: false, type: "bool" },
                    { feature: "Event replay (retry failed)", tc: true, el: false, type: "bool" },
                    { feature: "Multi-language dashboard", tc: "6 languages", el: "English only", type: "text" },
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
                          row.el ? <Check className="mx-auto h-4 w-4 text-brand-500" /> : <X className="mx-auto h-4 w-4 text-red-400" />
                        ) : row.type === "bool-invert" ? (
                          row.el ? <X className="mx-auto h-4 w-4 text-red-400" /> : <Check className="mx-auto h-4 w-4 text-brand-500" />
                        ) : (
                          <span className="text-muted-foreground">{row.el as string}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Why Track Clear */}
        <section className="border-b border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
            <h2 className="mb-12 text-center text-2xl font-bold tracking-wider text-foreground">
              Why merchants choose Track Clear
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card className="border-white/[0.06] bg-white/[0.02] shadow-none">
                <CardContent className="p-6">
                  <h3 className="mb-2 text-sm font-semibold text-foreground">5x lower starting price</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Track Clear starts at $29/mo with a free plan. Elevar starts at $150/mo with no free tier.
                    Same server-side tracking, fraction of the cost.
                  </p>
                </CardContent>
              </Card>
              <Card className="border-white/[0.06] bg-white/[0.02] shadow-none">
                <CardContent className="p-6">
                  <h3 className="mb-2 text-sm font-semibold text-foreground">No app install or theme changes</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Track Clear uses a single snippet in Shopify Custom Pixel. No Shopify app, no theme code edits,
                    no developer needed. Setup in 10 minutes.
                  </p>
                </CardContent>
              </Card>
              <Card className="border-white/[0.06] bg-white/[0.02] shadow-none">
                <CardContent className="p-6">
                  <h3 className="mb-2 text-sm font-semibold text-foreground">More platforms included</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Track Clear supports Reddit and Pinterest out of the box.
                    Forward events to 6 platforms from a single integration.
                  </p>
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
                50 orders/month on the free plan. No credit card required. Set up in 10 minutes.
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
