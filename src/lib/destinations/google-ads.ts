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
  const { conversionId, conversionLabel, value, currency, orderId, gclid, eventName } = params;

  const url = `https://www.googleadservices.com/pagead/conversion/${conversionId}/`;

  // Build form data
  const formData = new URLSearchParams();
  formData.append("label", conversionLabel);
  formData.append("fmt", "3"); // suppress redirect
  if (value !== undefined) formData.append("value", String(value));
  if (currency) formData.append("currency_code", currency);
  if (orderId) formData.append("oid", orderId);
  if (gclid) formData.append("gclid", gclid);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new GoogleAdsError(
      `Google Ads conversion tracking failed: ${response.status}`,
      response.status,
      text
    );
  }

  return {
    status: response.status,
    conversionId,
    label: conversionLabel,
    eventName,
  };
}
