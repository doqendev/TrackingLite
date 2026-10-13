import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { isSupportedCountry, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/core";
import phoneMetadata from "libphonenumber-js/metadata.min.json";
import { DESTINATION_EVENT_MAP } from "@/lib/destinations";
import { getGoogleDataManagerAccessToken, GoogleAuthError } from "@/lib/google-data-manager-auth";
import type { DestinationEventJob } from "@/lib/queue";

export {
  googleAdsDeliveryTargetId, googleAdsTargetForWorkspace,
  normalizeGoogleAdsConversionActionId, normalizeGoogleAdsCustomerId,
} from "@/lib/destinations/google-ads-ids";

/**
 * Google Ads offline click conversions through the Data Manager API.
 *
 * Purchases are sent server side to one "Website (Import from clicks)"
 * conversion action with the Google click ID (gclid, gbraid or wbraid) and
 * normalized, SHA-256 hashed customer data for enhanced matching. The API
 * accepts a request immediately and processes it asynchronously; the request
 * ID is stored and its final status is polled later (see
 * src/lib/google-ads-request-status.ts).
 */
const INGEST_URL = "https://datamanager.googleapis.com/v1/events:ingest";
const STATUS_URL = "https://datamanager.googleapis.com/v1/requestStatus:retrieve";
export const GOOGLE_CLICK_TTL_MS = 90 * 24 * 60 * 60 * 1000;
// Google recommends uploading within a day; clicks older than 90 days and
// conversions far in the past are not attributable anyway.
export const GOOGLE_EVENT_TTL_MS = 60 * 24 * 60 * 60 * 1000;
const TRANSACTION_ID_MAX_LENGTH = 64;
const currencies = new Set([...Intl.supportedValuesOf("currency"), "CLF", "UYW"]);

export class GoogleAdsApiError extends Error {
  constructor(message: string, public statusCode: number, public retryAfterMs = 0) {
    super(message);
    this.name = "GoogleAdsApiError";
  }
}

export interface GoogleAdsTarget {
  customerId: string;
  conversionActionId: string;
  loginCustomerId?: string | null;
}

type ConsentStatus = "CONSENT_GRANTED" | "CONSENT_DENIED";

export interface GoogleUserIdentifier {
  emailAddress?: string;
  phoneNumber?: string;
  address?: { givenName: string; familyName: string; regionCode: string; postalCode: string };
}

export interface GoogleAdsEvent {
  transactionId: string;
  eventTimestamp: string;
  eventSource: "WEB";
  conversionValue?: number;
  currency?: string;
  adIdentifiers?: { gclid?: string; gbraid?: string; wbraid?: string };
  userData?: { userIdentifiers: GoogleUserIdentifier[] };
}

export interface GoogleAdsIngestRequest {
  destinations: Array<{
    operatingAccount: { accountType: "GOOGLE_ADS"; accountId: string };
    loginAccount?: { accountType: "GOOGLE_ADS"; accountId: string };
    productDestinationId: string;
  }>;
  encoding: "HEX";
  consent?: { adUserData?: ConsentStatus; adPersonalization?: ConsentStatus };
  validateOnly: boolean;
  events: GoogleAdsEvent[];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Google's email rule: trim and lowercase; for gmail.com and googlemail.com
 * also remove dots and any +suffix from the local part.
 */
export function normalizeEmailForGoogle(email: unknown): string | null {
  const trimmed = text(email).toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at < 1 || at === trimmed.length - 1 || /\s/.test(trimmed)) return null;
  let local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.split("+")[0].replace(/\./g, "");
    if (!local) return null;
  }
  return `${local}@${domain}`;
}

/** E.164 with the leading plus, as Google requires before hashing. */
export function normalizePhoneForGoogle(value: unknown, countryCode: unknown): string | null {
  const compact = text(value).replace(/[\s().-]/g, "");
  if (!/^\+?[0-9]+$/.test(compact)) return null;
  const country = text(countryCode).toUpperCase();
  // Metadata is passed explicitly for the worker's tsx runtime (see openai.ts).
  const defaultCountry = isSupportedCountry(country as CountryCode, phoneMetadata) ? country as CountryCode : undefined;
  const international = compact.startsWith("00") ? "+" + compact.slice(2) : compact;
  const parsed = parsePhoneNumberFromString(international, { defaultCountry, extract: false }, phoneMetadata);
  if (!parsed?.isPossible()) return null;
  return /^\+[1-9][0-9]{7,14}$/.test(parsed.number) ? parsed.number : null;
}

/** Names: lowercase, no surrounding whitespace, inner spaces kept (Google's rule). */
function normalizeName(value: unknown): string | null {
  const name = text(value).toLowerCase().replace(/\s+/g, " ");
  return name && name.length <= 256 ? name : null;
}

/** Decimal parsing keeps cent precision; Google takes the value in currency units. */
export function toGoogleConversionValue(value: unknown, currency: string): number {
  if (!currencies.has(currency)) throw new GoogleAdsApiError("Invalid event currency", 400);
  if (typeof value !== "string" && typeof value !== "number") {
    throw new GoogleAdsApiError("Invalid event amount", 400);
  }
  try {
    const amount = new Prisma.Decimal(value).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
    if (amount.isNegative() || !amount.isFinite()) throw new Error("Invalid amount");
    return amount.toNumber();
  } catch {
    throw new GoogleAdsApiError("Invalid event amount", 400);
  }
}

function validClickId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512 && /^[A-Za-z0-9_\-.~]+$/.test(value);
}

/**
 * One click identifier per event, in Google's order of preference. A click
 * whose capture time is known to be older than 90 days cannot be attributed
 * and is left out rather than rejected by Google.
 */
export function googleAdIdentifiers(
  event: Pick<DestinationEventJob["event"], "gclid" | "gbraid" | "wbraid" | "googleClickCapturedAt">,
  now = Date.now()
): GoogleAdsEvent["adIdentifiers"] | undefined {
  const capturedAt = event.googleClickCapturedAt;
  if (typeof capturedAt === "number" && Number.isFinite(capturedAt) && capturedAt <= now - GOOGLE_CLICK_TTL_MS) {
    return undefined;
  }
  if (validClickId(event.gclid)) return { gclid: event.gclid };
  if (validClickId(event.gbraid)) return { gbraid: event.gbraid };
  if (validClickId(event.wbraid)) return { wbraid: event.wbraid };
  return undefined;
}

export function googleUserIdentifiers(userData: Record<string, unknown>): GoogleUserIdentifier[] {
  const identifiers: GoogleUserIdentifier[] = [];
  const email = normalizeEmailForGoogle(userData.email);
  if (email) identifiers.push({ emailAddress: sha256(email) });
  const phone = normalizePhoneForGoogle(userData.phone, userData.countryCode);
  if (phone) identifiers.push({ phoneNumber: sha256(phone) });
  // Google requires all four address fields together.
  const givenName = normalizeName(userData.firstName);
  const familyName = normalizeName(userData.lastName);
  const regionCode = text(userData.countryCode).toUpperCase();
  const postalCode = text(userData.zip);
  if (givenName && familyName && /^[A-Z]{2}$/.test(regionCode) && /^[A-Za-z0-9 -]{1,32}$/.test(postalCode)) {
    identifiers.push({
      address: { givenName: sha256(givenName), familyName: sha256(familyName), regionCode, postalCode },
    });
  }
  return identifiers;
}

function transactionIdFor(event: DestinationEventJob["event"]): string {
  const cd = event.customData;
  for (const candidate of [cd.order_id, cd.orderId, event.eventId]) {
    const value = typeof candidate === "number" ? String(candidate) : text(candidate);
    if (value && value.length <= TRANSACTION_ID_MAX_LENGTH) return value;
  }
  throw new GoogleAdsApiError("Missing Google Ads transaction ID", 400);
}

function consentStatus(value: boolean | undefined): ConsentStatus | undefined {
  return value === true ? "CONSENT_GRANTED" : value === false ? "CONSENT_DENIED" : undefined;
}

/**
 * Converts a durable Track Clear Purchase into one Data Manager event.
 * The caller supplies the original occurrence time from the EventLog row.
 */
export function normalizeToGoogleAdsEvent(
  event: DestinationEventJob["event"], now = Date.now()
): GoogleAdsEvent {
  const mapped = DESTINATION_EVENT_MAP.GOOGLE_ADS[event.eventName as keyof typeof DESTINATION_EVENT_MAP.GOOGLE_ADS];
  if (!mapped) throw new GoogleAdsApiError("Unsupported Google Ads event", 400);
  if (!Number.isInteger(event.timestamp) || event.timestamp < now - GOOGLE_EVENT_TTL_MS ||
      event.timestamp > now + 10 * 60 * 1000) {
    throw new GoogleAdsApiError("Original event time is outside the Google Ads delivery window", 400);
  }
  const adIdentifiers = googleAdIdentifiers(event, now);
  const userIdentifiers = googleUserIdentifiers(event.userData);
  if (!adIdentifiers && userIdentifiers.length === 0) {
    throw new GoogleAdsApiError("No Google click ID or customer data to match this order", 400);
  }
  const normalized: GoogleAdsEvent = {
    transactionId: transactionIdFor(event),
    eventTimestamp: new Date(event.timestamp).toISOString(),
    eventSource: "WEB",
  };
  const cd = event.customData;
  const currency = text(cd.currency).toUpperCase();
  if (cd.value !== undefined && cd.value !== null) {
    normalized.conversionValue = toGoogleConversionValue(cd.value, currency);
    normalized.currency = currency;
  }
  if (adIdentifiers) normalized.adIdentifiers = adIdentifiers;
  if (userIdentifiers.length) normalized.userData = { userIdentifiers };
  return normalized;
}

export function buildGoogleAdsIngestRequest(
  target: GoogleAdsTarget,
  event: GoogleAdsEvent,
  consent: DestinationEventJob["event"]["consent"],
  validateOnly = false
): GoogleAdsIngestRequest {
  const adUserData = consentStatus(consent?.marketingAllowed);
  // Personalization also requires that the shopper did not opt out of data sale.
  const adPersonalization = consent?.saleOfDataAllowed === false
    ? "CONSENT_DENIED" : consentStatus(consent?.marketingAllowed);
  const login = target.loginCustomerId && target.loginCustomerId !== target.customerId
    ? { loginAccount: { accountType: "GOOGLE_ADS" as const, accountId: target.loginCustomerId } }
    : {};
  return {
    destinations: [{
      operatingAccount: { accountType: "GOOGLE_ADS", accountId: target.customerId },
      ...login,
      productDestinationId: target.conversionActionId,
    }],
    encoding: "HEX",
    ...(adUserData || adPersonalization ? {
      consent: {
        ...(adUserData ? { adUserData } : {}),
        ...(adPersonalization ? { adPersonalization } : {}),
      },
    } : {}),
    validateOnly,
    events: [event],
  };
}

function retryAfterMs(header: string | null): number {
  if (!header) return 0;
  const delay = /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(delay) ? Math.max(0, Math.min(delay, 24 * 60 * 60 * 1000)) : 0;
}

/** Google error bodies can echo request fields. Keep only the status and reason code. */
async function safeGoogleError(response: Response, action: string): Promise<GoogleAdsApiError> {
  const body = (await response.json().catch(() => null)) as { error?: { status?: unknown } } | null;
  const reason = typeof body?.error?.status === "string" && /^[A-Z_]{1,64}$/.test(body.error.status)
    ? ` ${body.error.status}` : "";
  return new GoogleAdsApiError(
    `Google Ads ${action} rejected (HTTP ${response.status}${reason})`,
    response.status,
    retryAfterMs(response.headers.get("retry-after"))
  );
}

async function authorizedFetch(url: string, init: RequestInit): Promise<Response> {
  let token: string;
  try {
    token = await getGoogleDataManagerAccessToken();
  } catch (error) {
    if (error instanceof GoogleAuthError) {
      throw new GoogleAdsApiError(error.message, error.statusCode, error.retryAfterMs);
    }
    throw error;
  }
  return fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
}

export interface GoogleAdsIngestReceipt {
  accepted: boolean;
  validated: boolean;
  status: number;
  requestId: string | null;
  fieldWarnings: number;
}

export async function sendToGoogleAds(request: GoogleAdsIngestRequest): Promise<GoogleAdsIngestReceipt> {
  const response = await authorizedFetch(INGEST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw await safeGoogleError(response, "conversion upload");
  const body = (await response.json().catch(() => null)) as { requestId?: unknown; fieldWarnings?: unknown } | null;
  const requestId = typeof body?.requestId === "string" && body.requestId ? body.requestId : null;
  if (!request.validateOnly && !requestId) {
    // Without a request ID the outcome cannot be confirmed later.
    throw new GoogleAdsApiError("Google Ads accepted the upload without a request ID", 502);
  }
  return {
    accepted: !request.validateOnly,
    validated: request.validateOnly,
    status: response.status,
    requestId,
    fieldWarnings: Array.isArray(body?.fieldWarnings) ? body.fieldWarnings.length : 0,
  };
}

export type GoogleRequestStatus = "PROCESSING" | "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED" | "UNKNOWN";

export interface GoogleRequestStatusResult {
  status: GoogleRequestStatus;
  recordCount: number | null;
  errors: Array<{ reason: string; recordCount: number }>;
  warnings: Array<{ reason: string; recordCount: number }>;
}

function reasonCounts(value: unknown): Array<{ reason: string; recordCount: number }> {
  if (!value || typeof value !== "object") return [];
  const counts = (value as { errorCounts?: unknown; warningCounts?: unknown }).errorCounts ??
    (value as { warningCounts?: unknown }).warningCounts;
  if (!Array.isArray(counts)) return [];
  return counts.flatMap((entry) => {
    const reason = typeof entry?.reason === "string" && /^[A-Z0-9_]{1,128}$/.test(entry.reason) ? entry.reason : null;
    const recordCount = Number(entry?.recordCount ?? 0);
    return reason ? [{ reason, recordCount: Number.isSafeInteger(recordCount) ? recordCount : 0 }] : [];
  }).slice(0, 10);
}

/**
 * Reads the final processing state of one ingest request. Only enum reasons
 * and counts are kept, never record contents.
 */
export async function retrieveGoogleAdsRequestStatus(requestId: string): Promise<GoogleRequestStatusResult> {
  const response = await authorizedFetch(`${STATUS_URL}?requestId=${encodeURIComponent(requestId)}`, { method: "GET" });
  if (!response.ok) throw await safeGoogleError(response, "status check");
  const body = (await response.json().catch(() => null)) as {
    requestStatusPerDestination?: Array<Record<string, unknown>>;
  } | null;
  const destination = Array.isArray(body?.requestStatusPerDestination) ? body.requestStatusPerDestination[0] : undefined;
  const raw = typeof destination?.requestStatus === "string" ? destination.requestStatus : "";
  const status: GoogleRequestStatus =
    raw === "SUCCESS" || raw === "PARTIAL_SUCCESS" || raw === "FAILED" || raw === "PROCESSING" ? raw : "UNKNOWN";
  const ingestion = destination?.eventsIngestionStatus as { recordCount?: unknown } | undefined;
  const recordCount = Number(ingestion?.recordCount);
  return {
    status,
    recordCount: Number.isSafeInteger(recordCount) ? recordCount : null,
    errors: reasonCounts(destination?.errorInfo),
    warnings: reasonCounts(destination?.warningInfo),
  };
}
