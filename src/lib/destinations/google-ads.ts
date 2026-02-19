import { decrypt, encrypt } from "@/lib/encryption";
import { hashPii } from "@/lib/hash-pii";
import { DESTINATION_EVENT_MAP } from "@/lib/destinations";

const GOOGLE_ADS_API_VERSION = "v18";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface GoogleAdsConversionEvent {
  conversion_action: string;
  conversion_date_time: string; // "yyyy-mm-dd hh:mm:ss+00:00"
  order_id?: string;
  conversion_value?: number;
  currency_code?: string;
  user_identifiers?: Array<{
    hashed_email?: string;
    hashed_phone_number?: string;
    address_info?: {
      hashed_first_name?: string;
      hashed_last_name?: string;
      city?: string;
      state?: string;
      postal_code?: string;
      country_code?: string;
    };
  }>;
}

export class GoogleAdsError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public response: unknown
  ) {
    super(message);
    this.name = "GoogleAdsError";
  }
}

export function normalizeToGoogleAdsEvent(
  eventName: string,
  eventData: {
    eventId: string;
    timestamp: number;
    userData: Record<string, unknown>;
    customData: Record<string, unknown>;
    clientIp: string;
  },
  conversionAction: string
): GoogleAdsConversionEvent | null {
  // Map event name — only AddToCart, InitiateCheckout, Purchase are tracked
  const googleEventName =
    DESTINATION_EVENT_MAP.GOOGLE_ADS[
      eventName as keyof typeof DESTINATION_EVENT_MAP.GOOGLE_ADS
    ];
  if (!googleEventName) return null;

  // Convert timestamp (ms) to Google Ads format: "yyyy-mm-dd hh:mm:ss+00:00"
  const date = new Date(eventData.timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  const conversionDateTime =
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}+00:00`;

  // Build user identifiers
  const userIdentifiers: GoogleAdsConversionEvent["user_identifiers"] = [];
  const ud = eventData.userData;

  if (ud.email && typeof ud.email === "string") {
    const hashed = hashPii(ud.email);
    if (hashed) userIdentifiers.push({ hashed_email: hashed });
  }

  if (ud.phone && typeof ud.phone === "string") {
    const hashed = hashPii(ud.phone);
    if (hashed) userIdentifiers.push({ hashed_phone_number: hashed });
  }

  if (ud.firstName || ud.lastName) {
    const addressInfo: {
      hashed_first_name?: string;
      hashed_last_name?: string;
      city?: string;
      state?: string;
      postal_code?: string;
      country_code?: string;
    } = {};

    if (ud.firstName && typeof ud.firstName === "string") {
      const hashed = hashPii(ud.firstName);
      if (hashed) addressInfo.hashed_first_name = hashed;
    }
    if (ud.lastName && typeof ud.lastName === "string") {
      const hashed = hashPii(ud.lastName);
      if (hashed) addressInfo.hashed_last_name = hashed;
    }
    if (ud.city && typeof ud.city === "string") addressInfo.city = ud.city;
    if (ud.state && typeof ud.state === "string") addressInfo.state = ud.state;
    if (ud.zip && typeof ud.zip === "string") addressInfo.postal_code = ud.zip;
    if (ud.countryCode && typeof ud.countryCode === "string")
      addressInfo.country_code = ud.countryCode;

    if (Object.keys(addressInfo).length > 0) {
      userIdentifiers.push({ address_info: addressInfo });
    }
  }

  const cd = eventData.customData;

  const result: GoogleAdsConversionEvent = {
    conversion_action: conversionAction,
    conversion_date_time: conversionDateTime,
  };

  if (cd.orderId != null) result.order_id = String(cd.orderId);
  if (cd.value !== undefined && cd.value !== null) result.conversion_value = Number(cd.value);
  if (cd.currency) result.currency_code = String(cd.currency);
  if (userIdentifiers.length > 0) result.user_identifiers = userIdentifiers;

  return result;
}

export async function sendToGoogleAds(
  customerId: string,
  accessToken: string,
  developerToken: string,
  conversions: GoogleAdsConversionEvent[]
): Promise<unknown> {
  // Format customer ID (remove dashes if present)
  const formattedCustomerId = customerId.replace(/-/g, "");

  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${formattedCustomerId}:uploadClickConversions`;

  const body = {
    conversions,
    partial_failure: true,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
    },
    body: JSON.stringify(body),
  });

  const result = (await response.json()) as { error?: { message?: string } };

  if (!response.ok) {
    throw new GoogleAdsError(
      result.error?.message ?? "Unknown Google Ads API error",
      response.status,
      result
    );
  }

  return result;
}

export interface RefreshResult {
  accessToken: string;
  encrypted: string;
  iv: string;
  tag: string;
}

export async function refreshGoogleAdsToken(
  refreshToken: string
): Promise<RefreshResult> {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET must be set for token refresh");
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  const result = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !result.access_token) {
    throw new GoogleAdsError(
      result.error_description || result.error || "Token refresh failed",
      response.status,
      result
    );
  }

  // Encrypt the new access token for storage
  const enc = encrypt(result.access_token);

  return {
    accessToken: result.access_token,
    encrypted: enc.encrypted,
    iv: enc.iv,
    tag: enc.tag,
  };
}

