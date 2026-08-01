import type { ConsentMode } from "@prisma/client";

export interface CustomerConsent {
  analytics?: boolean;
  marketing?: boolean;
  preferences?: boolean;
  saleOfData?: boolean;
}

export type DestinationCategory = "analytics" | "marketing";

// Map each destination to its consent category
export const DESTINATION_CONSENT_CATEGORY: Record<string, DestinationCategory> = {
  META: "marketing",
  TIKTOK: "marketing",
  GA4: "analytics",
  KLAVIYO: "marketing",
  REDDIT: "marketing",
  PINTEREST: "marketing",
  GOOGLE_ADS: "marketing",
};

/**
 * Per-destination consent evaluation.
 *
 * Analytics destinations (GA4) check analyticsAllowed.
 * Marketing destinations check marketingAllowed and an explicit sale/sharing opt-out.
 *
 * Backward compatibility:
 * - If marketingAllowed is undefined/null (not explicitly set), treat as allowed.
 * - Only block when marketingAllowed === false.
 * - Same logic for analyticsAllowed in LAX mode.
 * - STRICT mode requires explicit true for the relevant field.
 */
export function shouldSendToDestination(
  consentMode: ConsentMode,
  customerConsent: CustomerConsent | undefined,
  destination: string
): boolean {
  const category = DESTINATION_CONSENT_CATEGORY[destination] ?? "marketing";
  const consentField = category === "analytics"
    ? customerConsent?.analytics
    : customerConsent?.marketing;

  // Shopify models sale/sharing separately from general marketing consent.
  // Keep old clients backward compatible when the field is absent, but an
  // explicit false is authoritative in both STRICT and LAX modes.
  if (category === "marketing" && customerConsent?.saleOfData === false) {
    return false;
  }

  if (consentMode === "LAX") {
    // LAX: block only if explicitly opted out (=== false)
    return consentField !== false;
  }

  // STRICT: require explicit opt-in (=== true) for the relevant field
  return consentField === true;
}

/**
 * @deprecated Use shouldSendToDestination for per-destination checks.
 * Kept for backward compatibility during migration.
 */
export function shouldSendEvent(
  consentMode: ConsentMode,
  customerConsent: CustomerConsent | undefined
): boolean {
  if (consentMode === "LAX") {
    return customerConsent?.analytics !== false;
  }
  return customerConsent?.analytics === true;
}
