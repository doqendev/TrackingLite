import { synthesizeFbcFromFbclid } from "@/lib/tracking-context";

type UnknownRecord = Record<string, unknown>;

export interface OrderAttribution {
  fbp: string | null;
  fbc: string | null;
  fbclid: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  ttclid: string | null;
  rdtCid: string | null;
  epik: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
}

export interface LandingSiteAttribution extends OrderAttribution {
  fbcFromFbclid: string | null;
  pageUrl: string | null;
}

export function normalizeLandingPageUrl(
  landingSite: string | null | undefined,
  shopDomain: string
): string | null {
  const rawLandingSite = typeof landingSite === "string" ? landingSite.trim() : "";
  if (!rawLandingSite) return null;

  const fallbackUrl = `https://${shopDomain}`;

  try {
    const url = new URL(rawLandingSite, fallbackUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return fallbackUrl;
    }
    return url.toString();
  } catch {
    return fallbackUrl;
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addAttribute(out: Record<string, string>, key: unknown, value: unknown) {
  const attrKey = typeof key === "string" ? key.trim() : "";
  if (!attrKey) return;
  if (value === null || value === undefined) return;

  const attrValue = String(value).trim();
  if (attrValue) out[attrKey] = attrValue;
}

function addAttributesFromSource(out: Record<string, string>, source: unknown) {
  if (Array.isArray(source)) {
    for (const item of source) {
      if (!isRecord(item)) continue;
      addAttribute(out, item.name ?? item.key, item.value);
    }
    return;
  }

  if (!isRecord(source)) return;

  for (const [key, value] of Object.entries(source)) {
    addAttribute(out, key, value);
  }
}

export function extractOrderAttributes(
  orderData: Record<string, unknown>
): Record<string, string> {
  const out: Record<string, string> = {};
  const sources = [
    orderData.note_attributes,
    orderData.attributes,
    orderData.custom_attributes,
    orderData.customAttributes,
    orderData.cart_attributes,
    orderData.cartAttributes,
  ];

  for (const source of sources) {
    addAttributesFromSource(out, source);
  }

  return out;
}

export function readOrderAttribute(
  attrs: Record<string, string>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const direct = attrs[key];
    if (direct) return direct;

    const lowerKey = key.toLowerCase();
    const matched = Object.entries(attrs).find(
      ([attrKey]) => attrKey.toLowerCase() === lowerKey
    );
    if (matched?.[1]) return matched[1];
  }

  return null;
}

export function buildOrderAttribution(
  orderData: Record<string, unknown>,
  now = Date.now()
): OrderAttribution {
  const attrs = extractOrderAttributes(orderData);
  const fbclid = readOrderAttribute(attrs, ["_fbclid", "fbclid"]);
  const fbc =
    readOrderAttribute(attrs, ["_fbc", "fbc"]) ||
    synthesizeFbcFromFbclid(fbclid, now);

  return {
    fbp: readOrderAttribute(attrs, ["_fbp", "fbp"]),
    fbc,
    fbclid,
    gclid: readOrderAttribute(attrs, ["_gclid", "gclid"]),
    gbraid: readOrderAttribute(attrs, ["_gbraid", "gbraid"]),
    wbraid: readOrderAttribute(attrs, ["_wbraid", "wbraid"]),
    ttclid: readOrderAttribute(attrs, ["_ttclid", "ttclid"]),
    rdtCid: readOrderAttribute(attrs, ["_rdt_cid", "rdt_cid", "_rdtCid", "rdtCid"]),
    epik: readOrderAttribute(attrs, ["_epik", "epik"]),
    utmSource: readOrderAttribute(attrs, ["_utm_source", "utm_source"]),
    utmMedium: readOrderAttribute(attrs, ["_utm_medium", "utm_medium"]),
    utmCampaign: readOrderAttribute(attrs, ["_utm_campaign", "utm_campaign"]),
    utmContent: readOrderAttribute(attrs, ["_utm_content", "utm_content"]),
    utmTerm: readOrderAttribute(attrs, ["_utm_term", "utm_term"]),
  };
}

export function extractLandingSiteAttribution(
  landingSite: string | null | undefined,
  shopDomain: string,
  now = Date.now()
): LandingSiteAttribution {
  const pageUrl = normalizeLandingPageUrl(landingSite, shopDomain);
  const empty: LandingSiteAttribution = {
    fbp: null,
    fbc: null,
    fbclid: null,
    fbcFromFbclid: null,
    gclid: null,
    gbraid: null,
    wbraid: null,
    ttclid: null,
    rdtCid: null,
    epik: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    utmTerm: null,
    pageUrl,
  };

  if (!pageUrl) return empty;

  try {
    const url = new URL(pageUrl);
    const fbclid = url.searchParams.get("fbclid");

    return {
      ...empty,
      fbc: url.searchParams.get("fbc"),
      fbclid,
      fbcFromFbclid: synthesizeFbcFromFbclid(fbclid, now),
      gclid: url.searchParams.get("gclid"),
      gbraid: url.searchParams.get("gbraid"),
      wbraid: url.searchParams.get("wbraid"),
      ttclid: url.searchParams.get("ttclid"),
      rdtCid: url.searchParams.get("rdt_cid"),
      epik: url.searchParams.get("epik"),
      utmSource: url.searchParams.get("utm_source"),
      utmMedium: url.searchParams.get("utm_medium"),
      utmCampaign: url.searchParams.get("utm_campaign"),
      utmContent: url.searchParams.get("utm_content"),
      utmTerm: url.searchParams.get("utm_term"),
    };
  } catch {
    return empty;
  }
}

function getNestedValue(source: UnknownRecord, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!isRecord(current)) return undefined;
    return current[segment];
  }, source);
}

function firstStringValue(source: UnknownRecord, paths: string[]): string | null {
  for (const path of paths) {
    const value = getNestedValue(source, path);
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function firstNumberValue(source: UnknownRecord, paths: string[]): number | undefined {
  for (const path of paths) {
    const value = getNestedValue(source, path);
    if (value === null || value === undefined || value === "") continue;
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return undefined;
}

export function canonicalShopifyLineItemId(
  lineItem: Record<string, unknown>
): string | null {
  return firstStringValue(lineItem, [
    "variant_id",
    "variantId",
    "variant.id",
    "variant.admin_graphql_api_id",
    "product_id",
    "productId",
    "sku",
  ]);
}

export function buildLineItemContentIds(
  lineItems: Array<Record<string, unknown>>
): string[] {
  return lineItems
    .map((lineItem) => canonicalShopifyLineItemId(lineItem))
    .filter((id): id is string => !!id);
}

export function buildLineItemContents(
  lineItems: Array<Record<string, unknown>>
): Array<{ id: string; quantity: number; item_price?: number }> {
  return lineItems
    .map((lineItem) => {
      const id = canonicalShopifyLineItemId(lineItem);
      if (!id) return null;

      const quantity = firstNumberValue(lineItem, ["quantity"]) ?? 1;
      const itemPrice = firstNumberValue(lineItem, [
        "price",
        "discounted_price",
        "pre_tax_price",
        "price_set.shop_money.amount",
      ]);

      return {
        id,
        quantity,
        ...(itemPrice !== undefined && { item_price: itemPrice }),
      };
    })
    .filter((item): item is { id: string; quantity: number; item_price?: number } => item !== null);
}
