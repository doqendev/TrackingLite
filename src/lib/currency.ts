import IORedis from "ioredis";

let redis: IORedis | null = null;

function getRedis(): IORedis {
  if (!redis) {
    redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      lazyConnect: true,
    });
  }
  return redis;
}

const EXCHANGE_RATE_TTL = 86400; // 24 hours

/**
 * Get the exchange rate from one currency to another.
 * Caches in Redis for 24 hours. Falls back to 1.0 if API fails.
 */
export async function convertCurrency(
  amount: number,
  from: string,
  to: string
): Promise<number> {
  if (from === to) return amount;

  const rate = await getExchangeRate(from, to);
  return amount * rate;
}

export async function getExchangeRate(
  from: string,
  to: string
): Promise<number> {
  if (from === to) return 1;

  const cacheKey = `exchange:${from}:${to}`;

  // Try cache first
  try {
    const cached = await getRedis().get(cacheKey);
    if (cached) {
      return parseFloat(cached);
    }
  } catch {
    // Redis failure: continue to API
  }

  // Fetch from frankfurter.app
  try {
    const res = await fetch(
      `https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!res.ok) {
      return 1;
    }

    const data = await res.json();
    const rate = data?.rates?.[to];

    if (typeof rate !== "number" || rate <= 0) {
      return 1;
    }

    // Cache the rate
    try {
      await getRedis().setex(cacheKey, EXCHANGE_RATE_TTL, rate.toString());
    } catch {
      // Redis failure: rate still usable
    }

    return rate;
  } catch {
    // API failure: return 1.0 (show unconverted rather than error)
    return 1;
  }
}
