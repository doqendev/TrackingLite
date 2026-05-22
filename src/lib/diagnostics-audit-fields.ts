export const DIAGNOSTICS_CORE_AUDIT_FIELDS = [
  { key: "value", label: "Value", category: "Transaction" },
  { key: "currency", label: "Currency", category: "Transaction" },
  { key: "orderId", label: "Order ID", category: "Transaction" },
  { key: "numItems", label: "Num Items", category: "Transaction" },
  { key: "fbp", label: "fbp (Meta)", category: "Browser IDs" },
  { key: "pageUrl", label: "Page URL", category: "Context" },
  { key: "customerIp", label: "Customer IP", category: "Context" },
  { key: "userAgent", label: "User Agent", category: "Context" },
] as const;

export const DIAGNOSTICS_OPTIONAL_AUDIT_FIELDS = [
  { key: "fbc", label: "fbc (Meta)", category: "Browser IDs", destinations: ["META"] },
  { key: "ttclid", label: "ttclid (TikTok)", category: "Click IDs", destinations: ["TIKTOK"] },
  { key: "rdtCid", label: "rdtCid (Reddit)", category: "Click IDs", destinations: ["REDDIT"] },
  { key: "epik", label: "epik (Pinterest)", category: "Click IDs", destinations: ["PINTEREST"] },
  { key: "gclid", label: "gclid (Google)", category: "Click IDs", destinations: ["GOOGLE_ADS"] },
  { key: "utmSource", label: "utm_source", category: "UTM" },
  { key: "utmMedium", label: "utm_medium", category: "UTM" },
  { key: "utmCampaign", label: "utm_campaign", category: "UTM" },
  { key: "utmContent", label: "utm_content", category: "UTM" },
  { key: "utmTerm", label: "utm_term", category: "UTM" },
] as const;

export const DIAGNOSTICS_AUDIT_FIELDS = [
  ...DIAGNOSTICS_CORE_AUDIT_FIELDS,
  ...DIAGNOSTICS_OPTIONAL_AUDIT_FIELDS,
] as const;

export type DiagnosticsAuditFieldKey =
  (typeof DIAGNOSTICS_AUDIT_FIELDS)[number]["key"];

export type DiagnosticsAuditField =
  (typeof DIAGNOSTICS_AUDIT_FIELDS)[number];

export type DiagnosticsAuditEntryLike = Partial<
  Record<DiagnosticsAuditFieldKey, unknown>
>;

const OPTIONAL_FIELD_KEYS = new Set<string>(
  DIAGNOSTICS_OPTIONAL_AUDIT_FIELDS.map((field) => field.key)
);
const PURCHASE_ONLY_FIELD_KEYS = new Set<string>(["orderId"]);

function hasCapturedValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

export function getVisibleDiagnosticsAuditFields(
  entry: DiagnosticsAuditEntryLike,
  allowedDestinations: readonly string[],
  eventName = "Purchase"
): DiagnosticsAuditField[] {
  const allowed = new Set(allowedDestinations);

  return DIAGNOSTICS_AUDIT_FIELDS.filter((field) => {
    if (PURCHASE_ONLY_FIELD_KEYS.has(field.key) && eventName !== "Purchase") {
      return hasCapturedValue(entry[field.key]);
    }

    if (!OPTIONAL_FIELD_KEYS.has(field.key)) {
      return true;
    }

    if (!hasCapturedValue(entry[field.key])) {
      return false;
    }

    if ("destinations" in field) {
      return field.destinations.some((destination) => allowed.has(destination));
    }

    return true;
  });
}

export function countPresentDiagnosticsAuditFields(
  entry: DiagnosticsAuditEntryLike,
  fields: readonly DiagnosticsAuditField[]
): number {
  return fields.filter((field) => hasCapturedValue(entry[field.key])).length;
}
