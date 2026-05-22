type PurchaseEventIdInput = {
  workspaceId?: string | null;
  storeId?: string | null;
  shopifyOrderId?: string | number | null;
  orderName?: string | null;
  checkoutToken?: string | null;
  cartToken?: string | null;
  fallbackId?: string | null;
};

function normalizeSegment(value: unknown): string | null {
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
  const scope = normalizeSegment(input.workspaceId ?? input.storeId) ?? "unknown";
  const identifier =
    normalizeSegment(input.shopifyOrderId) ??
    normalizeSegment(input.orderName) ??
    normalizeSegment(input.checkoutToken) ??
    normalizeSegment(input.cartToken);

  if (!identifier) {
    return input.fallbackId?.trim() || randomEventId();
  }

  return `shopify-purchase:${scope}:${identifier}`;
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
    shopifyOrderId: pickString(customData, ["shopifyOrderId", "shopify_order_id", "orderId", "order_id"]),
    orderName: pickString(customData, ["orderName", "order_name"]),
    checkoutToken: pickString(customData, ["checkoutToken", "checkout_token"]),
    cartToken: pickString(customData, ["cartToken", "cart_token"]),
    fallbackId: input.eventId,
  });
}
