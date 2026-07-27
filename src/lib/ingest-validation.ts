import { z } from "zod";

const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CONSENT_REVOCATION_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 15 * 60 * 1000;
const MAX_CUSTOM_DATA_DEPTH = 8;
const MAX_CUSTOM_DATA_KEYS = 500;
const MAX_CUSTOM_DATA_ARRAY_ITEMS = 500;
const MAX_CUSTOM_DATA_STRING_LENGTH = 8192;

const CONSENT_REVOCATION_FORBIDDEN_CONTEXT_FIELDS = [
  "fbp",
  "fbc",
  "fbclid",
  "gbraid",
  "wbraid",
  "ttclid",
  "ttp",
  "attributionTimestamp",
  "attributionSource",
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmContent",
  "utmTerm",
  "gclid",
  "rdtCid",
  "epik",
  "gaClientId",
] as const;
const CONSENT_REVOCATION_CUSTOM_DATA_KEYS = new Set([
  "orderId",
  "orderName",
  "checkoutToken",
  "cartToken",
]);

export function isPrivacyMinimizedConsentRevocationEnvelope(
  payload: Record<string, unknown>
): boolean {
  const consent = payload.consent;
  const onlyDestinations = payload.onlyDestinations;
  if (
    !consent ||
    typeof consent !== "object" ||
    !Array.isArray(onlyDestinations) ||
    onlyDestinations.length !== 0 ||
    payload.excludeDestinations !== undefined ||
    payload.url !== "" ||
    payload.referrer !== ""
  ) return false;

  const consentRecord = consent as Record<string, unknown>;
  if (consentRecord.analyticsAllowed !== false && consentRecord.marketingAllowed !== false) {
    return false;
  }
  for (const field of CONSENT_REVOCATION_FORBIDDEN_CONTEXT_FIELDS) {
    const value = payload[field];
    if (value !== undefined && value !== null && value !== "") return false;
  }

  const userData = payload.userData;
  if (
    userData &&
    typeof userData === "object" &&
    Object.values(userData).some((value) => value !== undefined && value !== null && value !== "")
  ) return false;

  const customData = payload.customData;
  if (!customData || typeof customData !== "object" || Array.isArray(customData)) return false;
  const customRecord = customData as Record<string, unknown>;
  if (!Object.keys(customRecord).every((key) => CONSENT_REVOCATION_CUSTOM_DATA_KEYS.has(key))) {
    return false;
  }

  return true;
}

export function isPrivacyMinimizedConsentRevocation(payload: Record<string, unknown>): boolean {
  if (!isPrivacyMinimizedConsentRevocationEnvelope(payload)) return false;
  const customRecord = payload.customData as Record<string, unknown>;

  // Order IDs and names are predictable. The deletion fast path requires an
  // opaque browser/cart/checkout anchor and never treats an order alias alone
  // as authorization to create a tombstone.
  return [
    payload.trackclearSessionId,
    payload.checkoutToken,
    payload.cartToken,
    customRecord.checkoutToken,
    customRecord.cartToken,
  ].some((value) =>
    (typeof value === "string" && value.trim().length > 0) ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

const destinationSchema = z.enum([
  "META",
  "TIKTOK",
  "GA4",
  "KLAVIYO",
  "REDDIT",
  "PINTEREST",
  "GOOGLE_ADS",
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateJsonShape(
  value: unknown,
  path: Array<string | number>,
  issues: z.RefinementCtx,
  depth = 0,
  state = { keys: 0 }
): void {
  if (depth > MAX_CUSTOM_DATA_DEPTH) {
    issues.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: `customData exceeds maximum depth of ${MAX_CUSTOM_DATA_DEPTH}`,
    });
    return;
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    issues.addIssue({ code: z.ZodIssueCode.custom, path, message: "customData numbers must be finite" });
    return;
  }

  if (typeof value === "string" && value.length > MAX_CUSTOM_DATA_STRING_LENGTH) {
    issues.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: `customData strings must be at most ${MAX_CUSTOM_DATA_STRING_LENGTH} characters`,
    });
    return;
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_CUSTOM_DATA_ARRAY_ITEMS) {
      issues.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: `customData arrays must contain at most ${MAX_CUSTOM_DATA_ARRAY_ITEMS} items`,
      });
      return;
    }
    value.forEach((item, index) => validateJsonShape(item, [...path, index], issues, depth + 1, state));
    return;
  }

  if (value !== null && typeof value === "object") {
    if (!isPlainRecord(value)) {
      issues.addIssue({ code: z.ZodIssueCode.custom, path, message: "customData must contain plain JSON objects" });
      return;
    }

    for (const [key, nested] of Object.entries(value)) {
      state.keys += 1;
      if (state.keys > MAX_CUSTOM_DATA_KEYS) {
        issues.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `customData must contain at most ${MAX_CUSTOM_DATA_KEYS} keys`,
        });
        return;
      }
      if (key === "__proto__" || key === "prototype" || key === "constructor") {
        issues.addIssue({ code: z.ZodIssueCode.custom, path: [...path, key], message: "Unsafe customData key" });
        continue;
      }
      validateJsonShape(nested, [...path, key], issues, depth + 1, state);
    }
  }
}

function validateKnownCustomData(
  customData: Record<string, unknown>,
  issues: z.RefinementCtx
): void {
  const value = customData.value;
  if (value !== undefined && value !== null) {
    const isNumericString =
      typeof value === "string" &&
      value.trim() !== "" &&
      /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim());
    const numeric =
      typeof value === "number"
        ? value
        : isNumericString
          ? Number(value.trim())
          : Number.NaN;
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1_000_000_000_000) {
      issues.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customData", "value"],
        message: "value must be a finite non-negative number or numeric string",
      });
    }
  }

  const currency = customData.currency;
  if (
    currency !== undefined &&
    currency !== null &&
    (typeof currency !== "string" || !/^[A-Za-z]{3}$/.test(currency.trim()))
  ) {
    issues.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["customData", "currency"],
      message: "currency must be a three-letter ISO string",
    });
  }

  const rawNumItems = customData.numItems ?? customData.num_items;
  if (rawNumItems !== undefined && rawNumItems !== null) {
    const isIntegerString =
      typeof rawNumItems === "string" && /^\d+$/.test(rawNumItems.trim());
    const numeric =
      typeof rawNumItems === "number"
        ? rawNumItems
        : isIntegerString
          ? Number(rawNumItems.trim())
          : Number.NaN;
    if (!Number.isInteger(numeric) || numeric < 0 || numeric > 10_000) {
      issues.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customData", "numItems"],
        message: "numItems must be an integer or integer string between 0 and 10000",
      });
    }
  }

  for (const key of [
    "orderId",
    "order_id",
    "shopifyOrderId",
    "shopify_order_id",
    "orderName",
    "order_name",
    "checkoutToken",
    "checkout_token",
    "cartToken",
    "cart_token",
  ]) {
    const identifier = customData[key];
    if (
      identifier !== undefined &&
      identifier !== null &&
      !(
        (typeof identifier === "string" && identifier.trim() !== "") ||
        (typeof identifier === "number" && Number.isFinite(identifier))
      )
    ) {
      issues.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customData", key],
        message: `${key} must be a non-empty string or finite number`,
      });
    }
  }
}

const nullableBoundedString = (max: number) => z.string().max(max).nullable().optional();

export const IngestPayloadSchema = z
  .object({
    eventName: z.enum(["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase"]),
    eventId: z
      .string()
      .trim()
      .min(1)
      .max(512)
      .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "eventId contains control characters"),
    timestamp: z.number().finite().positive(),
    url: z.string().max(8192).optional().default(""),
    referrer: z.string().max(8192).optional().default(""),
    fbp: nullableBoundedString(512),
    fbc: nullableBoundedString(2048),
    fbclid: nullableBoundedString(2048),
    gbraid: nullableBoundedString(2048),
    wbraid: nullableBoundedString(2048),
    trackclearSessionId: nullableBoundedString(512),
    checkoutToken: nullableBoundedString(1024),
    cartToken: nullableBoundedString(1024),
    ttclid: nullableBoundedString(2048),
    ttp: nullableBoundedString(512),
    attributionTimestamp: z.number().finite().positive().nullable().optional(),
    attributionSource: nullableBoundedString(100),
    utmSource: nullableBoundedString(1024),
    utmMedium: nullableBoundedString(1024),
    utmCampaign: nullableBoundedString(2048),
    utmContent: nullableBoundedString(2048),
    utmTerm: nullableBoundedString(2048),
    gclid: nullableBoundedString(2048),
    rdtCid: nullableBoundedString(2048),
    epik: nullableBoundedString(2048),
    gaClientId: nullableBoundedString(512),
    consent: z
      .object({
        analyticsAllowed: z.boolean().optional(),
        marketingAllowed: z.boolean().optional(),
      })
      .strict()
      .optional()
      .default({}),
    userData: z
      .object({
        email: nullableBoundedString(254),
        phone: nullableBoundedString(30),
        firstName: nullableBoundedString(100),
        lastName: nullableBoundedString(100),
        city: nullableBoundedString(100),
        state: nullableBoundedString(100),
        zip: nullableBoundedString(20),
        countryCode: nullableBoundedString(10),
        customerId: nullableBoundedString(256),
      })
      .strict()
      .optional()
      .default({}),
    customData: z.record(z.unknown()).optional().default({}),
    onlyDestinations: z.array(destinationSchema).max(7).optional(),
    excludeDestinations: z.array(destinationSchema).max(7).optional(),
  })
  .strict()
  .superRefine((payload, issues) => {
    const now = Date.now();
    const maxEventAge = isPrivacyMinimizedConsentRevocation(
      payload as Record<string, unknown>
    )
      ? MAX_CONSENT_REVOCATION_AGE_MS
      : MAX_EVENT_AGE_MS;
    if (payload.timestamp < now - maxEventAge) {
      issues.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["timestamp"],
        message: maxEventAge === MAX_CONSENT_REVOCATION_AGE_MS
          ? "Consent revocation timestamp is older than the accepted 30-day window"
          : "Event timestamp is older than the accepted seven-day window",
      });
    }
    if (payload.timestamp > now + MAX_FUTURE_SKEW_MS) {
      issues.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["timestamp"],
        message: "Event timestamp is too far in the future",
      });
    }
    if (
      payload.attributionTimestamp !== null &&
      payload.attributionTimestamp !== undefined &&
      (payload.attributionTimestamp < now - 90 * 24 * 60 * 60 * 1000 ||
        payload.attributionTimestamp > now + MAX_FUTURE_SKEW_MS)
    ) {
      issues.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["attributionTimestamp"],
        message: "Attribution timestamp is outside the accepted 90-day window",
      });
    }
    validateJsonShape(payload.customData, ["customData"], issues);
    validateKnownCustomData(payload.customData, issues);
  });

export type ValidatedIngestPayload = z.infer<typeof IngestPayloadSchema>;
