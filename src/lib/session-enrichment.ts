import { getSharedRedis } from "@/lib/redis";
import { hashPii } from "@/lib/hash-pii";
import { createLogger } from "@/lib/logger";

const log = createLogger({ component: "session-enrichment" });

const STALENESS_MS: Record<string, number> = {
  fbp: 4 * 60 * 60 * 1000,
  fbc: 4 * 60 * 60 * 1000,
  ttclid: 4 * 60 * 60 * 1000,
  rdtCid: 4 * 60 * 60 * 1000,
  epik: 4 * 60 * 60 * 1000,
  gaClientId: 4 * 60 * 60 * 1000,
  gbraid: 4 * 60 * 60 * 1000,
  wbraid: 4 * 60 * 60 * 1000,
  clientIp: 4 * 60 * 60 * 1000,
  userAgent: 4 * 60 * 60 * 1000,
  url: 24 * 60 * 60 * 1000,
  utmSource: 24 * 60 * 60 * 1000,
  utmMedium: 24 * 60 * 60 * 1000,
  utmCampaign: 24 * 60 * 60 * 1000,
  utmContent: 24 * 60 * 60 * 1000,
  utmTerm: 24 * 60 * 60 * 1000,
  gclid: 24 * 60 * 60 * 1000,
  "consent:analytics": 24 * 60 * 60 * 1000,
  "consent:marketing": 24 * 60 * 60 * 1000,
};

const SESSION_TTL_SECONDS = 86400;

const BROWSER_FIELDS = [
  "fbp",
  "fbc",
  "ttclid",
  "rdtCid",
  "epik",
  "gaClientId",
  "gbraid",
  "wbraid",
  "clientIp",
  "userAgent",
  "url",
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmContent",
  "utmTerm",
  "gclid",
  "consent:analytics",
  "consent:marketing",
] as const;

export interface SessionIdentifiers {
  email?: string | null;
  trackclearSessionId?: string | null;
  cartToken?: string | null;
  checkoutToken?: string | null;
  orderId?: string | null;
  orderName?: string | null;
}

export interface SessionContextInput {
  fbp?: string | null;
  fbc?: string | null;
  ttclid?: string | null;
  rdtCid?: string | null;
  epik?: string | null;
  gaClientId?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  url?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  gclid?: string | null;
  consent?: { analyticsAllowed?: boolean; marketingAllowed?: boolean };
}

export interface SessionContext {
  fbp?: string;
  fbc?: string;
  ttclid?: string;
  rdtCid?: string;
  epik?: string;
  gaClientId?: string;
  gbraid?: string;
  wbraid?: string;
  clientIp?: string;
  userAgent?: string;
  url?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  gclid?: string;
  consent?: {
    analytics?: boolean;
    marketing?: boolean;
  };
  fieldsEnriched: string[];
  oldestTimestamp: number;
}

function emailSessionKey(workspaceId: string, email: string): string {
  const emailHash = hashPii(email.toLowerCase().trim());
  return `sess:${workspaceId}:${emailHash}`;
}

function normalizedIdentifier(value: string | null | undefined): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function sessionKeyForIdentifier(
  workspaceId: string,
  kind: keyof SessionIdentifiers,
  value: string
): string {
  if (kind === "email") return emailSessionKey(workspaceId, value);
  return `sess:${workspaceId}:${kind}:${hashPii(value)}`;
}

function sessionKeysForIdentifiers(
  workspaceId: string,
  identifiers: SessionIdentifiers
): string[] {
  const entries: Array<[keyof SessionIdentifiers, string | null | undefined]> = [
    ["trackclearSessionId", identifiers.trackclearSessionId],
    ["checkoutToken", identifiers.checkoutToken],
    ["cartToken", identifiers.cartToken],
    ["orderId", identifiers.orderId],
    ["orderName", identifiers.orderName],
    ["email", identifiers.email],
  ];
  const keys = new Set<string>();

  for (const [kind, rawValue] of entries) {
    const value = normalizedIdentifier(rawValue);
    if (!value) continue;
    keys.add(sessionKeyForIdentifier(workspaceId, kind, value));
  }

  return Array.from(keys);
}

function buildFields(context: SessionContextInput, now: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const simple: Array<[string, string | null | undefined]> = [
    ["fbp", context.fbp],
    ["fbc", context.fbc],
    ["ttclid", context.ttclid],
    ["rdtCid", context.rdtCid],
    ["epik", context.epik],
    ["gaClientId", context.gaClientId],
    ["gbraid", context.gbraid],
    ["wbraid", context.wbraid],
    ["clientIp", context.clientIp],
    ["userAgent", context.userAgent],
    ["url", context.url],
    ["utmSource", context.utmSource],
    ["utmMedium", context.utmMedium],
    ["utmCampaign", context.utmCampaign],
    ["utmContent", context.utmContent],
    ["utmTerm", context.utmTerm],
    ["gclid", context.gclid],
  ];

  for (const [field, value] of simple) {
    if (!value) continue;
    fields[field] = value;
    fields[`ts:${field}`] = now;
  }

  if (context.consent?.analyticsAllowed !== undefined) {
    fields["consent:analytics"] = String(context.consent.analyticsAllowed);
    fields["ts:consent:analytics"] = now;
  }
  if (context.consent?.marketingAllowed !== undefined) {
    fields["consent:marketing"] = String(context.consent.marketingAllowed);
    fields["ts:consent:marketing"] = now;
  }

  return fields;
}

export function storeSessionContext(
  workspaceId: string,
  email: string,
  context: SessionContextInput
): void {
  storeSessionContextForIdentifiers(workspaceId, { email }, context);
}

export function storeSessionContextForIdentifiers(
  workspaceId: string,
  identifiers: SessionIdentifiers,
  context: SessionContextInput
): void {
  const keys = sessionKeysForIdentifiers(workspaceId, identifiers);
  if (keys.length === 0) return;

  const fields = buildFields(context, String(Date.now()));
  if (Object.keys(fields).length === 0) return;

  const redis = getSharedRedis();
  Promise.all(
    keys.map((key) =>
      redis.hset(key, fields).then(() => redis.expire(key, SESSION_TTL_SECONDS))
    )
  ).catch((err) => {
    log.error("Failed to store session context", {
      workspaceId,
      keyCount: keys.length,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

export async function lookupSessionContext(
  workspaceId: string,
  email: string
): Promise<SessionContext | null> {
  return lookupSessionContextByIdentifiers(workspaceId, { email });
}

export async function lookupSessionContextByIdentifiers(
  workspaceId: string,
  identifiers: SessionIdentifiers
): Promise<SessionContext | null> {
  try {
    const redis = getSharedRedis();
    const keys = sessionKeysForIdentifiers(workspaceId, identifiers);
    if (keys.length === 0) return null;

    const now = Date.now();
    const result: Record<string, { value: string; ts: number }> = {};
    const enrichedFields = new Set<string>();
    let oldestTs = now;

    for (const key of keys) {
      const data = await redis.hgetall(key);
      if (!data || Object.keys(data).length === 0) continue;

      for (const field of BROWSER_FIELDS) {
        const value = data[field];
        const tsStr = data[`ts:${field}`];
        if (!value || !tsStr) continue;

        const ts = Number(tsStr);
        const maxAge = STALENESS_MS[field] ?? 24 * 60 * 60 * 1000;
        if (now - ts > maxAge) continue;

        if (!result[field] || ts >= result[field].ts) {
          result[field] = { value, ts };
          enrichedFields.add(field);
        }
      }
    }

    if (enrichedFields.size === 0) return null;
    for (const entry of Object.values(result)) {
      if (entry.ts < oldestTs) oldestTs = entry.ts;
    }

    let consent: SessionContext["consent"];
    if (result["consent:analytics"] || result["consent:marketing"]) {
      consent = {};
      if (result["consent:analytics"]) {
        consent.analytics = result["consent:analytics"].value === "true";
      }
      if (result["consent:marketing"]) {
        consent.marketing = result["consent:marketing"].value === "true";
      }
    }

    return {
      fbp: result.fbp?.value,
      fbc: result.fbc?.value,
      ttclid: result.ttclid?.value,
      rdtCid: result.rdtCid?.value,
      epik: result.epik?.value,
      gaClientId: result.gaClientId?.value,
      gbraid: result.gbraid?.value,
      wbraid: result.wbraid?.value,
      clientIp: result.clientIp?.value,
      userAgent: result.userAgent?.value,
      url: result.url?.value,
      utmSource: result.utmSource?.value,
      utmMedium: result.utmMedium?.value,
      utmCampaign: result.utmCampaign?.value,
      utmContent: result.utmContent?.value,
      utmTerm: result.utmTerm?.value,
      gclid: result.gclid?.value,
      consent,
      fieldsEnriched: Array.from(enrichedFields),
      oldestTimestamp: oldestTs,
    };
  } catch (err) {
    log.error("Failed to lookup session context", {
      workspaceId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function deleteWorkspaceSessions(
  workspaceId: string
): Promise<number> {
  try {
    const redis = getSharedRedis();
    const pattern = `sess:${workspaceId}:*`;
    let cursor = "0";
    let deleted = 0;

    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
        deleted += keys.length;
      }
    } while (cursor !== "0");

    return deleted;
  } catch (err) {
    log.error("Failed to delete workspace sessions", {
      workspaceId,
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}
