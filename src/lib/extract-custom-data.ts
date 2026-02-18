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

  const numValue = rawValue !== undefined && rawValue !== null ? Number(rawValue) : null;
  const numItems = rawNumItems !== undefined && rawNumItems !== null ? Number(rawNumItems) : null;

  return {
    value: numValue !== null && !isNaN(numValue) ? numValue : null,
    currency: rawCurrency ? String(rawCurrency) : null,
    numItems: numItems !== null && !isNaN(numItems) ? numItems : null,
    orderId: rawOrderId ? String(rawOrderId) : null,
  };
}
