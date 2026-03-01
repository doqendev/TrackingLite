import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: "standalone" is only needed for Railway (Docker). Vercel uses its own build output.
  // For Railway builds, Dockerfile sets STANDALONE=true before `next build`.
  ...(process.env.STANDALONE === "true" ? { output: "standalone" } : {}),
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https:",
            "font-src 'self' data:",
            "connect-src 'self' https://api.stripe.com https://graph.facebook.com https://business-api.tiktok.com https://www.google-analytics.com https://a.klaviyo.com https://ads-api.reddit.com https://api.pinterest.com https://api.frankfurter.app",
            "frame-src 'self' https://js.stripe.com",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
          ].join("; "),
        },
      ],
    }];
  },
};

export default withNextIntl(nextConfig);
