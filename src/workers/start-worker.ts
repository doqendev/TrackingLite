import "dotenv/config";

interface ManagedWorker {
  close(force?: boolean): Promise<void>;
  disconnect(): Promise<void>;
  isRunning(): boolean;
  run(): Promise<void>;
  waitUntilReady(): Promise<unknown>;
}

interface RuntimeLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

const OUTBOUND_REQUEST_TIMEOUT_MS = 30_000;
const WORKER_SHUTDOWN_TIMEOUT_MS = 45_000;

let managedWorkers: ManagedWorker[] = [];
let runtimeLogger: RuntimeLogger | null = null;
let runtimeHealthServer: import("node:http").Server | null = null;
let runtimeDatabaseDisconnect: (() => Promise<void>) | null = null;
let runtimeRedisDisconnect: (() => void) | null = null;
let runtimeSentryFlush: ((timeoutMs: number) => Promise<boolean>) | null = null;
let runtimeMemoryInterval: ReturnType<typeof setInterval> | null = null;
let runtimeListenersReady = false;
let shutdownStarted = false;
let shutdownPromise: Promise<void> | null = null;

function serializeError(error: unknown) {
  return error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { message: String(error) };
}

function writeStartupError(message: string, error: unknown) {
  process.stderr.write(
    JSON.stringify({
      level: "error",
      component: "worker-startup",
      msg: message,
      error: serializeError(error),
      timestamp: new Date().toISOString(),
    }) + "\n"
  );
}

async function closeHealthServer(): Promise<void> {
  const server = runtimeHealthServer;
  runtimeHealthServer = null;
  if (!server?.listening) return;

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function logCloseFailures(
  resource: string,
  results: PromiseSettledResult<unknown>[]
): void {
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  if (failures.length > 0) {
    runtimeLogger?.error(`One or more ${resource} failed to close cleanly`, {
      failures: failures.map((result) => serializeError(result.reason)),
    });
  }
}

async function shutdownRuntime(signal: string, exitCode: number): Promise<void> {
  if (shutdownPromise) return shutdownPromise;

  shutdownStarted = true;
  runtimeListenersReady = false;
  shutdownPromise = (async () => {
    runtimeLogger?.info("Received shutdown request", { signal, exitCode });
    const timeout = setTimeout(() => {
      const error = new Error(
        `Worker shutdown exceeded ${WORKER_SHUTDOWN_TIMEOUT_MS}ms`
      );
      if (runtimeLogger) {
        runtimeLogger.error("Worker shutdown timed out; forcing exit", {
          error: serializeError(error),
        });
      } else {
        writeStartupError("Worker shutdown timed out; forcing exit", error);
      }
      process.exit(1);
    }, WORKER_SHUTDOWN_TIMEOUT_MS);

    try {
      if (runtimeMemoryInterval) {
        clearInterval(runtimeMemoryInterval);
        runtimeMemoryInterval = null;
      }

      await closeHealthServer().catch((error) => {
        runtimeLogger?.error("Failed to close worker health server", { error });
      });

      // close() stops acquisition and waits for active processors to settle.
      const closeResults = await Promise.allSettled(
        managedWorkers.map((worker) => worker.close())
      );
      logCloseFailures("workers", closeResults);

      // Every worker is constructed with an explicit shared IORedis instance.
      // BullMQ intentionally leaves those supplied clients open after close().
      const disconnectResults = await Promise.allSettled(
        managedWorkers.map((worker) => worker.disconnect())
      );
      logCloseFailures("worker Redis connections", disconnectResults);

      if (runtimeDatabaseDisconnect) {
        await runtimeDatabaseDisconnect().catch((error) => {
          runtimeLogger?.error("Failed to disconnect worker database", { error });
        });
      }
      runtimeRedisDisconnect?.();

      if (runtimeSentryFlush) {
        await runtimeSentryFlush(2_000).catch(() => false);
      }
    } finally {
      clearTimeout(timeout);
    }

    process.exit(exitCode);
  })();

  return shutdownPromise;
}

// Signal ownership is installed before any asynchronous imports can construct a
// BullMQ listener. A startup-time signal therefore uses the same cleanup path as
// a steady-state shutdown instead of allowing Node's default immediate exit.
process.once("SIGTERM", () => {
  void shutdownRuntime("SIGTERM", 0);
});
process.once("SIGINT", () => {
  void shutdownRuntime("SIGINT", 0);
});

async function startWorkerRuntime() {
  const { validateEnv } = await import("@/lib/env-validation");
  validateEnv("worker");

  process.env.PRISMA_CLIENT_ENGINE_TYPE = "library";
  process.env.MSGPACKR_NATIVE_ACCELERATION_DISABLED ??= "true";
  // db.ts owns process signals for web/CLI runtimes. The worker must drain all
  // BullMQ listeners before exiting, so it is the sole shutdown owner here.
  process.env.TRACKCLEAR_WORKER_OWNS_SHUTDOWN = "true";

  const Sentry = await import("@sentry/node");
  runtimeSentryFlush = (timeoutMs) => Sentry.flush(timeoutMs);
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? "development",
    });
  }

  // Import sequentially and register each closeable immediately. If a later
  // import or setup operation fails, the startup-failure path can still stop
  // every listener that was successfully constructed before it.
  const { createLogger } = await import("@/lib/logger");
  const { createServer } = await import("node:http");
  const { db } = await import("@/lib/db");
  runtimeDatabaseDisconnect = () => db.$disconnect();
  const {
    assertRailwayProductionReleaseApproved,
    shouldAssertRailwayProductionRelease,
  } = await import(
    "@/lib/production-release-gate"
  );
  const isRailwayRuntime = shouldAssertRailwayProductionRelease(process.env);
  if (isRailwayRuntime) {
    assertRailwayProductionReleaseApproved(process.env);
    const {
      assertDeploymentDatabaseIdentityMatchesExpected,
      readDeploymentDatabaseIdentity,
      readExpectedDeploymentDatabaseIdentity,
    } = await import("@/lib/deployment-database-identity");
    assertDeploymentDatabaseIdentityMatchesExpected(
      await readDeploymentDatabaseIdentity(db),
      readExpectedDeploymentDatabaseIdentity(process.env)
    );
  }
  const { assertTrackingDeploymentSchemaReady } = await import(
    "@/lib/deployment-schema"
  );
  await assertTrackingDeploymentSchemaReady(db);
  const { getSharedRedis, closeSharedRedis } = await import("@/lib/redis");
  runtimeRedisDisconnect = closeSharedRedis;
  const { evaluateWorkerHealth, EXPECTED_WORKER_COUNT } = await import(
    "./worker-health"
  );

  const { worker: metaWorker } = await import("./meta-event-processor");
  managedWorkers.push(metaWorker);
  const { tiktokWorker } = await import("./tiktok-event-processor");
  managedWorkers.push(tiktokWorker);
  const { ga4Worker } = await import("./ga4-event-processor");
  managedWorkers.push(ga4Worker);
  const { klaviyoWorker } = await import("./klaviyo-event-processor");
  managedWorkers.push(klaviyoWorker);
  const { redditWorker } = await import("./reddit-event-processor");
  managedWorkers.push(redditWorker);
  const { pinterestWorker } = await import("./pinterest-event-processor");
  managedWorkers.push(pinterestWorker);
  const { googleAdsWorker } = await import("./google-ads-event-processor");
  managedWorkers.push(googleAdsWorker);
  const { alertWorker, scheduleAlertChecks } = await import("./alert-checker");
  managedWorkers.push(alertWorker);
  const { staleRequeueWorker, scheduleStaleRequeue } = await import(
    "./stale-pending-requeue"
  );
  managedWorkers.push(staleRequeueWorker);
  const { cleanupWorker, scheduleEventLogCleanup } = await import(
    "./event-log-cleanup"
  );
  managedWorkers.push(cleanupWorker);
  const { shopifyWebhookInboxWorker, scheduleShopifyWebhookInboxReplay } =
    await import("./shopify-webhook-inbox-worker");
  managedWorkers.push(shopifyWebhookInboxWorker);

  const log = createLogger({ component: "worker-main" });
  runtimeLogger = log;

  process.on("uncaughtException", (error) => {
    log.error("Uncaught exception", { error });
    Sentry.captureException(error);
    void shutdownRuntime("UNCAUGHT_EXCEPTION", 1);
  });

  process.on("unhandledRejection", (reason) => {
    log.error("Unhandled rejection", { reason });
    Sentry.captureException(reason);
    void shutdownRuntime("UNHANDLED_REJECTION", 1);
  });

  process.on("beforeExit", (code) => {
    log.warn("Worker process beforeExit", { code });
  });

  process.on("exit", (code) => {
    log.warn("Worker process exit", { code });
  });

  if (managedWorkers.length !== EXPECTED_WORKER_COUNT) {
    throw new Error(
      `Worker listener count mismatch: expected ${EXPECTED_WORKER_COUNT}, constructed ${managedWorkers.length}`
    );
  }

  log.info("Worker listeners constructed in paused state", {
    workerCount: managedWorkers.length,
    pid: process.pid,
  });
  log.info("Redis configured", {
    redisUrl: (process.env.REDIS_URL ?? "redis://localhost:6379").replace(
      /\/\/.*@/,
      "//***@"
    ),
  });

  // These recovery producers are part of tracking readiness. Because every
  // listener is autorun:false, no outbound job can be claimed before both
  // schedules are durably registered.
  await scheduleStaleRequeue();
  await scheduleShopifyWebhookInboxReplay();
  log.info("Required delivery recovery schedules registered", {
    staleRequeueInterval: "5min",
    shopifyInboxInterval: "1min",
  });

  if (shutdownStarted) {
    throw new Error("Worker startup interrupted by shutdown");
  }

  let rejectListenerStartup: ((error: Error) => void) | null = null;
  const listenerStartupFailure = new Promise<never>((_, reject) => {
    rejectListenerStartup = reject;
  });

  for (let index = 0; index < managedWorkers.length; index++) {
    const worker = managedWorkers[index];
    void worker.run().then(
      () => {
        if (shutdownStarted) return;
        runtimeListenersReady = false;
        const error = new Error(`Worker listener ${index + 1} stopped unexpectedly`);
        if (rejectListenerStartup) {
          const reject = rejectListenerStartup;
          rejectListenerStartup = null;
          reject(error);
        } else {
          log.error("Worker listener stopped unexpectedly", {
            listener: index + 1,
          });
          void shutdownRuntime("WORKER_LISTENER_STOPPED", 1);
        }
      },
      (error: unknown) => {
        if (shutdownStarted) return;
        runtimeListenersReady = false;
        const listenerError =
          error instanceof Error
            ? error
            : new Error(`Worker listener ${index + 1} failed: ${String(error)}`);
        if (rejectListenerStartup) {
          const reject = rejectListenerStartup;
          rejectListenerStartup = null;
          reject(listenerError);
        } else {
          log.error("Worker listener failed unexpectedly", {
            listener: index + 1,
            error: listenerError,
          });
          void shutdownRuntime("WORKER_LISTENER_FAILED", 1);
        }
      }
    );
  }

  await Promise.race([
    Promise.all(managedWorkers.map((worker) => worker.waitUntilReady())),
    listenerStartupFailure,
  ]);
  rejectListenerStartup = null;

  if (shutdownStarted) {
    throw new Error("Worker startup interrupted by shutdown");
  }
  runtimeListenersReady = true;

  const healthPort = Number.parseInt(
    process.env.PORT || process.env.WORKER_HEALTH_PORT || "8080",
    10
  );
  const healthServer = createServer(async (req, res) => {
    if (
      (req.url === "/health" || req.url === "/api/health") &&
      req.method === "GET"
    ) {
      const health = await evaluateWorkerHealth({
        workers: managedWorkers,
        startupReady: runtimeListenersReady,
        checkDatabase: async () => {
          await assertTrackingDeploymentSchemaReady(db);
          return db.$queryRaw`SELECT 1`;
        },
        checkRedis: () => getSharedRedis().ping(),
        commit:
          process.env.RAILWAY_GIT_COMMIT_SHA ??
          process.env.GIT_COMMIT_SHA ??
          null,
        uptime: process.uptime(),
      });

      res.writeHead(health.status === "ok" ? 200 : 503, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(health));
      return;
    }

    res.writeHead(404);
    res.end();
  });
  runtimeHealthServer = healthServer;
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    healthServer.once("error", onError);
    healthServer.listen(healthPort, () => {
      healthServer.off("error", onError);
      resolve();
    });
  });

  log.info("All worker listeners ready", {
    queues: [
      "meta-events",
      "tiktok-events",
      "ga4-events",
      "klaviyo-events",
      "reddit-events",
      "pinterest-events",
      "google-ads-events",
      "alert-checks",
      "stale-pending-requeue",
      "event-log-cleanup",
      "shopify-webhook-inbox",
    ],
    listenersReady: managedWorkers.length,
    port: healthPort,
  });

  runtimeMemoryInterval = setInterval(() => {
    const memory = process.memoryUsage();
    log.info("Memory usage", {
      rss: Math.round(memory.rss / 1024 / 1024),
      heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
      external: Math.round(memory.external / 1024 / 1024),
    });
  }, 5 * 60 * 1000);

  scheduleAlertChecks().catch((error) => {
    log.error("Failed to schedule alert checks", { error });
  });

  scheduleEventLogCleanup().catch((error) => {
    log.error("Failed to schedule event log cleanup", { error });
  });
}

if (WORKER_SHUTDOWN_TIMEOUT_MS <= OUTBOUND_REQUEST_TIMEOUT_MS) {
  throw new Error("Worker shutdown timeout must exceed outbound request timeout");
}

startWorkerRuntime().catch(async (error) => {
  writeStartupError("Worker startup failed: runtime initialization", error);
  await shutdownRuntime("STARTUP_FAILURE", 1);
});
