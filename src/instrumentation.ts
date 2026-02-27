import { writeSync } from "fs";

function syncLog(msg: string) {
  try { writeSync(1, msg + "\n"); } catch {}
}

export async function register() {
  // Only run in production server (not during build, not in tests)
  if (process.env.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  syncLog(`[INSTRUMENT] register() called at uptime=${Math.round(process.uptime())}s`);

  // CRITICAL: Register SIGTERM handler IMMEDIATELY at server startup.
  // db.ts handlers only load on first request (lazy module import), leaving
  // the container unprotected for the first 60-100s. Railway can SIGKILL
  // containers during this window if SIGTERM isn't handled.
  if (!(globalThis as Record<string, unknown>).__earlySignalHandlers) {
    (globalThis as Record<string, unknown>).__earlySignalHandlers = true;

    process.on("SIGTERM", () => {
      syncLog(`[SIGNAL] SIGTERM at ${new Date().toISOString()} uptime=${Math.round(process.uptime())}s`);
      process.exit(0);
    });

    process.on("SIGINT", () => {
      syncLog(`[SIGNAL] SIGINT at ${new Date().toISOString()} uptime=${Math.round(process.uptime())}s`);
      process.exit(0);
    });
  }

  // Self-ping the health endpoint to:
  // 1. Trigger db.ts module loading (registers full signal handlers + keepalive)
  // 2. Keep Railway's proxy active (prevents idle container kills)
  //
  // Fire first ping after 3s (server needs a moment to bind the port),
  // then every 30s continuously. This runs INDEPENDENTLY of db.ts.
  const port = process.env.PORT || "3000";

  const selfPing = () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const http = require("http");
      http.get(`http://localhost:${port}/api/health`, () => {}).on("error", () => {});
    } catch {}
  };

  // Bootstrap ping — triggers db.ts loading within seconds of server start
  setTimeout(selfPing, 3_000).unref();

  // Continuous ping — keeps Railway proxy active even if db.ts keepalive fails
  setInterval(selfPing, 30_000).unref();
}
