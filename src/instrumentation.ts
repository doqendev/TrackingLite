export async function register() {
  // All process diagnostics (signal handlers, crash handlers, keepalive, memory logging)
  // are registered in src/lib/db.ts which is imported by every route and guaranteed to load.
  // This file is kept as a no-op because Next.js standalone mode may not reliably call it.
}
