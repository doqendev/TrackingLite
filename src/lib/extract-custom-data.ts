/**
 * Extract queryable monetary fields from customData blob.
 * Handles both camelCase (JS snippet) and snake_case (third-party) keys.
 */
export interface ExtractedCustomData {
  value: number | null;
  currency: string | null;
  numItems: number | null;
  orderId: string | null;
}

export function extractCustomData(
  customData: Record<string, unknown> | undefined | null
): ExtractedCustomData {
  if (!customData) {
    return { value: null, currency: null, numItems: null, orderId: null };
  }

  const pick = (camel: string, snake: string): unknown =>
    customData[camel] !== undefined ? customData[camel] : customData[snake];

  const rawValue = pick("value", "value");
  const rawCurrency = pick("currency", "currency");
  const rawNumItems = pick("numItems", "num_items");
  const rawOrderId = pick("orderId", "order_id");

  const finiteNumber = (value: unknown): number | null => {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (
      !trimmed ||
      !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)
    ) {
      return null;
    }
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : null;
  };

  const scalarString = (value: unknown): string | null => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed || null;
    }
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return null;
  };

  const numValue = finiteNumber(rawValue);
  const numItems = finiteNumber(rawNumItems);
  const currency =
    typeof rawCurrency === "string" && /^[A-Za-z]{3}$/.test(rawCurrency.trim())
      ? rawCurrency.trim().toUpperCase()
      : null;

  return {
    value: numValue,
    currency,
    numItems: numItems !== null && Number.isInteger(numItems) ? numItems : null,
    orderId: scalarString(rawOrderId),
  };
}
