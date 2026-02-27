export async function register() {
  // Log process signals to diagnose silent Railway restarts
  process.on("SIGTERM", () => {
    process.stderr.write(`[SIGNAL] SIGTERM at ${new Date().toISOString()} uptime=${Math.round(process.uptime())}s\n`);
  });

  process.on("SIGINT", () => {
    process.stderr.write(`[SIGNAL] SIGINT at ${new Date().toISOString()}\n`);
  });

  process.on("uncaughtException", (err) => {
    process.stderr.write(`[FATAL] Uncaught exception: ${err.stack ?? err.message}\n`);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    process.stderr.write(`[FATAL] Unhandled rejection: ${reason instanceof Error ? reason.stack : String(reason)}\n`);
    process.exit(1);
  });

  // Log memory every 2 minutes to spot leaks/growth
  setInterval(() => {
    const mem = process.memoryUsage();
    process.stderr.write(
      `[MEM] rss=${Math.round(mem.rss / 1024 / 1024)}MB heap=${Math.round(mem.heapUsed / 1024 / 1024)}/${Math.round(mem.heapTotal / 1024 / 1024)}MB uptime=${Math.round(process.uptime())}s\n`
    );
  }, 120_000).unref();
}
