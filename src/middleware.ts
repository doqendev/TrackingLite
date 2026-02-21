import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// In-memory sliding window for auth rate limiting.
// Middleware runs in Edge runtime where ioredis is not available.
// For a small SaaS, in-memory is sufficient for login attempts.
const authAttempts = new Map<string, { count: number; resetAt: number }>();
const AUTH_LIMIT = 5;
const AUTH_WINDOW_MS = 60_000; // 1 minute

function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = authAttempts.get(ip);

  if (!entry || now > entry.resetAt) {
    authAttempts.set(ip, { count: 1, resetAt: now + AUTH_WINDOW_MS });
    return true;
  }

  entry.count++;
  return entry.count <= AUTH_LIMIT;
}

// Periodic cleanup to prevent memory leak (runs on every request, cheap check)
let lastCleanup = Date.now();
function cleanupStaleEntries() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [ip, entry] of Array.from(authAttempts)) {
    if (now > entry.resetAt) authAttempts.delete(ip);
  }
}

export default auth((req) => {
  cleanupStaleEntries();

  // Rate limit the credentials login endpoint
  if (req.nextUrl.pathname === "/api/auth/callback/credentials" && req.method === "POST") {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip")
      || "unknown";
    if (!checkLoginRateLimit(ip)) {
      return NextResponse.json(
        { error: "Too many login attempts. Try again later." },
        { status: 429 }
      );
    }
  }

  const isLoggedIn = !!req.auth;
  const isPublicRoute = ["/", "/login", "/signup", "/forgot-password", "/reset-password", "/api/events/ingest", "/api/stripe/webhook", "/api/health", "/privacy", "/terms"].some(
    (path) => req.nextUrl.pathname === path || req.nextUrl.pathname.startsWith("/api/auth")
  );

  // Also allow webhook endpoints
  if (req.nextUrl.pathname.startsWith("/api/webhooks/")) {
    return;
  }

  if (!isLoggedIn && !isPublicRoute) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.svg).*)"],
};
