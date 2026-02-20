import { auth } from "@/lib/auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isPublicRoute = ["/", "/login", "/signup", "/forgot-password", "/reset-password", "/api/events/ingest", "/api/stripe/webhook", "/api/health"].some(
    (path) => req.nextUrl.pathname === path || req.nextUrl.pathname.startsWith("/api/auth")
  );

  if (!isLoggedIn && !isPublicRoute) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.svg).*)"],
};
