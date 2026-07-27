import { synthesizeFbcFromFbclid } from "@/lib/tracking-context";
import { normalizeContentId, numericShopifyId, type ContentIdOptions } from "@/lib/content-id";

type UnknownRecord = Record<string, unknown>;

export interface OrderAttribution {
  trackclearSessionId: string | null;
  fbp: string | null;
  fbc: string | null;
  fbclid: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  ttclid: string | null;
  ttp: string | null;
  rdtCid: string | null;
  epik: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  landingPage: string | null;
  attributionTimestamp: number | null;
  attributionSource: string | null;
  consentAnalytics: string | null;
  consentMarketing: string | null;
  consentTimestamp: number | null;
  consentSource: string | null;
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

const CONSENT_GRANT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CONSENT_DENIAL_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function boundedConsentTimestamp(
  value: unknown,
  now: number,
  maxAgeMs = CONSENT_GRANT_MAX_AGE_MS
): number | null {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) &&
    timestamp > 0 &&
    timestamp <= now + 5 * 60 * 1000 &&
    now - timestamp <= maxAgeMs
    ? Math.trunc(timestamp)
    : null;
}

function parseConsentValue(value: unknown): boolean | undefined {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return undefined;
}

export function resolveNewestConsentValue({
  cartValue,
  cartTimestamp,
  sessionValue,
  sessionTimestamp,
  now = Date.now(),
}: {
  cartValue?: string | boolean | null;
  cartTimestamp?: number | string | null;
  sessionValue?: boolean;
  sessionTimestamp?: number | null;
  now?: number;
}): boolean | undefined {
  const cart = parseConsentValue(cartValue);
  const cartAt = boundedConsentTimestamp(
    cartTimestamp,
    now,
    cart === false ? CONSENT_DENIAL_MAX_AGE_MS : CONSENT_GRANT_MAX_AGE_MS
  );
  const sessionAt = boundedConsentTimestamp(
    sessionTimestamp,
    now,
    sessionValue === false ? CONSENT_DENIAL_MAX_AGE_MS : CONSENT_GRANT_MAX_AGE_MS
  );

  if (cart !== undefined && cartAt !== null && (sessionAt === null || cartAt >= sessionAt)) {
    return cart;
  }
  if (sessionValue !== undefined && sessionAt !== null) return sessionValue;
  return undefined;
}

export function buildOrderAttribution(
  orderData: Record<string, unknown>,
  now = Date.now()
): OrderAttribution {
  const attrs = extractOrderAttributes(orderData);
  const fbclid = readOrderAttribute(attrs, ["_fbclid", "fbclid"]);
  const rawAttributionTimestamp = readOrderAttribute(attrs, [
    "_tc_attribution_timestamp",
    "tc_attribution_timestamp",
  ]);
  const parsedAttributionTimestamp = Number(rawAttributionTimestamp);
  const attributionTimestamp =
    Number.isFinite(parsedAttributionTimestamp) &&
    parsedAttributionTimestamp > 0 &&
    parsedAttributionTimestamp <= now + 5 * 60 * 1000 &&
    now - parsedAttributionTimestamp <= 30 * 24 * 60 * 60 * 1000
      ? Math.trunc(parsedAttributionTimestamp)
      : null;
  const fbc =
    readOrderAttribute(attrs, ["_fbc", "fbc"]) ||
    // Preserve the real click time for delayed checkouts. Falling back to the
    // webhook receipt time is only for legacy carts without touch metadata.
    synthesizeFbcFromFbclid(fbclid, attributionTimestamp ?? now);
  const consentAnalytics = readOrderAttribute(attrs, ["_tc_consent_analytics", "tc_consent_analytics"]);
  const consentMarketing = readOrderAttribute(attrs, ["_tc_consent_marketing", "tc_consent_marketing"]);
  const hasExplicitDenial = parseConsentValue(consentAnalytics) === false ||
    parseConsentValue(consentMarketing) === false;
  const consentTimestamp = boundedConsentTimestamp(
    readOrderAttribute(attrs, ["_tc_consent_timestamp", "tc_consent_timestamp"]),
    now,
    hasExplicitDenial ? CONSENT_DENIAL_MAX_AGE_MS : CONSENT_GRANT_MAX_AGE_MS
  );

  return {
    trackclearSessionId: readOrderAttribute(attrs, ["_trackclear_session_id", "trackclear_session_id"]),
    fbp: readOrderAttribute(attrs, ["_fbp", "fbp"]),
    fbc,
    fbclid,
    gclid: readOrderAttribute(attrs, ["_gclid", "gclid"]),
    gbraid: readOrderAttribute(attrs, ["_gbraid", "gbraid"]),
    wbraid: readOrderAttribute(attrs, ["_wbraid", "wbraid"]),
    ttclid: readOrderAttribute(attrs, ["_ttclid", "ttclid"]),
    ttp: readOrderAttribute(attrs, ["_ttp", "ttp"]),
    rdtCid: readOrderAttribute(attrs, ["_rdt_cid", "rdt_cid", "_rdtCid", "rdtCid"]),
    epik: readOrderAttribute(attrs, ["_epik", "epik"]),
    utmSource: readOrderAttribute(attrs, ["_utm_source", "utm_source"]),
    utmMedium: readOrderAttribute(attrs, ["_utm_medium", "utm_medium"]),
    utmCampaign: readOrderAttribute(attrs, ["_utm_campaign", "utm_campaign"]),
    utmContent: readOrderAttribute(attrs, ["_utm_content", "utm_content"]),
    utmTerm: readOrderAttribute(attrs, ["_utm_term", "utm_term"]),
    landingPage: readOrderAttribute(attrs, ["_landing_page", "landing_page"]),
    attributionTimestamp,
    attributionSource: attributionTimestamp
      ? readOrderAttribute(attrs, ["_tc_attribution_source", "tc_attribution_source"])
      : null,
    consentAnalytics,
    consentMarketing,
    consentTimestamp,
    consentSource: readOrderAttribute(attrs, ["_tc_consent_source", "tc_consent_source"]),
  };
}

export function extractLandingSiteAttribution(
  landingSite: string | null | undefined,
  shopDomain: string,
  now = Date.now()
): LandingSiteAttribution {
  const pageUrl = normalizeLandingPageUrl(landingSite, shopDomain);
  const empty: LandingSiteAttribution = {
    trackclearSessionId: null,
    fbp: null,
    fbc: null,
    fbclid: null,
    fbcFromFbclid: null,
    gclid: null,
    gbraid: null,
    wbraid: null,
    ttclid: null,
    ttp: null,
    rdtCid: null,
    epik: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    utmTerm: null,
    landingPage: null,
    attributionTimestamp: null,
    attributionSource: null,
    consentAnalytics: null,
    consentMarketing: null,
    consentTimestamp: null,
    consentSource: null,
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
  lineItem: Record<string, unknown>,
  options: ContentIdOptions = {}
): string | null {
  return normalizeContentId(
    {
      variantId:
        firstStringValue(lineItem, ["variant_id", "variantId"]) ??
        numericShopifyId(firstStringValue(lineItem, ["variant.id", "variant.admin_graphql_api_id"])),
      productId:
        firstStringValue(lineItem, ["product_id", "productId"]) ??
        numericShopifyId(firstStringValue(lineItem, ["product.id", "product.admin_graphql_api_id"])),
      variantGraphqlId: firstStringValue(lineItem, ["variant.admin_graphql_api_id", "variant.graphqlId"]),
      productGraphqlId: firstStringValue(lineItem, ["product.admin_graphql_api_id", "product.graphqlId"]),
      sku: firstStringValue(lineItem, ["sku", "variant.sku"]),
    },
    options
  );
}

export function buildLineItemContentIds(
  lineItems: Array<Record<string, unknown>>,
  options: ContentIdOptions = {}
): string[] {
  return lineItems
    .map((lineItem) => canonicalShopifyLineItemId(lineItem, options))
    .filter((id): id is string => !!id);
}

export function buildLineItemContents(
  lineItems: Array<Record<string, unknown>>,
  options: ContentIdOptions = {}
): Array<{ id: string; quantity: number; item_price?: number }> {
  return lineItems
    .map((lineItem) => {
      const id = canonicalShopifyLineItemId(lineItem, options);
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
