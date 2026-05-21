import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "Track Clear - Server-Side Tracking for Shopify";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #0a0f1a 0%, #0d1520 50%, #0a1028 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
        }}
      >
        {/* Subtle gradient overlay */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "radial-gradient(ellipse at 50% 30%, rgba(6,182,212,0.15) 0%, transparent 60%)",
            display: "flex",
          }}
        />

        {/* Content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1,
            padding: "40px 80px",
            textAlign: "center",
          }}
        >
          {/* Logo */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              marginBottom: "40px",
              fontSize: "28px",
              fontWeight: 700,
              letterSpacing: "0.15em",
              textTransform: "uppercase" as const,
            }}
          >
            <span style={{ color: "#06b6d4" }}>TRACK</span>
            <span style={{ color: "#e5e7eb" }}>{" // "}CLEAR</span>
          </div>

          {/* Headline */}
          <div
            style={{
              fontSize: "52px",
              fontWeight: 800,
              color: "#f3f4f6",
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              marginBottom: "24px",
              maxWidth: "900px",
            }}
          >
            Server-Side Tracking for Shopify
          </div>

          {/* Subheadline */}
          <div
            style={{
              fontSize: "22px",
              color: "#9ca3af",
              lineHeight: 1.5,
              maxWidth: "700px",
            }}
          >
            Webhook-backed Shopify purchase tracking for Meta and TikTok.
          </div>

          {/* Platform badges */}
          <div
            style={{
              display: "flex",
              gap: "12px",
              marginTop: "40px",
            }}
          >
            {["Meta", "TikTok", "Shopify Webhook"].map(
              (platform) => (
                <div
                  key={platform}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "0px",
                    border: "1px solid rgba(6,182,212,0.3)",
                    background: "rgba(6,182,212,0.08)",
                    color: "#06b6d4",
                    fontSize: "14px",
                    fontWeight: 600,
                  }}
                >
                  {platform}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
