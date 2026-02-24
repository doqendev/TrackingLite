import { getSharedRedis } from "@/lib/redis";
import { hashPii } from "@/lib/hash-pii";
import { createLogger } from "@/lib/logger";

const log = createLogger({ component: "session-enrichment" });

// Per-field staleness limits (milliseconds)
const STALENESS_MS: Record<string, number> = {
  // Click IDs + IP/UA: 4 hours
  fbp: 4 * 60 * 60 * 1000,
  fbc: 4 * 60 * 60 * 1000,
  ttclid: 4 * 60 * 60 * 1000,
  rdtCid: 4 * 60 * 60 * 1000,
  epik: 4 * 60 * 60 * 1000,
  clientIp: 4 * 60 * 60 * 1000,
  userAgent: 4 * 60 * 60 * 1000,
  // UTMs + URL + consent: 24 hours
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

const SESSION_TTL_SECONDS = 86400; // 24 hours

const BROWSER_FIELDS = [
  "fbp", "fbc", "ttclid", "rdtCid", "epik",
  "clientIp", "userAgent", "url",
  "utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm", "gclid",
  "consent:analytics", "consent:marketing",
] as const;

export interface SessionContext {
  fbp?: string;
  fbc?: string;
  ttclid?: string;
  rdtCid?: string;
  epik?: string;
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

function sessionKey(workspaceId: string, email: string): string {
  const emailHash = hashPii(email.toLowerCase().trim());
  return `sess:${workspaceId}:${emailHash}`;
}

/**
 * Store browser context from a snippet event, keyed by hashed email.
 * Fire-and-forget — never blocks the caller.
 */
export function storeSessionContext(
  workspaceId: string,
  email: string,
  context: {
    fbp?: string | null;
    fbc?: string | null;
    ttclid?: string | null;
    rdtCid?: string | null;
    epik?: string | null;
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
): void {
  const key = sessionKey(workspaceId, email);
  const now = String(Date.now());
  const fields: Record<string, string> = {};

  // Only store non-null, non-empty values
  const simple: Array<[string, string | null | undefined]> = [
    ["fbp", context.fbp],
    ["fbc", context.fbc],
    ["ttclid", context.ttclid],
    ["rdtCid", context.rdtCid],
    ["epik", context.epik],
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
    if (value) {
      fields[field] = value;
      fields[`ts:${field}`] = now;
    }
  }

  // Store consent signals
  if (context.consent?.analyticsAllowed !== undefined) {
    fields["consent:analytics"] = String(context.consent.analyticsAllowed);
    fields["ts:consent:analytics"] = now;
  }
  if (context.consent?.marketingAllowed !== undefined) {
    fields["consent:marketing"] = String(context.consent.marketingAllowed);
    fields["ts:consent:marketing"] = now;
  }

  if (Object.keys(fields).length === 0) return;

  // Fire-and-forget
  const redis = getSharedRedis();
  redis
    .hset(key, fields)
    .then(() => redis.expire(key, SESSION_TTL_SECONDS))
    .catch((err) => {
      log.error("Failed to store session context", {
        workspaceId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
}

/**
 * Look up stored session context for a customer email.
 * Applies per-field staleness rules. Returns null if no usable data.
 */
export async function lookupSessionContext(
  workspaceId: string,
  email: string
): Promise<SessionContext | null> {
  try {
    const redis = getSharedRedis();
    const key = sessionKey(workspaceId, email);
    const data = await redis.hgetall(key);

    if (!data || Object.keys(data).length === 0) return null;

    const now = Date.now();
    const result: Record<string, string> = {};
    const enrichedFields: string[] = [];
    let oldestTs = now;

    for (const field of BROWSER_FIELDS) {
      const value = data[field];
      const tsStr = data[`ts:${field}`];
      if (!value || !tsStr) continue;

      const ts = Number(tsStr);
      const maxAge = STALENESS_MS[field] ?? 24 * 60 * 60 * 1000;

      if (now - ts <= maxAge) {
        result[field] = value;
        enrichedFields.push(field);
        if (ts < oldestTs) oldestTs = ts;
      }
    }

    if (enrichedFields.length === 0) return null;

    // Build consent object
    let consent: SessionContext["consent"];
    if (result["consent:analytics"] || result["consent:marketing"]) {
      consent = {};
      if (result["consent:analytics"]) {
        consent.analytics = result["consent:analytics"] === "true";
      }
      if (result["consent:marketing"]) {
        consent.marketing = result["consent:marketing"] === "true";
      }
    }

    return {
      fbp: result.fbp,
      fbc: result.fbc,
      ttclid: result.ttclid,
      rdtCid: result.rdtCid,
      epik: result.epik,
      clientIp: result.clientIp,
      userAgent: result.userAgent,
      url: result.url,
      utmSource: result.utmSource,
      utmMedium: result.utmMedium,
      utmCampaign: result.utmCampaign,
      utmContent: result.utmContent,
      utmTerm: result.utmTerm,
      gclid: result.gclid,
      consent,
      fieldsEnriched: enrichedFields,
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

/**
 * Delete all session keys for a workspace (GDPR account deletion).
 */
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
