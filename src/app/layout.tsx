import type { Metadata } from "next";
import { Space_Mono, Chakra_Petch } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-mono",
});

const chakraPetch = Chakra_Petch({
  weight: ["400", "600", "700"],
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: {
    default: "Track Clear - Server-Side Tracking for Shopify",
    template: "%s | Track Clear",
  },
  description:
    "Server-side purchase tracking for Shopify. Forward conversions to Meta and TikTok with webhook-backed reliability.",
  keywords: [
    "shopify server side tracking",
    "meta conversions api",
    "shopify capi",
    "server side tracking shopify",
    "facebook pixel alternative",
    "tiktok tracking shopify",
    "shopify conversion tracking",
    "ios 14 tracking fix",
    "ad blocker bypass tracking",
  ],
  metadataBase: new URL("https://trackclear.io"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://trackclear.io",
    siteName: "Track Clear",
    title: "Track Clear - Server-Side Tracking for Shopify",
    description:
      "Server-side purchase tracking for Shopify. Forward conversions to Meta and TikTok with webhook-backed reliability.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Track Clear - Server-Side Tracking for Shopify",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Track Clear - Server-Side Tracking for Shopify",
    description:
      "Server-side purchase tracking for Shopify. Forward conversions to Meta and TikTok.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let locale = "en";
  let messages = {};
  try {
    locale = await getLocale();
    messages = await getMessages();
  } catch (error) {
    process.stderr.write(`[ROOT_LAYOUT] i18n failed: ${error instanceof Error ? error.message : String(error)}\n`);
  }

  return (
    <html lang={locale} className="dark" suppressHydrationWarning>
      <body className={`${spaceMono.variable} ${chakraPetch.variable} font-mono antialiased`}>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
        <Toaster />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
