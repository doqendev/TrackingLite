"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body style={{ backgroundColor: "#0a0b0f", color: "#e5e7eb", fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ maxWidth: "28rem", textAlign: "center" }}>
            <p style={{ fontSize: "4rem", fontWeight: 700, color: "rgba(255,255,255,0.1)", lineHeight: 1, marginBottom: "1.5rem" }}>
              !
            </p>
            <div style={{ background: "#111318", borderRadius: "1rem", padding: "2.5rem 2rem", boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 4px 24px rgba(0,0,0,0.3)", borderTop: "2px solid rgba(59,130,246,0.4)" }}>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
                Something went wrong
              </h1>
              <p style={{ fontSize: "0.875rem", color: "#9ca3af", marginBottom: "2rem" }}>
                An unexpected error occurred. Try again — if the problem persists, go back home.
              </p>
              {error.digest && (
                <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.3)", fontFamily: "monospace", marginBottom: "1.5rem" }}>
                  Error ID: {error.digest}
                </p>
              )}
              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
                <button
                  onClick={reset}
                  style={{ padding: "0.5rem 1.25rem", borderRadius: "0.5rem", border: "none", background: "#3b82f6", color: "white", fontWeight: 500, fontSize: "0.875rem", cursor: "pointer" }}
                >
                  Try again
                </button>
                <a
                  href="/"
                  style={{ padding: "0.5rem 1.25rem", borderRadius: "0.5rem", border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#e5e7eb", fontWeight: 500, fontSize: "0.875rem", textDecoration: "none", cursor: "pointer" }}
                >
                  Go home
                </a>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
