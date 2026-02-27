import { PrismaClient } from "@prisma/client";
import { writeSync } from "fs";

// Synchronous log that survives process.exit — console.log is async in Docker/piped stdout
function syncLog(msg: string) {
  try { writeSync(1, msg + "\n"); } catch { /* fd closed */ }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient;
  __diagRegistered?: boolean;
};

// Register process diagnostics + keepalive once (guaranteed to run since db.ts is imported by every route)
if (!globalForPrisma.__diagRegistered) {
  globalForPrisma.__diagRegistered = true;

  syncLog(`[DIAG] Process started pid=${process.pid} node=${process.version} uptime=${Math.round(process.uptime())}s`);

  process.on("SIGTERM", () => {
    syncLog(`[SIGNAL] SIGTERM at ${new Date().toISOString()} uptime=${Math.round(process.uptime())}s`);
  });

  process.on("SIGINT", () => {
    syncLog(`[SIGNAL] SIGINT at ${new Date().toISOString()} uptime=${Math.round(process.uptime())}s`);
  });

  process.on("uncaughtException", (err) => {
    syncLog(`[FATAL] Uncaught exception: ${err.stack ?? err.message}`);
    setTimeout(() => process.exit(1), 200);
  });

  process.on("unhandledRejection", (reason) => {
    syncLog(`[FATAL] Unhandled rejection: ${reason instanceof Error ? reason.stack : String(reason)}`);
    setTimeout(() => process.exit(1), 200);
  });

  // Keep DB + Redis connections warm every 60s to prevent idle stale connections.
  // After idle periods, stale connections cause cascading failures on first request.
  // This MUST be in db.ts (not a route handler) because Next.js lazy-loads route modules.
  setInterval(async () => {
    try { if (globalForPrisma.prisma) await globalForPrisma.prisma.$queryRaw`SELECT 1`; } catch {}
    try {
      const { getSharedRedis } = await import("./redis");
      await getSharedRedis().ping();
    } catch {}
    const m = process.memoryUsage();
    syncLog(`[KEEPALIVE] rss=${Math.round(m.rss/1048576)}MB heap=${Math.round(m.heapUsed/1048576)}/${Math.round(m.heapTotal/1048576)}MB up=${Math.round(process.uptime())}s`);
  }, 60_000).unref();
}

export const db =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasources: {
      db: {
        url: `${process.env.DATABASE_URL ?? ""}${
          (process.env.DATABASE_URL ?? "").includes("?") ? "&" : "?"
        }connection_limit=${process.env.PRISMA_POOL_SIZE ?? "5"}&pool_timeout=15`,
      },
    },
    log:
      process.env.NODE_ENV === "production"
        ? ["error"]
        : ["query", "error", "warn"],
  });

globalForPrisma.prisma = db;
