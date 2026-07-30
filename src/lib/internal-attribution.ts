import { createHash } from "crypto";
import {
  Destination,
  EventName,
  EventStatus,
  Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";

const MAX_ATTRIBUTION_TEXT_LENGTH = 200;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LONG_NUMERIC_IDENTIFIER_PATTERN = /^\d{12,}$/;
const LONG_OPAQUE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_]{48,}$/;

export interface InternalAttributionInput {
  workspaceId: string;
  eventName: EventName;
  eventId: string;
  dedupKey?: string | null;
  url?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  value?: number | null;
  currency?: string | null;
  numItems?: number | null;
}

export interface SanitizedInternalAttribution {
  eventId: string;
  pageUrl: string | null;
  landingPath: string | null;
  referrerHost: string | null;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  value: number | null;
  currency: string | null;
  numItems: number | null;
  payload: Prisma.InputJsonObject;
}

function sanitizeAttributionText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_ATTRIBUTION_TEXT_LENGTH);
  if (!normalized || EMAIL_PATTERN.test(normalized)) return null;
  return normalized;
}

function normalizeHost(hostname: string): string | null {
  const host = hostname.trim().toLowerCase().replace(/^www\./, "");
  return host && host.length <= 253 ? host : null;
}

function shouldRedactPathSegment(segment: string): boolean {
  return (
    EMAIL_PATTERN.test(segment) ||
    UUID_PATTERN.test(segment) ||
    LONG_NUMERIC_IDENTIFIER_PATTERN.test(segment) ||
    LONG_OPAQUE_IDENTIFIER_PATTERN.test(segment)
  );
}

function sanitizePathname(pathname: string): string {
  const segments = pathname.split("/").map((segment) => {
    if (!segment) return "";
    let decoded = segment;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      // Keep the original segment when it is not valid percent-encoded text.
    }
    if (shouldRedactPathSegment(decoded)) return "redacted";
    return encodeURIComponent(decoded).slice(0, 200);
  });
  const sanitized = segments.join("/");
  return sanitized.startsWith("/") ? sanitized : `/${sanitized}`;
}

function sanitizePageUrl(value: string | null | undefined): {
  pageUrl: string | null;
  landingPath: string | null;
  host: string | null;
} {
  if (typeof value !== "string" || !value.trim()) {
    return { pageUrl: null, landingPath: null, host: null };
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { pageUrl: null, landingPath: null, host: null };
    }
    const landingPath = sanitizePathname(parsed.pathname || "/");
    return {
      pageUrl: `${parsed.origin}${landingPath}`,
      landingPath,
      host: normalizeHost(parsed.hostname),
    };
  } catch {
    if (!value.trim().startsWith("/")) {
      return { pageUrl: null, landingPath: null, host: null };
    }
    const withoutQuery = value.split(/[?#]/, 1)[0];
    const landingPath = sanitizePathname(withoutQuery || "/");
    return { pageUrl: landingPath, landingPath, host: null };
  }
}

function sanitizeReferrerHost(
  value: string | null | undefined,
  landingHost: string | null
): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    const host = normalizeHost(parsed.hostname);
    return host && host !== landingHost ? host : null;
  } catch {
    return null;
  }
}

function finiteNonNegativeNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function finiteNonNegativeInteger(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function sanitizeCurrency(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

export function buildInternalAttributionEventId(input: {
  workspaceId: string;
  eventName: EventName;
  eventId: string;
  dedupKey?: string | null;
}): string {
  const opaqueKey = createHash("sha256")
    .update(`${input.workspaceId}\0${input.eventName}\0${input.dedupKey || input.eventId}`)
    .digest("hex");
  return `internal-attribution:${opaqueKey}`;
}

export function sanitizeInternalAttribution(
  input: InternalAttributionInput
): SanitizedInternalAttribution {
  const page = sanitizePageUrl(input.url);
  const referrerHost = sanitizeReferrerHost(input.referrer, page.host);
  const explicitSource = sanitizeAttributionText(input.utmSource);
  const explicitMedium = sanitizeAttributionText(input.utmMedium);
  const source = explicitSource ?? referrerHost ?? "direct";
  const medium = explicitMedium ?? (referrerHost ? "referral" : "direct");
  const campaign = sanitizeAttributionText(input.utmCampaign);
  const content = sanitizeAttributionText(input.utmContent);
  const term = sanitizeAttributionText(input.utmTerm);

  const payload: Prisma.InputJsonObject = {
    internalOnly: true,
    deliveryAttempted: false,
    consent: {
      analytics: true,
      marketing: false,
    },
    attribution: {
      source,
      medium,
      campaign,
      content,
      term,
      referrerHost,
      landingPath: page.landingPath,
    },
  };

  return {
    eventId: buildInternalAttributionEventId(input),
    pageUrl: page.pageUrl,
    landingPath: page.landingPath,
    referrerHost,
    utmSource: source,
    utmMedium: medium,
    utmCampaign: campaign,
    utmContent: content,
    utmTerm: term,
    value: finiteNonNegativeNumber(input.value),
    currency: sanitizeCurrency(input.currency),
    numItems: finiteNonNegativeInteger(input.numItems),
    payload,
  };
}

export async function persistInternalAttributionEvent(
  input: InternalAttributionInput
) {
  const sanitized = sanitizeInternalAttribution(input);
  const existingExternalEvent = await db.eventLog.findFirst({
    where: {
      workspaceId: input.workspaceId,
      eventId: input.eventId,
      destination: { not: Destination.INTERNAL },
      status: { not: EventStatus.SUPERSEDED },
    },
    select: { id: true },
  });
  if (existingExternalEvent) return existingExternalEvent;

  const reportingData = {
    eventName: input.eventName,
    status: EventStatus.SENT,
    payload: sanitized.payload,
    customerIp: null,
    userAgent: null,
    fbp: null,
    fbc: null,
    pageUrl: sanitized.pageUrl,
    value: sanitized.value,
    currency: sanitized.currency,
    numItems: sanitized.numItems,
    orderId: null,
    orderName: null,
    checkoutToken: null,
    cartToken: null,
    utmSource: sanitized.utmSource,
    utmMedium: sanitized.utmMedium,
    utmCampaign: sanitized.utmCampaign,
    utmContent: sanitized.utmContent,
    utmTerm: sanitized.utmTerm,
    gclid: null,
    ttclid: null,
    rdtCid: null,
    epik: null,
    refundId: null,
    refundAmount: null,
    source: "internal_analytics",
    paymentGateway: null,
    errorMessage: null,
    retryCount: 0,
    retryPayloadEncrypted: null,
    retryPayloadIv: null,
    retryPayloadTag: null,
    retryPayloadExpiresAt: null,
    lastAttemptAt: null,
    nextRetryAt: null,
    deliveryClaimToken: null,
    deliveryClaimOwner: null,
    deliveryClaimedAt: null,
    deliveryClaimExpiresAt: null,
  } satisfies Prisma.EventLogUncheckedUpdateInput;

  return db.eventLog.upsert({
    where: {
      workspaceId_eventId_destination: {
        workspaceId: input.workspaceId,
        eventId: sanitized.eventId,
        destination: Destination.INTERNAL,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      eventId: sanitized.eventId,
      destination: Destination.INTERNAL,
      ...reportingData,
    },
    update: reportingData,
  });
}

export async function supersedeInternalAttributionEvent(input: Pick<
  InternalAttributionInput,
  "workspaceId" | "eventName" | "eventId" | "dedupKey"
>) {
  const eventId = buildInternalAttributionEventId(input);
  return db.eventLog.updateMany({
    where: {
      workspaceId: input.workspaceId,
      eventId,
      destination: Destination.INTERNAL,
      status: { not: EventStatus.SUPERSEDED },
    },
    data: {
      status: EventStatus.SUPERSEDED,
      errorMessage: "Replaced by consented destination delivery",
    },
  });
}
