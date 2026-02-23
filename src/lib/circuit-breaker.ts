import { getSharedRedis } from "@/lib/redis";

const FAILURE_THRESHOLD = 5; // consecutive failures to open circuit
const COOLDOWN_SECONDS = 60; // how long circuit stays open

export class CircuitOpenError extends Error {
  constructor(destination: string) {
    super(`Circuit breaker open for ${destination} — destination API appears down`);
    this.name = "CircuitOpenError";
  }
}

/**
 * Check if the circuit is open for a destination.
 * Returns true if requests should proceed, false if circuit is open.
 * Fails open (returns true) if Redis is unavailable.
 */
export async function isCircuitClosed(destination: string): Promise<boolean> {
  try {
    const key = `cb:open:${destination}`;
    const isOpen = await getSharedRedis().get(key);
    return !isOpen;
  } catch {
    // Fail open — if Redis is down, allow requests through
    return true;
  }
}

/**
 * Record a successful API call. Resets the failure counter.
 */
export async function recordSuccess(destination: string): Promise<void> {
  try {
    const failKey = `cb:fails:${destination}`;
    const openKey = `cb:open:${destination}`;
    await getSharedRedis().del(failKey, openKey);
  } catch {
    // Best effort
  }
}

/**
 * Record a failed API call. If failures exceed threshold, opens the circuit.
 */
export async function recordFailure(destination: string): Promise<void> {
  try {
    const redis = getSharedRedis();
    const failKey = `cb:fails:${destination}`;
    const count = await redis.incr(failKey);
    await redis.expire(failKey, COOLDOWN_SECONDS * 2); // auto-cleanup

    if (count >= FAILURE_THRESHOLD) {
      const openKey = `cb:open:${destination}`;
      await redis.setex(openKey, COOLDOWN_SECONDS, "1");
    }
  } catch {
    // Best effort
  }
}
