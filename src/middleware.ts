import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

// In-memory sliding window for auth rate limiting.
// Middleware runs in Edge runtime where ioredis is not available.
// For a small SaaS, in-memory is sufficient for login attempts.
const authAttempts = new Map<string, { count: number; resetAt: number }>();
const AUTH_LIMIT = 5;
const AUTH_WINDOW_MS = 60_000; // 1 minute
const ENABLE_AUTH_RATE_LIMIT = process.env.ENABLE_AUTH_RATE_LIMIT === "true";

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

export default async function middleware(req: NextRequest) {
  cleanupStaleEntries();

  // Rate limit the credentials login endpoint
  if (
    ENABLE_AUTH_RATE_LIMIT &&
    req.nextUrl.pathname === "/api/auth/callback/credentials" &&
    req.method === "POST"
  ) {
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

  // Short-circuit for public routes — skip expensive JWT verification
  const pathname = req.nextUrl.pathname;
  if (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname.startsWith("/api/auth") ||
    pathname === "/api/events/ingest" ||
    pathname === "/api/stripe/webhook" ||
    pathname === "/api/health" ||
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/api/pixel/") ||
    pathname.startsWith("/api/s/") ||
    // Marketing pages
    pathname === "/meta-capi" ||
    pathname === "/tiktok-tracking" ||
    pathname === "/ga4-tracking" ||
    pathname === "/klaviyo-tracking" ||
    pathname === "/reddit-tracking" ||
    pathname === "/pinterest-tracking" ||
    pathname.startsWith("/vs/")
  ) {
    return NextResponse.next();
  }

  // Only verify auth for protected routes
  const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  const isSecure =
    req.headers.get("x-forwarded-proto") === "https" ||
    req.nextUrl.protocol === "https:";
  const token = await getToken({
    req,
    secureCookie: isSecure,
    ...(authSecret ? { secret: authSecret } : {}),
  });

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.svg).*)"],
};
