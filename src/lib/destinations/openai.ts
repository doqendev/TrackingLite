import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { Prisma } from "@prisma/client";
import { DESTINATION_EVENT_MAP } from "@/lib/destinations";
import { isSupportedCountry, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";
import type { DestinationEventJob } from "@/lib/queue";

export const OPENAI_CLICK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const OPENAI_EVENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const API_URL = "https://bzr.openai.com/v1/events";
const currencies = new Set([...Intl.supportedValuesOf("currency"), "CLF", "UYW"]);

export class OpenAIApiError extends Error {
  constructor(message: string, public statusCode: number, public retryAfterMs = 0) {
    super(message);
    this.name = "OpenAIApiError";
  }
}

export interface OpenAIEvent {
  id: string;
  type: string;
  timestamp_ms: number;
  action_source: "web";
  source_url: string;
  oppref?: string;
  user?: Record<string, string | string[]>;
  data: {
    type: "contents";
    amount?: number;
    currency?: string;
    contents?: Array<Record<string, string | number>>;
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function phoneWithCallingCode(value: unknown, countryCode: unknown): string | null {
  const compact = text(value).replace(/[\s().-]/g, "");
  if (!/^\+?[0-9]+$/.test(compact)) return null;
  const country = text(countryCode).toUpperCase();
  const defaultCountry = isSupportedCountry(country) ? country as CountryCode : undefined;
  const international = compact.startsWith("00") ? "+" + compact.slice(2) : compact;
  // Country metadata handles national trunk prefixes without guessing US from
  // length or accidentally adding a calling code twice.
  const parsed = parsePhoneNumberFromString(international, { defaultCountry, extract: false });
  if (!parsed?.isPossible()) return null;
  const digits = parsed.number.replace(/^\+/, "").replace(/^0+/, "");
  return /^[1-9][0-9]{7,14}$/.test(digits) ? digits : null;
}

/** Decimal arithmetic preserves currency precision, including JPY and KWD. */
export function toOpenAIMinorUnits(value: unknown, currency: string): number {
  if (!currencies.has(currency)) throw new OpenAIApiError("Invalid event currency", 400);
  if (typeof value !== "string" && typeof value !== "number") {
    throw new OpenAIApiError("Invalid event amount", 400);
  }
  try {
    const digits = new Intl.NumberFormat("en", { style: "currency", currency })
      .resolvedOptions().maximumFractionDigits;
    const amount = new Prisma.Decimal(value).mul(new Prisma.Decimal(10).pow(digits ?? 2))
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Invalid amount");
    return amount;
  } catch {
    throw new OpenAIApiError("Invalid event amount", 400);
  }
}

export function validOpenAIClick(
  oppref: unknown, capturedAt: unknown, now = Date.now()
): oppref is string {
  return typeof oppref === "string" && oppref.length > 0 && oppref.length <= 2048 &&
    typeof capturedAt === "number" && Number.isFinite(capturedAt) &&
    capturedAt <= now && capturedAt > now - OPENAI_CLICK_TTL_MS;
}

export function normalizeToOpenAIEvent(
  event: DestinationEventJob["event"], now = Date.now()
): OpenAIEvent {
  const type = DESTINATION_EVENT_MAP.OPENAI[event.eventName as keyof typeof DESTINATION_EVENT_MAP.OPENAI];
  if (!type) throw new OpenAIApiError("Unsupported ChatGPT Ads event", 400);
  if (!Number.isInteger(event.timestamp) || event.timestamp < now - OPENAI_EVENT_TTL_MS ||
      event.timestamp > now + 10 * 60 * 1000) {
    throw new OpenAIApiError("Original event time is outside the ChatGPT Ads delivery window", 400);
  }
  let url: URL;
  try { url = new URL(event.url); } catch { throw new OpenAIApiError("Missing absolute event URL", 400); }
  if (!["https:", "http:"].includes(url.protocol)) throw new OpenAIApiError("Invalid event URL", 400);

  const ud = event.userData;
  const user: NonNullable<OpenAIEvent["user"]> = {};
  const email = text(ud.email).toLowerCase();
  if (email) user.emails_sha256 = [hash(email)];
  else if (event.hashedEmail && /^[a-f0-9]{64}$/.test(event.hashedEmail)) user.emails_sha256 = [event.hashedEmail];
  const phone = phoneWithCallingCode(ud.phone, ud.countryCode);
  if (phone) user.phone_numbers_sha256 = [hash(phone)];
  // Historical phone hashes can contain guessed countries or invalid raw input.
  // Only reuse identity whose normalization is known to satisfy this contract.
  const externalId = text(ud.customerId);
  if (externalId) user.external_ids_sha256 = [hash(externalId)];
  for (const [source, target] of [["firstName", "first_names_sha256"], ["lastName", "last_names_sha256"]]) {
    const name = text(ud[source]).toLowerCase().replace(/[\s\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/g, "");
    if (name) user[target] = [hash(name)];
  }
  for (const [source, target] of [["city", "cities"], ["state", "regions"]]) {
    const value = text(ud[source]);
    if (value && value.length <= 128) user[target] = [value];
  }
  const country = text(ud.countryCode).toUpperCase();
  if (/^[A-Z]{2}$/.test(country)) user.countries = [country];
  const zip = text(ud.zip);
  if (/^[A-Za-z0-9 -]{1,32}$/.test(zip)) user.postal_codes = [zip];
  if (isIP(event.clientIp)) user.ip_address = event.clientIp;
  if (event.userAgent.trim()) user.user_agent = event.userAgent;

  const cd = event.customData;
  const data: OpenAIEvent["data"] = { type: "contents" };
  const currency = text(cd.currency).toUpperCase();
  if (cd.value !== undefined && cd.value !== null) {
    data.amount = toOpenAIMinorUnits(cd.value, currency);
    data.currency = currency;
  }
  const ids = cd.contentIds ?? cd.content_ids;
  const items = Array.isArray(cd.contents) ? cd.contents : Array.isArray(ids) ? ids.map(id => ({ id })) : [];
  const contents: NonNullable<OpenAIEvent["data"]["contents"]> = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const id = item.id ?? item.content_id;
    if (typeof id !== "string" && typeof id !== "number") continue;
    const content: Record<string, string | number> = { id: String(id), content_type: "product" };
    const quantity = Number(item.quantity);
    if (Number.isSafeInteger(quantity) && quantity > 0) content.quantity = quantity;
    const price = item.itemPrice ?? item.item_price;
    if (price !== undefined && price !== null && currencies.has(currency)) {
      content.amount = toOpenAIMinorUnits(price, currency);
      content.currency = currency;
    }
    // Do not forward arbitrary item properties or personalized product names.
    contents.push(content);
  }
  if (contents.length) data.contents = contents;
  return {
    id: event.eventId, type, timestamp_ms: event.timestamp,
    action_source: "web", source_url: event.url, data,
    ...(validOpenAIClick(event.oppref, event.opprefCapturedAt, now) ? { oppref: event.oppref } : {}),
    ...(Object.keys(user).length ? { user } : {}),
  };
}

export async function sendToOpenAI(
  pixelId: string, apiKey: string, event: OpenAIEvent, validateOnly = false
): Promise<{ accepted: boolean; validated: boolean; status: number; requestId: string | null }> {
  const response = await fetch(`${API_URL}?pid=${encodeURIComponent(pixelId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ integration_source: "trackclear", validate_only: validateOnly, events: [event] }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const retry = response.headers.get("retry-after");
    const delay = retry ? (/^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()) : 0;
    // Provider errors can echo identity or credentials. Persist only safe metadata.
    throw new OpenAIApiError(`ChatGPT Ads rejected the request (HTTP ${response.status})`, response.status,
      Number.isFinite(delay) ? Math.max(0, Math.min(delay, 24 * 60 * 60 * 1000)) : 0);
  }
  return { accepted: !validateOnly, validated: validateOnly, status: response.status,
    requestId: response.headers.get("x-request-id") };
}
