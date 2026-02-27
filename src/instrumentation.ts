export async function register() {
  // Only run at runtime, not during build. Railway sets PORT at runtime only.
  if (!process.env.PORT) return;

  const { writeSync } = require("fs");
  const syncLog = (msg: string) => {
    try { writeSync(1, msg + "\n"); } catch {}
  };

  syncLog(`[INSTRUMENT] register() called at uptime=${Math.round(process.uptime())}s`);

  // SIGTERM handler lives in db.ts (handles Prisma disconnect).
  // The bootstrap self-ping below triggers db.ts loading within 3s,
  // which registers the full signal handlers + keepalive.

  // Self-ping health endpoint to bootstrap db.ts loading + keep Railway proxy alive
  const port = process.env.PORT;
  const selfPing = () => {
    try {
      const http = require("http");
      http.get(`http://localhost:${port}/api/health`, () => {}).on("error", () => {});
    } catch {}
  };

  setTimeout(selfPing, 3_000).unref();
  setInterval(selfPing, 30_000).unref();
}
