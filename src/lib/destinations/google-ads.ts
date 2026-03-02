import { hashPii, hashPhonePii } from "@/lib/hash-pii";
import { DESTINATION_EVENT_MAP } from "@/lib/destinations";

const GOOGLE_ADS_CONVERSION_BASE =
  "https://www.googleadservices.com/pagead/conversion";

export class GoogleAdsApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public response: unknown
  ) {
    super(message);
    this.name = "GoogleAdsApiError";
  }
}

/**
 * Normalize an email for Google Enhanced Conversions:
 * - lowercase, trim
 * - For Gmail addresses: strip dots and +suffix from local part
 */
export function normalizeEmailForGoogle(
  email: string | undefined | null
): string | undefined {
  if (!email) return undefined;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return undefined;

  const atIndex = trimmed.indexOf("@");
  if (atIndex === -1) return trimmed;

  let local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);

  // Google-specific: strip dots and +suffix for Gmail/Googlemail
  if (domain === "gmail.com" || domain === "googlemail.com") {
    // Remove +suffix
    const plusIndex = local.indexOf("+");
    if (plusIndex !== -1) {
      local = local.slice(0, plusIndex);
    }
    // Remove dots
    local = local.replace(/\./g, "");
  }

  return `${local}@${domain}`;
}

/**
 * Build the Enhanced Conversions `em` parameter value.
 * Format: tv.1~em.{sha256}~ph.{sha256}~fn.{sha256}~ln.{sha256}~ct.{sha256}~st.{sha256}~zp.{sha256}~co.{sha256}
 */
function buildEnhancedConversionsParam(
  userData: Record<string, unknown>
): string | undefined {
  const parts: string[] = ["tv.1"];

  const normalizedEmail = normalizeEmailForGoogle(
    userData.email as string | undefined
  );
  const emHash = normalizedEmail ? hashPii(normalizedEmail) : undefined;
  if (emHash) parts.push(`em.${emHash}`);

  const phHash = hashPhonePii(
    userData.phone as string | undefined,
    userData.countryCode as string | undefined
  );
  if (phHash) parts.push(`ph.${phHash}`);

  const fnHash = hashPii(userData.firstName as string | undefined);
  if (fnHash) parts.push(`fn.${fnHash}`);

  const lnHash = hashPii(userData.lastName as string | undefined);
  if (lnHash) parts.push(`ln.${lnHash}`);

  const ctHash = hashPii(userData.city as string | undefined);
  if (ctHash) parts.push(`ct.${ctHash}`);

  const stHash = hashPii(userData.state as string | undefined);
  if (stHash) parts.push(`st.${stHash}`);

  const zpHash = hashPii(userData.zip as string | undefined);
  if (zpHash) parts.push(`zp.${zpHash}`);

  const coHash = hashPii(userData.countryCode as string | undefined);
  if (coHash) parts.push(`co.${coHash}`);

  // Only return if we have at least one hashed field beyond the version
  return parts.length > 1 ? parts.join("~") : undefined;
}

export interface GoogleAdsConversionParams {
  conversionId: string;
  label: string;
  value?: number;
  currencyCode?: string;
  orderId?: string;
  gclid?: string;
  em?: string; // Enhanced Conversions param
}

/**
 * Build the query parameters for a Google Ads server-side conversion pixel.
 * Returns null if the event type is not supported or no label is configured.
 */
export function normalizeToGoogleAdsParams(
  eventName: string,
  eventData: {
    eventId: string;
    timestamp: number;
    url: string;
    referrer: string;
    userData: Record<string, unknown>;
    customData: Record<string, unknown>;
    clientIp: string;
    userAgent: string;
    gclid?: string | null;
  },
  workspaceConfig: {
    googleAdsConversionId: string;
    googleAdsLabelPurchase?: string | null;
    googleAdsLabelAddToCart?: string | null;
    googleAdsLabelInitiateCheckout?: string | null;
    googleAdsLabelViewContent?: string | null;
  }
): GoogleAdsConversionParams | null {
  // Check if event type is supported
  const googleEventName =
    DESTINATION_EVENT_MAP.GOOGLE_ADS[
      eventName as keyof typeof DESTINATION_EVENT_MAP.GOOGLE_ADS
    ];
  if (!googleEventName) return null;

  // Map event to its label
  const labelMap: Record<string, string | null | undefined> = {
    Purchase: workspaceConfig.googleAdsLabelPurchase,
    AddToCart: workspaceConfig.googleAdsLabelAddToCart,
    InitiateCheckout: workspaceConfig.googleAdsLabelInitiateCheckout,
    ViewContent: workspaceConfig.googleAdsLabelViewContent,
  };

  const label = labelMap[eventName];
  if (!label) return null;

  const cd = eventData.customData;
  const params: GoogleAdsConversionParams = {
    conversionId: workspaceConfig.googleAdsConversionId,
    label,
  };

  if (cd.value !== undefined && cd.value !== null) {
    params.value = Number(cd.value);
  }
  if (cd.currency) {
    params.currencyCode = String(cd.currency);
  }

  const orderId = cd.orderId ?? cd.order_id;
  if (orderId) {
    params.orderId = String(orderId);
  }

  if (eventData.gclid) {
    params.gclid = eventData.gclid;
  }

  // Build Enhanced Conversions param
  const em = buildEnhancedConversionsParam(eventData.userData);
  if (em) {
    params.em = em;
  }

  return params;
}

/**
 * Fire a server-side GET request to the Google Ads conversion pixel endpoint.
 * This is a fire-and-forget pixel ping -- Google returns 200 or 302.
 */
export async function sendToGoogleAds(
  params: GoogleAdsConversionParams
): Promise<{ status: number; redirected: boolean }> {
  const url = new URL(
    `${GOOGLE_ADS_CONVERSION_BASE}/${encodeURIComponent(params.conversionId)}/`
  );

  url.searchParams.set("label", params.label);
  url.searchParams.set("guid", "ON");
  url.searchParams.set("script", "0");

  if (params.value !== undefined) {
    url.searchParams.set("value", String(params.value));
  }
  if (params.currencyCode) {
    url.searchParams.set("currency_code", params.currencyCode);
  }
  if (params.orderId) {
    url.searchParams.set("oid", params.orderId);
  }
  if (params.gclid) {
    url.searchParams.set("gclid", params.gclid);
  }
  if (params.em) {
    url.searchParams.set("em", params.em);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
  });

  // Google returns 200 or 302 (redirect to a 1x1 gif).
  // Any 4xx/5xx is an error.
  if (response.status >= 400) {
    const body = await response.text().catch(() => "");
    throw new GoogleAdsApiError(
      `HTTP ${response.status}`,
      response.status,
      body
    );
  }

  return { status: response.status, redirected: response.redirected };
}
