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
// Skip in test environments — vitest uses uncaughtException internally, and process.exit kills workers
const isTestEnv = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
const isVercel = !!process.env.VERCEL;
if (!globalForPrisma.__diagRegistered && !isTestEnv && !isVercel) {
  globalForPrisma.__diagRegistered = true;

  // Read container memory limit from cgroup (Railway/Docker)
  let cgroupLimit = "unknown";
  try {
    const { readFileSync } = require("fs");
    // cgroup v2
    const raw = readFileSync("/sys/fs/cgroup/memory.max", "utf8").trim();
    cgroupLimit = raw === "max" ? "unlimited" : `${Math.round(parseInt(raw) / 1048576)}MB`;
  } catch {
    try {
      const { readFileSync } = require("fs");
      // cgroup v1
      const raw = readFileSync("/sys/fs/cgroup/memory/memory.limit_in_bytes", "utf8").trim();
      const val = parseInt(raw);
      cgroupLimit = val > 1e15 ? "unlimited" : `${Math.round(val / 1048576)}MB`;
    } catch { /* not in container */ }
  }

  syncLog(`[DIAG] Process started pid=${process.pid} node=${process.version} uptime=${Math.round(process.uptime())}s cgroupMemLimit=${cgroupLimit}`);

  // Exit handler — fires on ANY exit (SIGTERM, normal, crash). Reveals exit code.
  // Code 0 = clean exit (event loop drained), 1 = crash, 143 = SIGTERM, null = SIGKILL (won't fire)
  process.on("exit", (code) => {
    syncLog(`[EXIT] code=${code} uptime=${Math.round(process.uptime())}s at ${new Date().toISOString()}`);
  });

  // beforeExit fires when event loop drains — if this fires, our .unref() intervals let Node exit
  process.on("beforeExit", (code) => {
    syncLog(`[BEFORE_EXIT] code=${code} — event loop drained, no active handles`);
  });

  // SIGTERM: Railway sends this before SIGKILL. Single handler here (instrumentation.ts defers to us).
  process.on("SIGTERM", () => {
    syncLog(`[SIGNAL] SIGTERM at ${new Date().toISOString()} uptime=${Math.round(process.uptime())}s — shutting down`);
    if (globalForPrisma.prisma) {
      globalForPrisma.prisma.$disconnect().catch(() => {}).finally(() => process.exit(0));
    } else {
      process.exit(0);
    }
  });

  process.on("SIGINT", () => {
    syncLog(`[SIGNAL] SIGINT at ${new Date().toISOString()} uptime=${Math.round(process.uptime())}s`);
    process.exit(0);
  });

  process.on("uncaughtException", (err) => {
    syncLog(`[ERROR] Uncaught exception: ${err.stack ?? err.message}`);
    // Do NOT exit — let the process recover from transient errors
  });

  process.on("unhandledRejection", (reason) => {
    syncLog(`[ERROR] Unhandled rejection: ${reason instanceof Error ? reason.stack : String(reason)}`);
    // Do NOT exit — let the process recover from transient errors
  });

  // Keep DB + Redis connections warm every 60s to prevent idle stale connections.
  // After idle periods, stale connections cause cascading failures on first request.
  // HTTP self-ping handled by instrumentation.ts every 30s (keeps Railway proxy alive).
  setInterval(async () => {
    try {
      if (globalForPrisma.prisma) {
        // Warm 4 connections in parallel (half the pool)
        await Promise.all([
          globalForPrisma.prisma.$queryRaw`SELECT 1`,
          globalForPrisma.prisma.$queryRaw`SELECT 1`,
          globalForPrisma.prisma.$queryRaw`SELECT 1`,
          globalForPrisma.prisma.$queryRaw`SELECT 1`,
        ]);
      }
    } catch {}
    try {
      const { getSharedRedis } = await import("./redis");
      await getSharedRedis().ping();
    } catch {}
    // Self-ping removed — instrumentation.ts handles it every 30s
    const m = process.memoryUsage();
    syncLog(`[KEEPALIVE] rss=${Math.round(m.rss/1048576)}MB heap=${Math.round(m.heapUsed/1048576)}/${Math.round(m.heapTotal/1048576)}MB up=${Math.round(process.uptime())}s`);
  }, 60_000).unref();
}

// On Vercel (serverless), connections go over Railway's public TCP proxy which is
// less stable than the internal network. Use longer timeouts and connect_timeout
// to handle intermittent proxy drops without failing requests.
const baseUrl = process.env.DATABASE_URL ?? "";
const sep = baseUrl.includes("?") ? "&" : "?";
const poolSize = process.env.PRISMA_POOL_SIZE ?? (isVercel ? "5" : "10");
const poolTimeout = isVercel ? "30" : "15";
const connectTimeout = isVercel ? "30" : "10";

export const db =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasources: {
      db: {
        url: `${baseUrl}${sep}connection_limit=${poolSize}&pool_timeout=${poolTimeout}&connect_timeout=${connectTimeout}`,
      },
    },
    log:
      process.env.NODE_ENV === "production"
        ? ["error"]
        : ["query", "error", "warn"],
  });

globalForPrisma.prisma = db;
