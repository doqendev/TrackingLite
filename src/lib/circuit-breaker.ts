import { getSharedRedis } from "@/lib/redis";

const FAILURE_THRESHOLD = 5; // consecutive upstream failures to open circuit
const COOLDOWN_SECONDS = 60; // how long circuit stays open

const TRANSIENT_NETWORK_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "ENETDOWN",
  "ENETUNREACH",
  "EPIPE",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

type ErrorMetadata = {
  status?: unknown;
  statusCode?: unknown;
  code?: unknown;
  message?: unknown;
  cause?: unknown;
  response?: { status?: unknown };
};

function circuitScope(destination: string, workspaceId?: string): string {
  // workspaceId is optional only so already-queued jobs running the previous worker
  // build remain drainable during a rolling deploy. Current workers always provide it.
  return `${destination}:${workspaceId || "legacy"}`;
}

function statusCodeFromError(error: ErrorMetadata): number | null {
  const candidate = error.statusCode ?? error.status ?? error.response?.status;
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
}

export class CircuitOpenError extends Error {
  constructor(destination: string, workspaceId?: string) {
    super(
      `Circuit breaker open for ${destination}${workspaceId ? ` workspace ${workspaceId}` : ""} — destination API appears down`
    );
    this.name = "CircuitOpenError";
  }
}

/**
 * Only upstream availability failures should influence a circuit breaker.
 * Invalid credentials/payloads and local configuration/decryption failures are
 * isolated to one job and must not pause delivery for otherwise healthy jobs.
 */
export function shouldRecordCircuitFailure(error: unknown): boolean {
  if (error instanceof CircuitOpenError || !error || typeof error !== "object") {
    return false;
  }

  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const metadata = current as ErrorMetadata;
    const statusCode = statusCodeFromError(metadata);
    if (statusCode !== null) {
      return statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
    }

    const code = typeof metadata.code === "string" ? metadata.code.toUpperCase() : "";
    if (TRANSIENT_NETWORK_CODES.has(code)) return true;

    const message = typeof metadata.message === "string" ? metadata.message.toLowerCase() : "";
    if (
      message.includes("fetch failed") ||
      message.includes("network timeout") ||
      message.includes("socket hang up")
    ) {
      return true;
    }

    current = metadata.cause;
  }

  return false;
}

/**
 * Delivery should be retried for upstream transient failures and while a
 * tenant-scoped circuit is cooling down. CircuitOpenError itself must not
 * increment the breaker counter, but it is still a retryable delivery state.
 */
export function shouldRetryDeliveryFailure(error: unknown): boolean {
  return (
    error instanceof CircuitOpenError ||
    (error instanceof Error && error.name === "EventDeliveryOwnershipError") ||
    shouldRecordCircuitFailure(error)
  );
}

/**
 * Check if the circuit is open for one workspace/destination pair.
 * Returns true if requests should proceed, false if circuit is open.
 * Fails open (returns true) if Redis is unavailable.
 */
export async function isCircuitClosed(
  destination: string,
  workspaceId?: string
): Promise<boolean> {
  try {
    const key = `cb:open:${circuitScope(destination, workspaceId)}`;
    const isOpen = await getSharedRedis().get(key);
    return !isOpen;
  } catch {
    // Fail open — if Redis is down, allow requests through.
    return true;
  }
}

/** Record a successful upstream API call for one workspace/destination pair. */
export async function recordSuccess(
  destination: string,
  workspaceId?: string
): Promise<void> {
  try {
    const scope = circuitScope(destination, workspaceId);
    const failKey = `cb:fails:${scope}`;
    const openKey = `cb:open:${scope}`;
    await getSharedRedis().del(failKey, openKey);
  } catch {
    // Best effort.
  }
}

/** Record a transient upstream failure and open this pair after the threshold. */
export async function recordFailure(
  destination: string,
  workspaceId?: string
): Promise<void> {
  try {
    const redis = getSharedRedis();
    const scope = circuitScope(destination, workspaceId);
    const failKey = `cb:fails:${scope}`;
    const count = await redis.incr(failKey);
    await redis.expire(failKey, COOLDOWN_SECONDS * 2);

    if (count >= FAILURE_THRESHOLD) {
      const openKey = `cb:open:${scope}`;
      await redis.setex(openKey, COOLDOWN_SECONDS, "1");
    }
  } catch {
    // Best effort.
  }
}
