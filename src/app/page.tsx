import type { Metadata } from "next";
import Link from "next/link";
import { IntegrationCard } from "@/components/landing/integration-card";
import { ProblemCard } from "@/components/landing/problem-card";
import { FeatureBlock } from "@/components/landing/feature-block";
import { PipelineVisual } from "@/components/landing/pipeline-visual";
import { LiveClock } from "@/components/landing/live-clock";
import { PricingSection } from "@/components/landing/pricing-section";
import "./landing.css";

export const metadata: Metadata = {
  title: "Track Clear - Server-Side Tracking for Shopify",
  description:
    "Fix your tracking in 10 minutes. Bypass ad blockers with server-side event forwarding to Meta, TikTok, GA4, Klaviyo, Reddit, Pinterest, and Google Ads.",
};

const integrations = [
  {
    file: "CAPI.EXE",
    platform: "META",
    title: "Meta CAPI",
    description:
      "Send purchase data directly to Meta, even when ad blockers or iOS privacy block your pixel.",
  },
  {
    file: "TT_EVENTS.SH",
    platform: "TIKTOK",
    title: "TikTok Events API",
    description:
      "Every sale and add-to-cart reaches TikTok's ad algorithm, so your campaigns optimize faster.",
  },
  {
    file: "GA4_MP.JS",
    platform: "GA4",
    title: "GA4 Measurement Protocol",
    description:
      "Get complete Google Analytics data without relying on browser scripts that get blocked.",
  },
  {
    file: "KL_FLOW.JS",
    platform: "KLAVIYO",
    title: "Klaviyo",
    description:
      "Trigger Klaviyo flows from real purchase events. Better segmentation, better email timing.",
  },
  {
    file: "RED_PIXEL.LOG",
    platform: "REDDIT",
    title: "Reddit Conversions API",
    description:
      "Track which Reddit ads actually drive purchases, even when users browse with ad blockers.",
  },
  {
    file: "PIN_TAG.DLL",
    platform: "PINTEREST",
    title: "Pinterest Conversions API",
    description:
      "Send checkout and purchase data to Pinterest so your promoted pins reach the right shoppers.",
  },
  {
    file: "G_ADS.BAT",
    platform: "GOOGLE_ADS",
    title: "Google Ads",
    description:
      "Feed accurate conversion data to Google Ads for smarter bidding and better return on ad spend.",
  },
];

const problems = [
  {
    threatId: "THREAT_001.SYS",
    severity: "CRITICAL",
    title: "Ad Blockers",
    description:
      "20-40% of your customers use ad blockers. When they buy something, Meta and TikTok never find out -- so your ads can't optimize for people like them.",
  },
  {
    threatId: "THREAT_002.SYS",
    severity: "HIGH",
    title: "iOS & Safari Limits",
    description:
      "Apple's privacy changes block tracking on iPhones and Safari. Your retargeting audiences shrink every day, and you can't tell which ads actually drove the sale.",
  },
  {
    threatId: "THREAT_003.SYS",
    severity: "HIGH",
    title: "Wasted Ad Spend",
    description:
      "When your ad platforms can't see your sales, they keep spending on the wrong audiences. You're paying for clicks that never get connected back to real revenue.",
  },
];

const stats = [
  { value: "7", label: "Ad Platforms" },
  { value: "99.7%", label: "Delivery Rate" },
  { value: "$0", label: "To Start" },
  { value: "10min", label: "Setup" },
];

export default function HomePage() {
  return (
    <div className="pixel-null-page">
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

      <div className="pn-grid-bg" />

      <div className="pn-wrapper">
        {/* 1. Navigation */}
        <nav className="pn-nav-bar">
          <Link href="/" className="pn-brand" style={{ textDecoration: "none", color: "inherit" }}>
            TRACK {"// "}CLEAR{" "}
            <span className="pn-bracket-box">V.1.0</span>
          </Link>
          <div className="pn-nav-links">
            <a href="#features">[ FEATURES ]</a>
            <a href="#pricing">[ PRICING ]</a>
            <Link href="/login">[ LOGIN ]</Link>
          </div>
        </nav>

        {/* 2. Hero */}
        <section className="pn-hero">
          <div className="pn-hero-content">
            <div className="pn-crosshair pn-ch-tl" />
            <div className="pn-crosshair pn-ch-br" />

            <span className="pn-sys-code">
              S://TRACKCLEAR {"// "}FIX_YOUR_ADS
            </span>

            <h1>
              Your Ads
              <br />
              <span className="pn-accent">Are Missing</span>
              <br />
              <span className="pn-outline">40% of Sales</span>
            </h1>

            <div className="pn-hero-sub">
              <p>
                Ad blockers hide your real sales from Meta, TikTok, and Google.
                Track Clear sends every purchase directly from your store to all
                7 ad platforms -- so your ads finally know what&apos;s working.
              </p>
            </div>

            <Link href="/signup" className="pn-btn">
              Fix My Ads for Free
            </Link>
          </div>

          <div className="pn-hero-visual">
            <div className="pn-dither-overlay" />
            <PipelineVisual />
          </div>
        </section>

        {/* 3. Social Proof */}
        <div className="pn-social-proof">
          TRUSTED BY 200+ SHOPIFY STORES WORLDWIDE
        </div>

        {/* 4. Stats Strip */}
        <div className="pn-feature-strip">
          {stats.map((stat) => (
            <div key={stat.label} className="pn-stat-box">
              <div className="pn-stat-val">{stat.value}</div>
              <div className="pn-stat-label">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* 5. Problem Section */}
        <div className="pn-section-header">
          <div>
            <span className="pn-ref-label">
              * TRACKING_ISSUES {"// "}YOUR_STORE
            </span>
            <h2 className="pn-section-title">Why Your Ads Underperform</h2>
          </div>
          <div
            className="pn-dim"
            style={{ fontSize: 12, textAlign: "right" }}
          >
            STATUS: FIXABLE
            <br />
            ISSUES: 03
          </div>
        </div>

        <div className="pn-integrations">
          {problems.map((item) => (
            <ProblemCard key={item.threatId} {...item} />
          ))}
        </div>

        {/* 6. Features */}
        <div className="pn-section-header" id="features">
          <div>
            <span className="pn-ref-label">
              * HOW_IT_WORKS {"// "}TRACK_CLEAR
            </span>
            <h2 className="pn-section-title">How It Works</h2>
          </div>
        </div>

        <FeatureBlock
          refCode="STEP_01 // CAPTURE"
          title="Never Miss"
          titleAccent="A Sale"
          description="A small code snippet in your Shopify store captures every page view, add to cart, and purchase -- even when customers use ad blockers."
          bullets={[
            "Tracks all 5 key shopping events automatically",
            "Works even when ad blockers are active",
            "No double-counting -- smart deduplication built in",
          ]}
          visual={
            <div className="pn-terminal">
              <div className="pn-terminal-header">{"// event_capture.log"}</div>
              POST /api/events/ingest<br />
              X-TL-API-Key: tl_****<br />
              eventName: &quot;Purchase&quot;<br />
              eventId: &quot;a1b2c3d4-...&quot;<br />
              value: 127.50<br />
              <br />
              <span className="pn-accent">&gt; STATUS: FORWARDED_7x</span>
            </div>
          }
        />

        <FeatureBlock
          refCode="STEP_02 // CONNECT"
          title="One Setup,"
          titleAccent="All Your Ad Platforms"
          description="Connect once and your sales data flows to every ad platform you use. Meta, TikTok, Google -- all getting the same accurate data at the same time."
          bullets={[
            "Meta, TikTok, GA4, Klaviyo, Reddit, Pinterest, Google Ads",
            "Your credentials are encrypted and stored securely",
            "Automatic retries if a platform is temporarily down",
          ]}
          reverse
          visual={
            <div className="pn-terminal">
              <div className="pn-terminal-header">{"// fan_out.log"}</div>
              INGEST &gt; eventId: a1b2c3d4<br />
              &gt; META ........... SENT<br />
              &gt; TIKTOK ......... SENT<br />
              &gt; GA4 ............ SENT<br />
              &gt; KLAVIYO ........ SENT<br />
              &gt; REDDIT ......... SENT<br />
              &gt; PINTEREST ...... SENT<br />
              &gt; GOOGLE_ADS ..... SENT<br />
              <br />
              <span className="pn-accent">&gt; 7/7 DELIVERED</span>
            </div>
          }
        />

        <FeatureBlock
          refCode="STEP_03 // MONITOR"
          title="See Everything"
          titleAccent="In Real Time"
          description="A real-time dashboard shows exactly which events are being delivered, how much revenue is tracked, and which campaigns are performing best."
          bullets={[
            "Delivery status for every platform at a glance",
            "Revenue tracking in your preferred currency",
            "See which campaigns actually drive sales",
          ]}
          visual={
            <div className="pn-terminal">
              <div className="pn-terminal-header">{"// dashboard_stats.log"}</div>
              EVENTS_24H: 12,847<br />
              DELIVERY_RATE: 99.7%<br />
              REVENUE_30D: $48,291.00<br />
              TOP_CAMPAIGN: &quot;summer_sale&quot;<br />
              DESTINATIONS: 7/7 ONLINE<br />
              <br />
              <span className="pn-accent">&gt; ALL SYSTEMS NOMINAL</span>
            </div>
          }
        />

        {/* 7. Connection Matrix */}
        <div className="pn-section-header">
          <div>
            <span className="pn-ref-label">
              * SYSTEM_INTEGRATIONS {"// "}API_V3
            </span>
            <h2 className="pn-section-title">Supported Platforms</h2>
          </div>
          <div
            className="pn-dim"
            style={{ fontSize: 12, textAlign: "right" }}
          >
            STATUS: READY
            <br />
            PLATFORMS: 07
          </div>
        </div>

        <div className="pn-integrations">
          {integrations.map((item) => (
            <IntegrationCard key={item.platform} {...item} />
          ))}
        </div>

        {/* 8. Pricing */}
        <PricingSection />

        {/* 9. Final CTA */}
        <section className="pn-cta-section">
          <div className="pn-crosshair pn-ch-tl" />
          <div className="pn-crosshair pn-ch-br" />

          <span className="pn-sys-code">
            * READY {"// "}START_NOW
          </span>

          <h2 className="pn-section-title" style={{ fontSize: "2.5rem", marginBottom: 16 }}>
            Fix Your <span className="pn-accent">Ad Tracking</span>
          </h2>

          <p className="pn-dim" style={{ marginBottom: 32 }}>
            Free forever up to 50 orders/month. No credit card required. Set up in 10 minutes.
          </p>

          <Link href="/signup" className="pn-btn">
            Get Started Free
          </Link>
        </section>

        {/* 10. Footer */}
        <footer className="pn-footer">
          <div>
            TRACK {"// "}CLEAR &copy; 2026
            <br />
            <span className="pn-accent">PROTOCOL: SERVER_SIDE_TRACKING</span>
            <div className="pn-footer-links">
              <Link href="/privacy">[ PRIVACY ]</Link>
              <Link href="/terms">[ TERMS ]</Link>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            SERVER_TIME: <LiveClock /> UTC
            <br />
            REGION: GLOBAL_EDGE
          </div>
        </footer>
      </div>
    </div>
  );
}
