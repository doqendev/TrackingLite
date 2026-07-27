export const EXPECTED_WORKER_COUNT = 11;

export type DependencyHealth = "connected" | "disconnected";

export interface WorkerListener {
  isRunning(): boolean;
}

export interface WorkerHealthSnapshot {
  status: "ok" | "degraded";
  commit: string | null;
  database: DependencyHealth;
  redis: DependencyHealth;
  startupReady: boolean;
  listenersReady: number;
  workers: number;
  uptime: number;
}

interface EvaluateWorkerHealthOptions {
  workers: readonly WorkerListener[];
  startupReady: boolean;
  checkDatabase: () => Promise<unknown>;
  checkRedis: () => Promise<unknown>;
  commit: string | null;
  uptime: number;
  timeoutMs?: number;
}

const DEFAULT_DEPENDENCY_TIMEOUT_MS = 2_000;

async function dependencyIsHealthy(
  check: () => Promise<unknown>,
  timeoutMs: number
): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      Promise.resolve().then(check),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Worker health dependency check timed out")),
          timeoutMs
        );
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export async function evaluateWorkerHealth({
  workers,
  startupReady,
  checkDatabase,
  checkRedis,
  commit,
  uptime,
  timeoutMs = DEFAULT_DEPENDENCY_TIMEOUT_MS,
}: EvaluateWorkerHealthOptions): Promise<WorkerHealthSnapshot> {
  const listenerStates = workers.map((worker) => {
    try {
      return worker.isRunning();
    } catch {
      return false;
    }
  });
  const listenersReady = listenerStates.filter(Boolean).length;
  const allListenersReady =
    workers.length === EXPECTED_WORKER_COUNT &&
    listenersReady === EXPECTED_WORKER_COUNT;

  const [databaseReady, redisReady] = await Promise.all([
    dependencyIsHealthy(checkDatabase, timeoutMs),
    dependencyIsHealthy(checkRedis, timeoutMs),
  ]);
  const database: DependencyHealth = databaseReady
    ? "connected"
    : "disconnected";
  const redis: DependencyHealth = redisReady ? "connected" : "disconnected";

  return {
    status:
      startupReady && allListenersReady && databaseReady && redisReady
        ? "ok"
        : "degraded",
    commit,
    database,
    redis,
    startupReady,
    listenersReady,
    workers: workers.length,
    uptime,
  };
}
