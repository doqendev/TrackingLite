import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/events",
          "/settings",
          "/billing",
          "/onboarding",
          "/integrations",
          "/api/",
          "/login",
          "/signup",
          "/forgot-password",
          "/reset-password",
        ],
      },
    ],
    sitemap: "https://trackclear.io/sitemap.xml",
  };
}
