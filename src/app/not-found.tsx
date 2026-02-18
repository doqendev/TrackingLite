import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
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
          background: 'radial-gradient(ellipse at center, rgba(20,184,166,0.06) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-10 w-full max-w-md animate-fade-in-up text-center">
        {/* Large 404 */}
        <p className="text-7xl font-bold text-muted-foreground/20 select-none leading-none mb-6">
          404
        </p>

        {/* Card */}
        <div className="rounded-2xl bg-card px-8 py-10 shadow-lg ring-1 ring-white/[0.06] glow-card border-t-2 border-brand-500/40">
          <h1 className="text-2xl font-bold tracking-tight text-foreground mb-2">
            Page not found
          </h1>
          <p className="text-sm text-muted-foreground mb-8">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button variant="brand" asChild>
              <Link href="/">Go home</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
