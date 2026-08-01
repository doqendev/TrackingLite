import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  EXPECTED_WORKER_COUNT,
  evaluateWorkerHealth,
} from "@/workers/worker-health";

function makeWorkers(states: boolean[]) {
  return states.map((state) => ({ isRunning: vi.fn(() => state) }));
}

describe("worker health evaluation", () => {
  it("gates Railway worker deployment on the readiness endpoint", () => {
    const railwayConfig = readFileSync(
      resolve(process.cwd(), "railway.worker.toml"),
      "utf8"
    );

    expect(railwayConfig).toContain('healthcheckPath = "/health"');
    expect(railwayConfig).toContain("healthcheckTimeout = 300");
    const releaseWorkflow = readFileSync(
      resolve(process.cwd(), ".github/workflows/release-gates.yml"),
      "utf8"
    );
    expect(releaseWorkflow).toContain("and .startupReady == true");
  });

  it("registers required recovery before starting listeners or exposing health", () => {
    const workerEntrypoint = readFileSync(
      resolve(process.cwd(), "src/workers/start-worker.ts"),
      "utf8"
    ).replace(/\r\n/g, "\n");
    const scheduleIndex = workerEntrypoint.indexOf(
      "await scheduleShopifyWebhookInboxReplay()"
    );
    const staleRequeueIndex = workerEntrypoint.indexOf(
      "await scheduleStaleRequeue()"
    );
    const runIndex = workerEntrypoint.indexOf("void worker.run()");
    const readyIndex = workerEntrypoint.indexOf("worker.waitUntilReady()");
    const listenIndex = workerEntrypoint.indexOf("healthServer.listen(");

    expect(scheduleIndex).toBeGreaterThan(-1);
    expect(staleRequeueIndex).toBeGreaterThan(-1);
    expect(runIndex).toBeGreaterThan(scheduleIndex);
    expect(runIndex).toBeGreaterThan(staleRequeueIndex);
    expect(readyIndex).toBeGreaterThan(runIndex);
    expect(listenIndex).toBeGreaterThan(scheduleIndex);
    expect(listenIndex).toBeGreaterThan(staleRequeueIndex);
    expect(listenIndex).toBeGreaterThan(readyIndex);
    expect(workerEntrypoint).not.toContain(
      "scheduleShopifyWebhookInboxReplay().catch"
    );
    expect(workerEntrypoint).not.toContain("scheduleStaleRequeue().catch");
  });

  it("gives the worker exclusive signal ownership before importing the database", () => {
    const workerEntrypoint = readFileSync(
      resolve(process.cwd(), "src/workers/start-worker.ts"),
      "utf8"
    ).replace(/\r\n/g, "\n");
    const databaseModule = readFileSync(
      resolve(process.cwd(), "src/lib/db.ts"),
      "utf8"
    );
    const optOutIndex = workerEntrypoint.indexOf(
      'process.env.TRACKCLEAR_WORKER_OWNS_SHUTDOWN = "true"'
    );
    const databaseImportIndex = workerEntrypoint.indexOf('import("@/lib/db")');
    const signalHandlerIndex = workerEntrypoint.indexOf(
      'process.once("SIGTERM"'
    );
    const startupIndex = workerEntrypoint.indexOf("startWorkerRuntime().catch");

    expect(optOutIndex).toBeGreaterThan(-1);
    expect(databaseImportIndex).toBeGreaterThan(optOutIndex);
    expect(signalHandlerIndex).toBeGreaterThan(-1);
    expect(startupIndex).toBeGreaterThan(signalHandlerIndex);
    expect(databaseModule).toContain(
      'if (!workerOwnsShutdown) process.on("SIGTERM"'
    );
    expect(databaseModule).toContain(
      'if (!workerOwnsShutdown) process.on("SIGINT"'
    );
    expect(workerEntrypoint).toContain(
      "runtimeDatabaseDisconnect = () => db.$disconnect()"
    );
    expect(workerEntrypoint).toContain("runtimeRedisDisconnect?.()");
    expect(workerEntrypoint).toContain(
      "await Promise.allSettled(\n        managedWorkers.map((worker) => worker.close())"
    );
    expect(workerEntrypoint).toContain(
      "await Promise.allSettled(\n        managedWorkers.map((worker) => worker.disconnect())"
    );
    expect(workerEntrypoint).toContain(
      'await shutdownRuntime("STARTUP_FAILURE", 1)'
    );
    expect(workerEntrypoint).toMatch(
      /process\.on\("uncaughtException"[\s\S]*?Sentry\.captureException\(error\);[\s\S]*?void shutdownRuntime\("UNCAUGHT_EXCEPTION", 1\);/
    );
    expect(workerEntrypoint).toMatch(
      /process\.on\("unhandledRejection"[\s\S]*?Sentry\.captureException\(reason\);[\s\S]*?void shutdownRuntime\("UNHANDLED_REJECTION", 1\);/
    );
  });

  it("constructs every exported BullMQ worker with autorun disabled", () => {
    const workerFiles = [
      "meta-event-processor.ts",
      "tiktok-event-processor.ts",
      "ga4-event-processor.ts",
      "klaviyo-event-processor.ts",
      "reddit-event-processor.ts",
      "pinterest-event-processor.ts",
      "google-ads-event-processor.ts",
      "alert-checker.ts",
      "stale-pending-requeue.ts",
      "event-log-cleanup.ts",
      "shopify-webhook-inbox-worker.ts",
    ];

    for (const file of workerFiles) {
      const source = readFileSync(
        resolve(process.cwd(), "src", "workers", file),
        "utf8"
      );
      expect(source, file).toContain("autorun: false");
      expect(source.match(/autorun: false/g), file).toHaveLength(1);
    }
  });

  it("keeps application and Railway drain deadlines above outbound timeout", () => {
    const workerEntrypoint = readFileSync(
      resolve(process.cwd(), "src/workers/start-worker.ts"),
      "utf8"
    );
    const railwayConfig = readFileSync(
      resolve(process.cwd(), "railway.worker.toml"),
      "utf8"
    );

    expect(workerEntrypoint).toContain(
      "const OUTBOUND_REQUEST_TIMEOUT_MS = 30_000"
    );
    expect(workerEntrypoint).toContain(
      "const WORKER_SHUTDOWN_TIMEOUT_MS = 45_000"
    );
    expect(railwayConfig).toContain("drainingSeconds = 60");
  });

  it("reports healthy only when all 11 listeners and both dependencies are ready", async () => {
    const workers = makeWorkers(
      Array.from({ length: EXPECTED_WORKER_COUNT }, () => true)
    );

    const health = await evaluateWorkerHealth({
      workers,
      startupReady: true,
      checkDatabase: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
      checkRedis: vi.fn().mockResolvedValue("PONG"),
      commit: "abc1234",
      uptime: 42,
    });

    expect(health).toEqual({
      status: "ok",
      commit: "abc1234",
      database: "connected",
      redis: "connected",
      startupReady: true,
      listenersReady: EXPECTED_WORKER_COUNT,
      workers: EXPECTED_WORKER_COUNT,
      uptime: 42,
    });
    for (const worker of workers) {
      expect(worker.isRunning).toHaveBeenCalledOnce();
    }
  });

  it("checks every listener and degrades when any listener is not running", async () => {
    const states = Array.from(
      { length: EXPECTED_WORKER_COUNT },
      (_, index) => index !== 0
    );
    const workers = makeWorkers(states);

    const health = await evaluateWorkerHealth({
      workers,
      startupReady: true,
      checkDatabase: vi.fn().mockResolvedValue(undefined),
      checkRedis: vi.fn().mockResolvedValue("PONG"),
      commit: "abc1234",
      uptime: 42,
    });

    expect(health).toMatchObject({
      status: "degraded",
      listenersReady: EXPECTED_WORKER_COUNT - 1,
      workers: EXPECTED_WORKER_COUNT,
    });
    for (const worker of workers) {
      expect(worker.isRunning).toHaveBeenCalledOnce();
    }
  });

  it("degrades when PostgreSQL is unavailable", async () => {
    const health = await evaluateWorkerHealth({
      workers: makeWorkers(
        Array.from({ length: EXPECTED_WORKER_COUNT }, () => true)
      ),
      startupReady: true,
      checkDatabase: vi.fn().mockRejectedValue(new Error("database unavailable")),
      checkRedis: vi.fn().mockResolvedValue("PONG"),
      commit: "abc1234",
      uptime: 42,
    });

    expect(health).toMatchObject({
      status: "degraded",
      database: "disconnected",
      redis: "connected",
      listenersReady: EXPECTED_WORKER_COUNT,
    });
  });

  it("degrades when Redis is unavailable or fewer than 11 listeners exist", async () => {
    const health = await evaluateWorkerHealth({
      workers: makeWorkers(
        Array.from({ length: EXPECTED_WORKER_COUNT - 1 }, () => true)
      ),
      startupReady: true,
      checkDatabase: vi.fn().mockResolvedValue(undefined),
      checkRedis: vi.fn().mockRejectedValue(new Error("redis unavailable")),
      commit: "abc1234",
      uptime: 42,
    });

    expect(health).toMatchObject({
      status: "degraded",
      database: "connected",
      redis: "disconnected",
      listenersReady: EXPECTED_WORKER_COUNT - 1,
      workers: EXPECTED_WORKER_COUNT - 1,
    });
  });

  it("degrades until the explicit listener-readiness latch is set", async () => {
    const health = await evaluateWorkerHealth({
      workers: makeWorkers(
        Array.from({ length: EXPECTED_WORKER_COUNT }, () => true)
      ),
      startupReady: false,
      checkDatabase: vi.fn().mockResolvedValue(undefined),
      checkRedis: vi.fn().mockResolvedValue("PONG"),
      commit: "abc1234",
      uptime: 42,
    });

    expect(health).toMatchObject({
      status: "degraded",
      startupReady: false,
      listenersReady: EXPECTED_WORKER_COUNT,
      workers: EXPECTED_WORKER_COUNT,
    });
  });
});
