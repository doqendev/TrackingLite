export class GoogleAdsError extends Error {
  constructor(message: string, public statusCode: number, public response: unknown) {
    super(message);
    this.name = "GoogleAdsError";
  }
}

// Map event names to the label field name on the credentials object
const EVENT_LABEL_MAP: Record<string, string> = {
  ViewContent: "viewContentLabel",
  AddToCart: "addToCartLabel",
  InitiateCheckout: "checkoutLabel",
  Purchase: "purchaseLabel",
};

export function getConversionLabel(
  eventName: string,
  credentials: Record<string, string>
): string | null {
  const key = EVENT_LABEL_MAP[eventName];
  if (!key) return null;
  return credentials[key] || null;
}

export async function sendGoogleAdsConversion(params: {
  conversionId: string;
  conversionLabel: string;
  value?: number;
  currency?: string;
  orderId?: string;
  gclid?: string;
  eventName?: string;
}): Promise<unknown> {
  const { conversionLabel, value, currency, orderId, gclid, eventName } = params;

  // Strip AW- prefix if present (users often copy the full tag format)
  const numericId = params.conversionId.replace(/^AW-/i, "");

  const url = new URL(`https://www.googleadservices.com/pagead/conversion/${encodeURIComponent(numericId)}/`);
  url.searchParams.set("label", conversionLabel);
  url.searchParams.set("fmt", "3"); // suppress redirect, return minimal response
  url.searchParams.set("random", String(Date.now())); // cache buster
  url.searchParams.set("script", "0"); // indicates non-browser environment
  if (value !== undefined) url.searchParams.set("value", String(value));
  if (currency) url.searchParams.set("currency_code", currency);
  if (orderId) url.searchParams.set("oid", orderId);
  if (gclid) url.searchParams.set("gclid", gclid);

  const finalUrl = url.toString();
  console.log(`[GoogleAds] Sending conversion: id=${numericId.slice(0, 4)}**** label=${conversionLabel.slice(0, 6)}**** event=${eventName} url_length=${finalUrl.length}`);

  const response = await fetch(finalUrl, {
    method: "GET",
    headers: {
      "User-Agent": "TrackClear/1.0 (Server-Side Conversion Tracking)",
    },
    signal: AbortSignal.timeout(30000),
  });

  const responseText = await response.text().catch(() => "");

  console.log(`[GoogleAds] Response: status=${response.status} body_length=${responseText.length} event=${eventName}`);

  if (!response.ok) {
    console.error(`[GoogleAds] FAILED: status=${response.status} body=${responseText.slice(0, 200)}`);
    throw new GoogleAdsError(
      `HTTP ${response.status}: ${responseText.slice(0, 200) || "No response body"}`,
      response.status,
      responseText
    );
  }

  return {
    status: response.status,
    conversionId: numericId,
    label: conversionLabel,
    eventName,
  };
}
