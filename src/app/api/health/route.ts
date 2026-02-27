import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSharedRedis } from "@/lib/redis";

// Register crash handlers on first health check (runs in the actual server process)
const g = globalThis as Record<string, unknown>;
if (!g.__crashHandlers) {
  g.__crashHandlers = true;
  console.log(`[BOOT] Health route loaded pid=${process.pid} node=${process.version}`);
  process.on("SIGTERM", () => console.log(`[SIGNAL] SIGTERM uptime=${Math.round(process.uptime())}s`));
  process.on("uncaughtException", (err) => { console.log(`[FATAL] ${err.stack}`); process.exit(1); });
  process.on("unhandledRejection", (r) => { console.log(`[FATAL] Unhandled: ${r instanceof Error ? r.stack : r}`); process.exit(1); });
  setInterval(() => {
    const m = process.memoryUsage();
    console.log(`[MEM] rss=${Math.round(m.rss/1048576)}MB heap=${Math.round(m.heapUsed/1048576)}/${Math.round(m.heapTotal/1048576)}MB up=${Math.round(process.uptime())}s`);
  }, 120_000).unref();
}

export async function GET() {
  let dbStatus: "connected" | "disconnected" = "connected";
  let redisStatus: "connected" | "disconnected" = "connected";

  // Check PostgreSQL with timeout
  try {
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]);
  } catch {
    dbStatus = "disconnected";
  }

  // Check Redis with timeout
  try {
    await Promise.race([
      getSharedRedis().ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]);
  } catch {
    redisStatus = "disconnected";
  }

  const overall = dbStatus === "connected" && redisStatus === "connected" ? "ok" : "degraded";

  const mem = process.memoryUsage();
  const memMB = {
    rss: Math.round(mem.rss / 1024 / 1024),
    heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    external: Math.round(mem.external / 1024 / 1024),
  };

  // Log memory usage for diagnostics
  console.log(`[health] mem rss=${memMB.rss}MB heap=${memMB.heapUsed}/${memMB.heapTotal}MB uptime=${Math.round(process.uptime())}s`);

  // ALWAYS return 200 — Railway restarts on non-200 health checks.
  // Use "status" field for monitoring tools to detect degradation.
  return NextResponse.json({
    status: overall,
    database: dbStatus,
    redis: redisStatus,
    memory: memMB,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}
