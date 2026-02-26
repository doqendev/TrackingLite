function parseEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const WORKER_LOCK_DURATION_MS = parseEnvInt("WORKER_LOCK_DURATION_MS", 180000);
export const WORKER_STALLED_INTERVAL_MS = parseEnvInt("WORKER_STALLED_INTERVAL_MS", 60000);
export const WORKER_MAX_STALLED_COUNT = parseEnvInt("WORKER_MAX_STALLED_COUNT", 2);
export const DESTINATION_WORKER_CONCURRENCY = parseEnvInt("DESTINATION_WORKER_CONCURRENCY", 1);
