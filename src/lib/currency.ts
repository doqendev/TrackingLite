import { getSharedRedis } from "@/lib/redis";

const EXCHANGE_RATE_TTL = 86400; // 24 hours

/**
 * Convert amount between currencies.
 * Returns 0 if the currency pair is unsupported (safer than inflating).
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
    const cached = await getSharedRedis().get(cacheKey);
    if (cached) {
      return parseFloat(cached);
    }
  } catch {
    // Redis failure: continue to API
  }

  // Try frankfurter.app first (ECB data, ~30 major currencies)
  const rate = await fetchFrankfurter(from, to)
    ?? await fetchOpenExchangeRates(from, to);

  if (!rate || rate <= 0) return 0;

  // Cache the rate
  try {
    await getSharedRedis().setex(cacheKey, EXCHANGE_RATE_TTL, rate.toString());
  } catch {
    // Redis failure: rate still usable
  }

  return rate;
}

/** ECB-based rates via frankfurter.app (~30 currencies, no key) */
async function fetchFrankfurter(
  from: string,
  to: string
): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;

    const data = await res.json();
    const rate = data?.rates?.[to];
    return typeof rate === "number" && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

/** Fallback: open.er-api.com (~170 currencies, no key) */
async function fetchOpenExchangeRates(
  from: string,
  to: string
): Promise<number | null> {
  try {
    const res = await fetch(
      `https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;

    const data = await res.json();
    if (data?.result !== "success") return null;

    const rate = data?.rates?.[to];
    return typeof rate === "number" && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}
