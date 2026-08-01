import { getSharedRedis } from "@/lib/redis";
import { hashPii } from "@/lib/hash-pii";
import { createLogger } from "@/lib/logger";

const log = createLogger({ component: "session-enrichment" });

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const STALENESS_MS: Record<string, number> = {
  // Click/browser identifiers need to survive delayed and returning checkouts.
  // Thirty days covers the longest normal paid-media attribution window without
  // retaining identity context indefinitely.
  fbp: 30 * DAY_MS,
  fbc: 30 * DAY_MS,
  ttclid: 30 * DAY_MS,
  ttp: 30 * DAY_MS,
  rdtCid: 30 * DAY_MS,
  epik: 30 * DAY_MS,
  gaClientId: 30 * DAY_MS,
  gbraid: 30 * DAY_MS,
  wbraid: 30 * DAY_MS,
  clientIp: 7 * DAY_MS,
  userAgent: 7 * DAY_MS,
  url: 30 * DAY_MS,
  utmSource: 30 * DAY_MS,
  utmMedium: 30 * DAY_MS,
  utmCampaign: 30 * DAY_MS,
  utmContent: 30 * DAY_MS,
  utmTerm: 30 * DAY_MS,
  gclid: 30 * DAY_MS,
  attributionTimestamp: 30 * DAY_MS,
  attributionSource: 30 * DAY_MS,
  // Grants are intentionally short-lived; a fresh Shopify snapshot should
  // replace them. Explicit denials are handled separately during lookup and
  // remain authoritative for the full session-context lifetime.
  "consent:analytics": DAY_MS,
  "consent:marketing": DAY_MS,
  "consent:saleOfData": DAY_MS,
};

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const CONSENT_DENIAL_STALENESS_MS = SESSION_TTL_SECONDS * 1000;
const SESSION_ALIAS_FIELD_PREFIX = "alias:";
const MAX_LINKED_SESSION_KEYS = 24;

const MARKETING_CONTEXT_FIELDS = [
  "fbp",
  "fbc",
  "ttclid",
  "ttp",
  "rdtCid",
  "epik",
  "gbraid",
  "wbraid",
  "gclid",
] as const;
const ANALYTICS_CONTEXT_FIELDS = ["gaClientId"] as const;
const SHARED_CONTEXT_FIELDS = [
  "clientIp",
  "userAgent",
  "url",
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmContent",
  "utmTerm",
  "attributionTimestamp",
  "attributionSource",
] as const;
const MARKETING_CLEARED_AT_FIELD = "cleared:marketing";
const SALE_OF_DATA_CLEARED_AT_FIELD = "cleared:saleOfData";
const ANALYTICS_CLEARED_AT_FIELD = "cleared:analytics";
const SHARED_CLEARED_AT_FIELD = "cleared:shared";

const BROWSER_FIELDS = [
  "fbp",
  "fbc",
  "ttclid",
  "ttp",
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
  "attributionTimestamp",
  "attributionSource",
  "consent:analytics",
  "consent:marketing",
  "consent:saleOfData",
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
  ttp?: string | null;
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
  attributionTimestamp?: number | null;
  attributionSource?: string | null;
  /** Event occurrence time. Delayed requests must not refresh stored identity or consent. */
  observedAt?: number | null;
  consent?: {
    analyticsAllowed?: boolean;
    marketingAllowed?: boolean;
    saleOfDataAllowed?: boolean;
  };
}

export interface SessionContext {
  fbp?: string;
  fbc?: string;
  ttclid?: string;
  ttp?: string;
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
  attributionTimestamp?: number;
  attributionSource?: string;
  consent?: {
    analytics?: boolean;
    marketing?: boolean;
    saleOfData?: boolean;
  };
  consentTimestamps?: {
    analytics?: number;
    marketing?: number;
    saleOfData?: number;
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

interface TimestampedSessionField {
  value: string;
  timestamp: number;
}

const TOUCH_SCOPED_FIELDS = new Set([
  "fbc",
  "ttclid",
  "rdtCid",
  "epik",
  "gbraid",
  "wbraid",
  "gclid",
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmContent",
  "utmTerm",
]);

const UPSERT_FIELDS_IF_NEWER_SCRIPT = `
local entries = cjson.decode(ARGV[1])
for field, entry in pairs(entries) do
  local incoming = tonumber(entry.timestamp)
  local existing = tonumber(redis.call("HGET", KEYS[1], "ts:" .. field))
  if incoming and (not existing or incoming >= existing) then
    redis.call("HSET", KEYS[1], field, tostring(entry.value), "ts:" .. field, tostring(incoming))
  end
end
local aliases = cjson.decode(ARGV[3])
local aliasNow = tonumber(ARGV[4])
for _, alias in ipairs(aliases) do
  if alias ~= KEYS[1] then
    redis.call("HSET", KEYS[1], "alias:" .. alias, tostring(aliasNow))
  end
end
local aliasEntries = {}
local stored = redis.call("HGETALL", KEYS[1])
for i = 1, #stored, 2 do
  local field = stored[i]
  if string.sub(field, 1, 6) == "alias:" then
    local seenAt = tonumber(stored[i + 1]) or 0
    if not aliasNow or seenAt < aliasNow - (tonumber(ARGV[2]) * 1000) then
      redis.call("HDEL", KEYS[1], field)
    else
      table.insert(aliasEntries, { field = field, seenAt = seenAt })
    end
  end
end
table.sort(aliasEntries, function(a, b) return a.seenAt > b.seenAt end)
for i = tonumber(ARGV[5]) + 1, #aliasEntries do
  redis.call("HDEL", KEYS[1], aliasEntries[i].field)
end
redis.call("EXPIRE", KEYS[1], tonumber(ARGV[2]))
return 1
`;

const CLEAR_FIELDS_IF_NOT_NEWER_SCRIPT = `
local categories = cjson.decode(ARGV[1])
for _, key in ipairs(KEYS) do
  for _, category in ipairs(categories) do
    local incoming = tonumber(category.timestamp)
    local existingClear = tonumber(redis.call("HGET", key, category.tombstone))
    if incoming and (not existingClear or incoming >= existingClear) then
      redis.call("HSET", key, category.tombstone, tostring(incoming), "ts:" .. category.tombstone, tostring(incoming))
      if category.consentField then
        local existingConsent = tonumber(redis.call("HGET", key, "ts:" .. category.consentField))
        if not existingConsent or incoming >= existingConsent then
          redis.call("HSET", key, category.consentField, "false", "ts:" .. category.consentField, tostring(incoming))
        end
      end
      for _, field in ipairs(category.fields) do
        local fieldTimestamp = tonumber(redis.call("HGET", key, "ts:" .. field))
        if not fieldTimestamp or fieldTimestamp <= incoming then
          redis.call("HDEL", key, field, "ts:" .. field)
        end
      end
    end
  end
  redis.call("EXPIRE", key, tonumber(ARGV[2]))
end
return #KEYS
`;

function boundedTimestamp(value: number | null | undefined, fallback: number): number {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp > Date.now() + 5 * 60 * 1000) {
    return fallback;
  }
  return Math.trunc(timestamp);
}

async function loadLinkedSessionContexts(
  redis: ReturnType<typeof getSharedRedis>,
  workspaceId: string,
  initialKeys: string[]
): Promise<{
  keys: string[];
  contexts: Map<string, Record<string, string>>;
}> {
  const allowedPrefix = `sess:${workspaceId}:`;
  const keys = new Set(initialKeys.slice(0, MAX_LINKED_SESSION_KEYS));
  const pending = Array.from(keys);
  const contexts = new Map<string, Record<string, string>>();

  while (pending.length > 0 && contexts.size < MAX_LINKED_SESSION_KEYS) {
    const batch = pending.splice(0, MAX_LINKED_SESSION_KEYS - contexts.size);
    const loaded = await Promise.all(
      batch.map(async (key) => [key, await redis.hgetall(key)] as const)
    );

    for (const [key, data] of loaded) {
      const context = data ?? {};
      contexts.set(key, context);
      for (const field of Object.keys(context)) {
        if (!field.startsWith(SESSION_ALIAS_FIELD_PREFIX)) continue;
        const linkedKey = field.slice(SESSION_ALIAS_FIELD_PREFIX.length);
        if (
          !linkedKey.startsWith(allowedPrefix) ||
          keys.has(linkedKey) ||
          keys.size >= MAX_LINKED_SESSION_KEYS
        ) continue;
        keys.add(linkedKey);
        pending.push(linkedKey);
      }
    }
  }

  return { keys: Array.from(keys), contexts };
}

function buildFields(
  context: SessionContextInput,
  receivedAt: number
): Record<string, TimestampedSessionField> {
  const fields: Record<string, TimestampedSessionField> = {};
  const observedAt = boundedTimestamp(context.observedAt, receivedAt);
  const rawTouchTimestamp = Number(context.attributionTimestamp);
  const touchTimestamp =
    Number.isFinite(rawTouchTimestamp) &&
    rawTouchTimestamp > 0 &&
    rawTouchTimestamp <= receivedAt + 5 * 60 * 1000
      ? Math.trunc(rawTouchTimestamp)
      : null;
  const simple: Array<[string, string | null | undefined]> = [
    ["fbp", context.fbp],
    ["fbc", context.fbc],
    ["ttclid", context.ttclid],
    ["ttp", context.ttp],
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
    fields[field] = {
      value,
      timestamp:
        touchTimestamp && TOUCH_SCOPED_FIELDS.has(field)
          ? touchTimestamp
          : observedAt,
    };
  }

  const touchSource = normalizedIdentifier(context.attributionSource);
  if (touchTimestamp) {
    fields.attributionTimestamp = {
      value: String(touchTimestamp),
      timestamp: touchTimestamp,
    };
    // Use the actual browser touch time for staleness. Repeated events must not
    // refresh an old campaign touch merely because they were received later.
    if (touchSource) {
      fields.attributionSource = { value: touchSource, timestamp: touchTimestamp };
    }
  }

  if (context.consent?.analyticsAllowed !== undefined) {
    fields["consent:analytics"] = {
      value: String(context.consent.analyticsAllowed),
      timestamp: observedAt,
    };
  }
  if (context.consent?.marketingAllowed !== undefined) {
    fields["consent:marketing"] = {
      value: String(context.consent.marketingAllowed),
      timestamp: observedAt,
    };
  }
  if (context.consent?.saleOfDataAllowed !== undefined) {
    fields["consent:saleOfData"] = {
      value: String(context.consent.saleOfDataAllowed),
      timestamp: observedAt,
    };
  }

  return fields;
}

export interface SessionContextClearOptions {
  marketing?: boolean;
  saleOfData?: boolean;
  analytics?: boolean;
  shared?: boolean;
  /** Event occurrence time used to prevent delayed denials from erasing newer consent. */
  observedAt?: number | null;
}

/**
 * Remove consent-scoped browser context and leave a timestamped tombstone.
 * Tombstones prevent a second identifier key (for example an older email key)
 * from resurrecting fields that predate the shopper's denial.
 */
export async function clearSessionContextForIdentifiers(
  workspaceId: string,
  identifiers: SessionIdentifiers,
  options: SessionContextClearOptions
): Promise<void> {
  const initialKeys = sessionKeysForIdentifiers(workspaceId, identifiers);
  if (
    initialKeys.length === 0 ||
    (!options.marketing && !options.saleOfData && !options.analytics && !options.shared)
  ) return;

  const timestamp = boundedTimestamp(options.observedAt, Date.now());
  const categories: Array<{
    fields: readonly string[];
    tombstone: string;
    timestamp: number;
    consentField?: "consent:marketing" | "consent:analytics" | "consent:saleOfData";
  }> = [];
  if (options.marketing) {
    categories.push({
      fields: MARKETING_CONTEXT_FIELDS,
      tombstone: MARKETING_CLEARED_AT_FIELD,
      timestamp,
      consentField: "consent:marketing",
    });
  }
  if (options.saleOfData) {
    categories.push({
      fields: MARKETING_CONTEXT_FIELDS,
      tombstone: SALE_OF_DATA_CLEARED_AT_FIELD,
      timestamp,
      consentField: "consent:saleOfData",
    });
  }
  if (options.analytics) {
    categories.push({
      fields: ANALYTICS_CONTEXT_FIELDS,
      tombstone: ANALYTICS_CLEARED_AT_FIELD,
      timestamp,
      consentField: "consent:analytics",
    });
  }
  if (options.shared) {
    categories.push({
      fields: SHARED_CONTEXT_FIELDS,
      tombstone: SHARED_CLEARED_AT_FIELD,
      timestamp,
    });
  }

  try {
    const redis = getSharedRedis();
    // Consent events intentionally omit PII after denial. Follow the hashed-key
    // links created when those identifiers were previously observed so an old
    // email/order key cannot survive a denial that now carries only a session,
    // checkout, or cart identifier.
    const { keys } = await loadLinkedSessionContexts(redis, workspaceId, initialKeys);
    // All linked aliases live in the same TrackClear Redis instance. One Lua
    // invocation makes the revocation indivisible across the complete alias set.
    await redis.eval(
      CLEAR_FIELDS_IF_NOT_NEWER_SCRIPT,
      keys.length,
      ...keys,
      JSON.stringify(categories),
      String(SESSION_TTL_SECONDS)
    );
  } catch (err) {
    log.error("Failed to clear consent-scoped session context", {
      workspaceId,
      keyCount: initialKeys.length,
      error: err instanceof Error ? err.message : String(err),
    });
    // Explicit revocation is a privacy boundary. Never acknowledge the ingest
    // request unless every linked Redis identity has the ordered tombstone and
    // durable false consent value needed to block a later webhook lookup.
    throw err instanceof Error
      ? err
      : new Error("Failed to persist consent revocation");
  }
}

export async function storeSessionContext(
  workspaceId: string,
  email: string,
  context: SessionContextInput
): Promise<void> {
  await storeSessionContextForIdentifiers(workspaceId, { email }, context);
}

/**
 * Persist context before the request finishes. Callers may await this function so
 * serverless runtimes cannot suspend the process while Redis writes are in flight.
 */
export async function storeSessionContextForIdentifiers(
  workspaceId: string,
  identifiers: SessionIdentifiers,
  context: SessionContextInput
): Promise<void> {
  const keys = sessionKeysForIdentifiers(workspaceId, identifiers);
  if (keys.length === 0) return;

  const fields = buildFields(context, Date.now());
  if (Object.keys(fields).length === 0) return;

  try {
    const redis = getSharedRedis();
    await Promise.all(
      keys.map((key) =>
        redis.eval(
          UPSERT_FIELDS_IF_NEWER_SCRIPT,
          1,
          key,
          JSON.stringify(fields),
          String(SESSION_TTL_SECONDS),
          JSON.stringify(keys),
          String(Date.now()),
          String(MAX_LINKED_SESSION_KEYS)
        )
      )
    );
  } catch (err) {
    log.error("Failed to store session context", {
      workspaceId,
      keyCount: keys.length,
      error: err instanceof Error ? err.message : String(err),
    });
  }
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
    const initialKeys = sessionKeysForIdentifiers(workspaceId, identifiers);
    if (initialKeys.length === 0) return null;

    const now = Date.now();
    const result: Record<string, { value: string; ts: number }> = {};
    const enrichedFields = new Set<string>();
    let oldestTs = now;

    // Follow prior hashed-key associations in both directions. Besides improving
    // attribution recovery, this makes a tombstone on any known alias authoritative
    // even when the webhook later presents only a different alias.
    const linked = await loadLinkedSessionContexts(redis, workspaceId, initialKeys);
    const storedContexts = linked.keys.map((key) => linked.contexts.get(key) ?? {});
    const latestClearAt: Record<string, number> = {
      marketing: 0,
      analytics: 0,
      shared: 0,
    };
    for (const data of storedContexts) {
      if (!data) continue;
      for (const [categories, field] of [
        [["marketing"], MARKETING_CLEARED_AT_FIELD],
        [["marketing"], SALE_OF_DATA_CLEARED_AT_FIELD],
        [["analytics"], ANALYTICS_CLEARED_AT_FIELD],
        [["shared"], SHARED_CLEARED_AT_FIELD],
      ] as const) {
        const timestamp = Number(data[field]);
        for (const category of categories) {
          if (Number.isFinite(timestamp) && timestamp > latestClearAt[category]) {
            latestClearAt[category] = timestamp;
          }
        }
      }
    }

    for (const data of storedContexts) {
      if (!data || Object.keys(data).length === 0) continue;

      for (const field of BROWSER_FIELDS) {
        const value = data[field];
        const tsStr = data[`ts:${field}`];
        if (!value || !tsStr) continue;

        const ts = Number(tsStr);
        if (!Number.isFinite(ts)) continue;
        const maxAge =
          (field === "consent:analytics" ||
            field === "consent:marketing" ||
            field === "consent:saleOfData") && value === "false"
            ? CONSENT_DENIAL_STALENESS_MS
            : STALENESS_MS[field] ?? 24 * 60 * 60 * 1000;
        if (now - ts > maxAge) continue;
        if (
          (MARKETING_CONTEXT_FIELDS as readonly string[]).includes(field) &&
          ts <= latestClearAt.marketing
        ) continue;
        if (
          (ANALYTICS_CONTEXT_FIELDS as readonly string[]).includes(field) &&
          ts <= latestClearAt.analytics
        ) continue;
        if (
          (SHARED_CONTEXT_FIELDS as readonly string[]).includes(field) &&
          ts <= latestClearAt.shared
        ) continue;

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
    if (
      result["consent:analytics"] ||
      result["consent:marketing"] ||
      result["consent:saleOfData"]
    ) {
      consent = {};
      if (result["consent:analytics"]) {
        consent.analytics = result["consent:analytics"].value === "true";
      }
      if (result["consent:marketing"]) {
        consent.marketing = result["consent:marketing"].value === "true";
      }
      if (result["consent:saleOfData"]) {
        consent.saleOfData = result["consent:saleOfData"].value === "true";
      }
    }

    return {
      fbp: result.fbp?.value,
      fbc: result.fbc?.value,
      ttclid: result.ttclid?.value,
      ttp: result.ttp?.value,
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
      attributionTimestamp: result.attributionTimestamp
        ? Number(result.attributionTimestamp.value)
        : undefined,
      attributionSource: result.attributionSource?.value,
      consent,
      consentTimestamps: consent
        ? {
            analytics: result["consent:analytics"]?.ts,
            marketing: result["consent:marketing"]?.ts,
            saleOfData: result["consent:saleOfData"]?.ts,
          }
        : undefined,
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
