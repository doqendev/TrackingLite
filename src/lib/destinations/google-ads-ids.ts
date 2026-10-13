/**
 * Google Ads account and conversion action identifiers. Kept free of
 * dependencies so the ingest path and settings routes can validate them
 * without loading the delivery client.
 */

/** Accepts "123-456-7890" or "1234567890" as shown in Google Ads; returns digits only. */
export function normalizeGoogleAdsCustomerId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.trim().replace(/-/g, "");
  return /^\d{10}$/.test(digits) ? digits : null;
}

/** Conversion action IDs are positive int64 values (the ctId in the Google Ads URL). */
export function normalizeGoogleAdsConversionActionId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.trim();
  if (!/^[1-9]\d{0,18}$/.test(digits)) return null;
  // int64 maximum; decimal strings of equal length compare like numbers.
  return digits.length < 19 || digits <= "9223372036854775807" ? digits : null;
}

/** The EventLog delivery target: a row is only ever sent to the account it was captured for. */
export function googleAdsDeliveryTargetId(customerId: string, conversionActionId: string): string {
  return `${customerId}:${conversionActionId}`;
}

/** Target for a workspace's current configuration, or null when incomplete. */
export function googleAdsTargetForWorkspace(workspace: {
  googleAdsCustomerId?: unknown;
  googleAdsConversionActionId?: unknown;
}): string | null {
  const customerId = normalizeGoogleAdsCustomerId(workspace.googleAdsCustomerId);
  const conversionActionId = normalizeGoogleAdsConversionActionId(workspace.googleAdsConversionActionId);
  return customerId && conversionActionId ? googleAdsDeliveryTargetId(customerId, conversionActionId) : null;
}
