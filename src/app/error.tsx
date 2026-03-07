"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("App error boundary:", error.message, error.digest, error.stack);
  }, [error]);
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 overflow-hidden">
      {/* Dot grid background */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
      {/* Radial glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(6,182,212,0.06) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-10 w-full max-w-md animate-fade-in-up text-center">
        {/* Large error indicator */}
        <p className="text-7xl font-bold text-muted-foreground/20 select-none leading-none mb-6">
          !
        </p>

        {/* Card */}
        <div className="bg-card px-8 py-10 shadow-lg ring-1 ring-white/[0.06] glow-card border-t-2 border-brand-500/40">
          <h1 className="text-2xl font-bold tracking-wider text-foreground mb-2">
            Something went wrong
          </h1>
          <p className="text-sm text-muted-foreground mb-8">
            An unexpected error occurred. Try again — if the problem persists, go back home.
          </p>

          {error.digest && (
            <p className="mb-6 font-mono text-xs text-muted-foreground/50">
              Error ID: {error.digest}
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button variant="brand" onClick={reset}>
              Try again
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/">Go home</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
