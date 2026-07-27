type PurchaseEventIdInput = {
  workspaceId?: string | null;
  storeId?: string | null;
  shopifyOrderId?: string | number | null;
  orderName?: string | null;
  checkoutToken?: string | null;
  cartToken?: string | null;
  fallbackId?: string | null;
};

export function normalizePurchaseIdentifier(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  let text = String(value).trim();
  if (!text) return null;

  const gidMatch = text.match(/^gid:\/\/shopify\/[^/]+\/([^/?#]+).*$/i);
  if (gidMatch) {
    text = gidMatch[1];
  }

  text = text
    .replace(/^#+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 180);

  return text || null;
}

function randomEventId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `fallback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function buildPurchaseEventId(input: PurchaseEventIdInput): string {
  const scope = normalizePurchaseIdentifier(input.workspaceId ?? input.storeId) ?? "unknown";
  const identifier =
    normalizePurchaseIdentifier(input.orderName) ??
    normalizePurchaseIdentifier(input.shopifyOrderId) ??
    normalizePurchaseIdentifier(input.checkoutToken) ??
    normalizePurchaseIdentifier(input.cartToken);

  if (!identifier) {
    return input.fallbackId?.trim() || randomEventId();
  }

  return `shopify-purchase:${scope}:${identifier}`;
}

/**
 * Billing uses the checkout token before the final order identity because that
 * token is shared by Shopify's checkout_completed event and orders/paid
 * webhook. Delivery IDs remain order-first for destination deduplication, but
 * this correlation key prevents the browser fallback and canonical webhook
 * from consuming two usage units while they race.
 */
export function buildPurchaseBillingIdentityKey(input: PurchaseEventIdInput): string {
  const scope = normalizePurchaseIdentifier(input.workspaceId ?? input.storeId) ?? "unknown";
  const identifier =
    normalizePurchaseIdentifier(input.checkoutToken) ??
    normalizePurchaseIdentifier(input.shopifyOrderId) ??
    normalizePurchaseIdentifier(input.orderName) ??
    normalizePurchaseIdentifier(input.cartToken);
  const fallback = input.fallbackId?.trim();
  return identifier
    ? `shopify-billing:${scope}:${identifier}`
    : fallback || randomEventId();
}

/** Return every stable cross-source alias so billing dedup can match any overlap. */
export function buildPurchaseBillingAliases(input: PurchaseEventIdInput): string[] {
  const aliases = [
    ["checkout", normalizePurchaseIdentifier(input.checkoutToken)],
    ["order", normalizePurchaseIdentifier(input.shopifyOrderId)],
    ["name", normalizePurchaseIdentifier(input.orderName)],
    ["cart", normalizePurchaseIdentifier(input.cartToken)],
  ] as const;
  return Array.from(
    new Set(
      aliases.flatMap(([kind, value]) => (value === null ? [] : [`${kind}:${value}`]))
    )
  );
}

function pickString(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

export function buildPurchaseEventIdFromCustomData(input: {
  workspaceId: string;
  eventId: string;
  customData?: Record<string, unknown> | null;
}): string {
  const customData = input.customData ?? {};

  return buildPurchaseEventId({
    workspaceId: input.workspaceId,
    orderName: pickString(customData, ["orderName", "order_name"]),
    shopifyOrderId: pickString(customData, ["shopifyOrderId", "shopify_order_id", "orderId", "order_id"]),
    checkoutToken: pickString(customData, ["checkoutToken", "checkout_token"]),
    cartToken: pickString(customData, ["cartToken", "cart_token"]),
    fallbackId: input.eventId,
  });
}
