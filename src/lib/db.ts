import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient;
  __diagRegistered?: boolean;
};

// Register process diagnostics once (guaranteed to run since db.ts is imported by every route)
if (!globalForPrisma.__diagRegistered) {
  globalForPrisma.__diagRegistered = true;

  console.log(`[DIAG] Process started pid=${process.pid} node=${process.version} uptime=${Math.round(process.uptime())}s`);

  process.on("SIGTERM", () => {
    console.log(`[SIGNAL] SIGTERM at ${new Date().toISOString()} uptime=${Math.round(process.uptime())}s`);
  });

  process.on("uncaughtException", (err) => {
    console.log(`[FATAL] Uncaught exception: ${err.stack ?? err.message}`);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    console.log(`[FATAL] Unhandled rejection: ${reason instanceof Error ? reason.stack : String(reason)}`);
    process.exit(1);
  });

  // Log memory every 2 minutes
  setInterval(() => {
    const mem = process.memoryUsage();
    console.log(
      `[MEM] rss=${Math.round(mem.rss / 1024 / 1024)}MB heap=${Math.round(mem.heapUsed / 1024 / 1024)}/${Math.round(mem.heapTotal / 1024 / 1024)}MB uptime=${Math.round(process.uptime())}s`
    );
  }, 120_000).unref();
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
