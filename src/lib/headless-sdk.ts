export type TrackClearEventName =
  | "PageView"
  | "ViewContent"
  | "AddToCart"
  | "InitiateCheckout"
  | "Purchase";

export type TrackClearConsent = {
  analyticsAllowed?: boolean;
  marketingAllowed?: boolean;
  saleOfDataAllowed?: boolean;
  analytics?: boolean;
  marketing?: boolean;
  saleOfData?: boolean;
};

export type TrackClearAttribution = {
  fbp?: string | null;
  fbc?: string | null;
  fbclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  ttclid?: string | null;
  ttp?: string | null;
  rdtCid?: string | null;
  epik?: string | null;
  gclid?: string | null;
  gaClientId?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  attributionTimestamp?: number | null;
  attributionSource?: string | null;
};

export type TrackClearUserData = {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  countryCode?: string | null;
  customerId?: string | null;
};

export type TrackClearEventInput = {
  eventId?: string;
  timestamp?: number;
  url?: string | null;
  referrer?: string | null;
  trackclearSessionId?: string | null;
  checkoutToken?: string | null;
  cartToken?: string | null;
  attribution?: TrackClearAttribution;
  consent?: TrackClearConsent;
  userData?: TrackClearUserData;
  customData?: Record<string, unknown>;
};

export type TrackClearClientConfig = {
  apiKey: string;
  ingestUrl: string;
  fetchFn?: typeof fetch;
  defaultAttribution?: TrackClearAttribution;
  defaultConsent?: TrackClearConsent;
  consentMode?: "STRICT" | "LAX";
  getSessionId?: () => string | null | undefined | Promise<string | null | undefined>;
  /** Durable browser storage used to replay explicit consent revocations. */
  storage?: StorageLike | null;
  now?: () => number;
};

export type StorageLike = {
  getItem(key: string): string | null | undefined;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

export type HeadlessCookieAdapter = {
  get(name: string): string | null | undefined | Promise<string | null | undefined>;
  set(
    name: string,
    value: string,
    options?: { maxAgeSeconds?: number; path?: string; sameSite?: "Lax" | "Strict" | "None" }
  ): void | Promise<void>;
};

const FBP_REGEX = /^fb\.1\.\d{13}\.\d{7,20}$/;
const FBC_REGEX = /^fb\.1\.(\d{13})\..+$/;
const META_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
const META_COOKIE_MAX_AGE_MS = META_COOKIE_MAX_AGE_SECONDS * 1000;
const TRACKCLEAR_SESSION_KEY = "_trackclear_session_id";
const TRACKCLEAR_SESSION_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const CONSENT_REVOCATION_QUEUE_KEY = "_trackclear_pending_consent_v1";
const CONSENT_REVOCATION_LOCK_NAME = "trackclear-consent-revocation-v1";
const CONSENT_REVOCATION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const CONSENT_REVOCATION_MAX_ITEMS = 20;
const CONSENT_REVOCATION_BASE_RETRY_MS = 5_000;
const CONSENT_REVOCATION_MAX_RETRY_MS = 5 * 60 * 1000;

type TrackClearIngestPayload = Record<string, unknown> & {
  eventName: TrackClearEventName;
  eventId: string;
  timestamp: number;
  consent: ServerTrackClearConsent;
};

type ServerTrackClearConsent = {
  analyticsAllowed?: boolean;
  marketingAllowed?: boolean;
  saleOfDataAllowed?: boolean;
};

type PendingConsentRevocation = {
  id: string;
  generation: string;
  payload: TrackClearIngestPayload;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
};

type PendingConsentRevocationRef = Pick<PendingConsentRevocation, "id" | "generation">;

function clean(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function consentValue(
  consent: TrackClearConsent | undefined,
  primary: "analyticsAllowed" | "marketingAllowed",
  alias: "analytics" | "marketing"
): boolean | undefined {
  return consent?.[primary] ?? consent?.[alias];
}

function normalizeConsent(
  defaultConsent?: TrackClearConsent,
  eventConsent?: TrackClearConsent
): ServerTrackClearConsent {
  const normalized: ServerTrackClearConsent = {};
  const analytics = consentValue(eventConsent, "analyticsAllowed", "analytics") ??
    consentValue(defaultConsent, "analyticsAllowed", "analytics");
  const marketing = consentValue(eventConsent, "marketingAllowed", "marketing") ??
    consentValue(defaultConsent, "marketingAllowed", "marketing");
  const saleOfData = eventConsent?.saleOfDataAllowed ?? eventConsent?.saleOfData ??
    defaultConsent?.saleOfDataAllowed ?? defaultConsent?.saleOfData;
  if (typeof analytics === "boolean") normalized.analyticsAllowed = analytics;
  if (typeof marketing === "boolean") normalized.marketingAllowed = marketing;
  if (typeof saleOfData === "boolean") normalized.saleOfDataAllowed = saleOfData;
  return normalized;
}

function consentAllowed(
  consent: TrackClearConsent | undefined,
  category: "analytics" | "marketing",
  mode: "STRICT" | "LAX"
): boolean {
  const value = category === "marketing"
    ? consentValue(consent, "marketingAllowed", "marketing")
    : consentValue(consent, "analyticsAllowed", "analytics");
  if (
    category === "marketing" &&
    (consent?.saleOfDataAllowed ?? consent?.saleOfData) === false
  ) return false;
  return mode === "STRICT" ? value === true : value !== false;
}

function hasExplicitConsentRevocation(consent: ServerTrackClearConsent): boolean {
  return consentValue(consent, "analyticsAllowed", "analytics") === false ||
    consentValue(consent, "marketingAllowed", "marketing") === false ||
    consent.saleOfDataAllowed === false;
}

function consentRevocationPayload(payload: TrackClearIngestPayload): TrackClearIngestPayload {
  const customData = payload.customData && typeof payload.customData === "object"
    ? payload.customData as Record<string, unknown>
    : {};
  const identityData: Record<string, unknown> = {};
  for (const key of ["orderId", "orderName", "checkoutToken", "cartToken"] as const) {
    if (customData[key] !== null && customData[key] !== undefined) {
      identityData[key] = customData[key];
    }
  }

  return {
    eventName: payload.eventName,
    eventId: payload.eventId,
    timestamp: payload.timestamp,
    url: "",
    referrer: "",
    trackclearSessionId: payload.trackclearSessionId ?? null,
    checkoutToken: payload.checkoutToken ?? undefined,
    cartToken: payload.cartToken ?? undefined,
    consent: payload.consent,
    userData: {},
    customData: identityData,
    // Replays exist only to durably apply consent state; they must never create
    // a second advertising or analytics event.
    onlyDestinations: [],
  };
}

function consentRetryDelay(attempts: number): number {
  return Math.min(
    CONSENT_REVOCATION_MAX_RETRY_MS,
    CONSENT_REVOCATION_BASE_RETRY_MS * 2 ** Math.min(Math.max(attempts - 1, 0), 6)
  );
}

async function expireAttributionCookie(
  cookies: HeadlessCookieAdapter | null,
  name: string
): Promise<void> {
  try {
    await cookies?.set(name, "", { maxAgeSeconds: 0, path: "/", sameSite: "Lax" });
  } catch {
    // Consent enforcement must still blank the in-memory value if cookies are blocked.
  }
}

function getSearchParam(url: URL, name: string): string | null {
  return clean(url.searchParams.get(name));
}

function attributionSource(attribution: TrackClearAttribution): string | null {
  if (attribution.fbclid) return "meta";
  if (attribution.ttclid) return "tiktok";
  if (attribution.gclid || attribution.gbraid || attribution.wbraid) return "google";
  if (attribution.rdtCid) return "reddit";
  if (attribution.epik) return "pinterest";
  return clean(attribution.utmSource)?.toLowerCase().slice(0, 100) ??
    (attribution.utmMedium || attribution.utmCampaign || attribution.utmContent || attribution.utmTerm
      ? "utm"
      : null);
}

export function captureUrlAttribution(rawUrl: string, now = Date.now()): TrackClearAttribution {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return {};
  }

  const attribution: TrackClearAttribution = {
    fbclid: getSearchParam(url, "fbclid"),
    gbraid: getSearchParam(url, "gbraid"),
    wbraid: getSearchParam(url, "wbraid"),
    ttclid: getSearchParam(url, "ttclid"),
    rdtCid: getSearchParam(url, "rdt_cid"),
    epik: getSearchParam(url, "epik"),
    gclid: getSearchParam(url, "gclid"),
    utmSource: getSearchParam(url, "utm_source"),
    utmMedium: getSearchParam(url, "utm_medium"),
    utmCampaign: getSearchParam(url, "utm_campaign"),
    utmContent: getSearchParam(url, "utm_content"),
    utmTerm: getSearchParam(url, "utm_term"),
  };
  const source = attributionSource(attribution);
  return source
    ? { ...attribution, attributionTimestamp: now, attributionSource: source }
    : attribution;
}

export function validateFbp(value: string | null | undefined): string | null {
  return value && FBP_REGEX.test(value) ? value : null;
}

export function validateFbc(value: string | null | undefined, now = Date.now()): string | null {
  if (!value) return null;
  const match = value.match(FBC_REGEX);
  if (!match) return null;
  const timestamp = Number.parseInt(match[1], 10);
  if (!Number.isFinite(timestamp) || now - timestamp > META_COOKIE_MAX_AGE_MS) return null;
  return value;
}

export function fbcClickId(value: string | null | undefined): string | null {
  if (!value) return null;
  const index = value.lastIndexOf(".");
  return index > 0 ? value.slice(index + 1) : null;
}

export function synthesizeFbcFromFbclid(fbclid: string | null | undefined, timestampMs = Date.now()): string | null {
  const clickId = clean(fbclid);
  return clickId ? `fb.1.${timestampMs}.${clickId}` : null;
}

export function generateFbp(timestampMs = Date.now(), random = Math.random): string {
  const randomId = Math.floor(1000000000 + random() * 9000000000);
  return `fb.1.${timestampMs}.${randomId}`;
}

export function createDocumentCookieAdapter(): HeadlessCookieAdapter | null {
  if (typeof document === "undefined") return null;
  return {
    get(name) {
      const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
      return match ? decodeURIComponent(match[1]) : null;
    },
    set(name, value, options) {
      const maxAge = options?.maxAgeSeconds ?? META_COOKIE_MAX_AGE_SECONDS;
      const path = options?.path ?? "/";
      const sameSite = options?.sameSite ?? "Lax";
      document.cookie = `${name}=${encodeURIComponent(value)};max-age=${maxAge};path=${path};SameSite=${sameSite}`;
    },
  };
}

function defaultStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function normalizeSessionId(value: unknown): string | null {
  const text = clean(value);
  return text && text.length <= 512 ? text : null;
}

function readStorageSessionId(storage: StorageLike | null, key: string): string | null {
  if (!storage) return null;
  try {
    return normalizeSessionId(storage.getItem(key));
  } catch {
    return null;
  }
}

async function readCookieSessionId(cookies: HeadlessCookieAdapter | null, key: string): Promise<string | null> {
  if (!cookies) return null;
  try {
    return normalizeSessionId(await cookies.get(key));
  } catch {
    return null;
  }
}

async function persistSessionId(
  sessionId: string,
  storage: StorageLike | null,
  cookies: HeadlessCookieAdapter | null,
  key: string
): Promise<void> {
  try {
    storage?.setItem(key, sessionId);
  } catch {
    // Ignore blocked storage; cookie persistence below is still attempted.
  }

  try {
    if (cookies) {
      await cookies.set(key, sessionId, {
        maxAgeSeconds: TRACKCLEAR_SESSION_MAX_AGE_SECONDS,
        path: "/",
        sameSite: "Lax",
      });
    }
  } catch {
    // Ignore blocked cookies; callers still receive the in-memory ID.
  }
}

export async function ensureTrackClearSessionId({
  storage = defaultStorage(),
  cookies = createDocumentCookieAdapter(),
  key = TRACKCLEAR_SESSION_KEY,
  generateId = randomId,
}: {
  storage?: StorageLike | null;
  cookies?: HeadlessCookieAdapter | null;
  key?: string;
  generateId?: () => string;
} = {}): Promise<string> {
  const existing =
    readStorageSessionId(storage, key) ??
    await readCookieSessionId(cookies, key);

  if (existing) {
    await persistSessionId(existing, storage, cookies, key);
    return existing;
  }

  const sessionId = normalizeSessionId(generateId()) ?? randomId();
  await persistSessionId(sessionId, storage, cookies, key);
  return sessionId;
}

export async function ensureMetaAttributionCookies({
  attribution = {},
  cookies = createDocumentCookieAdapter(),
  consent,
  consentMode = "LAX",
  now = Date.now(),
  random = Math.random,
}: {
  attribution?: TrackClearAttribution;
  cookies?: HeadlessCookieAdapter | null;
  consent?: TrackClearConsent;
  consentMode?: "STRICT" | "LAX";
  now?: number;
  random?: () => number;
} = {}): Promise<TrackClearAttribution> {
  const next: TrackClearAttribution = { ...attribution };
  if (!consentAllowed(consent, "marketing", consentMode)) {
    await expireAttributionCookie(cookies, "_fbp");
    await expireAttributionCookie(cookies, "_fbc");
    return { ...next, fbp: null, fbc: null };
  }
  const existingFbp = validateFbp(next.fbp ?? (cookies ? await cookies.get("_fbp") : null));
  const fbp = existingFbp ?? generateFbp(now, random);
  if (!existingFbp && cookies) {
    await cookies.set("_fbp", fbp, { maxAgeSeconds: META_COOKIE_MAX_AGE_SECONDS, path: "/", sameSite: "Lax" });
  }

  const existingFbc = validateFbc(next.fbc ?? (cookies ? await cookies.get("_fbc") : null), now);
  const clickId = clean(next.fbclid);
  let fbc = existingFbc;
  if (clickId && (!existingFbc || fbcClickId(existingFbc) !== clickId)) {
    fbc = synthesizeFbcFromFbclid(clickId, now);
    if (fbc && cookies) {
      await cookies.set("_fbc", fbc, { maxAgeSeconds: META_COOKIE_MAX_AGE_SECONDS, path: "/", sameSite: "Lax" });
    }
  }

  return { ...next, fbp, fbc };
}

export async function captureTikTokAttributionCookie({
  attribution = {},
  cookies = createDocumentCookieAdapter(),
  consent,
  consentMode = "LAX",
}: {
  attribution?: TrackClearAttribution;
  cookies?: HeadlessCookieAdapter | null;
  consent?: TrackClearConsent;
  consentMode?: "STRICT" | "LAX";
} = {}): Promise<TrackClearAttribution> {
  const next = { ...attribution };
  if (!consentAllowed(consent, "marketing", consentMode)) {
    await expireAttributionCookie(cookies, "_ttp");
    return { ...next, ttp: null };
  }
  const ttp = clean(next.ttp ?? (cookies ? await cookies.get("_ttp") : null));
  return { ...next, ttp };
}

function addAttribute(attributes: Record<string, string>, key: string, value: unknown) {
  const text = clean(value);
  if (text) attributes[key] = text;
}

export function buildTrackClearCartAttributes({
  attribution = {},
  trackclearSessionId,
  landingPage,
  consent,
  consentMode = "LAX",
}: {
  attribution?: TrackClearAttribution;
  trackclearSessionId?: string | null;
  landingPage?: string | null;
  consent?: TrackClearConsent;
  consentMode?: "STRICT" | "LAX";
}): Record<string, string> {
  const attributes: Record<string, string> = {};
  const marketingAllowed = consentAllowed(consent, "marketing", consentMode);
  addAttribute(attributes, "_trackclear_session_id", trackclearSessionId);
  if (marketingAllowed) {
    addAttribute(attributes, "_fbp", attribution.fbp);
    addAttribute(attributes, "_fbc", attribution.fbc);
    addAttribute(attributes, "_fbclid", attribution.fbclid);
    addAttribute(attributes, "_gclid", attribution.gclid);
    addAttribute(attributes, "_gbraid", attribution.gbraid);
    addAttribute(attributes, "_wbraid", attribution.wbraid);
    addAttribute(attributes, "_ttclid", attribution.ttclid);
    addAttribute(attributes, "_ttp", attribution.ttp);
    addAttribute(attributes, "_rdt_cid", attribution.rdtCid);
    addAttribute(attributes, "_epik", attribution.epik);
  } else {
    for (const key of [
      "_fbp", "_fbc", "_fbclid", "_gclid", "_gbraid", "_wbraid",
      "_ttclid", "_ttp", "_rdt_cid", "_epik",
    ]) {
      attributes[key] = "";
    }
  }
  addAttribute(attributes, "_utm_source", attribution.utmSource);
  addAttribute(attributes, "_utm_medium", attribution.utmMedium);
  addAttribute(attributes, "_utm_campaign", attribution.utmCampaign);
  addAttribute(attributes, "_utm_content", attribution.utmContent);
  addAttribute(attributes, "_utm_term", attribution.utmTerm);
  addAttribute(attributes, "_landing_page", landingPage);
  addAttribute(attributes, "_tc_attribution_timestamp", attribution.attributionTimestamp);
  addAttribute(attributes, "_tc_attribution_source", attribution.attributionSource);
  if (consent?.analyticsAllowed !== undefined || consent?.analytics !== undefined) {
    addAttribute(attributes, "_tc_consent_analytics", String(consent.analyticsAllowed ?? consent.analytics));
  }
  if (consent?.marketingAllowed !== undefined || consent?.marketing !== undefined) {
    addAttribute(attributes, "_tc_consent_marketing", String(consent.marketingAllowed ?? consent.marketing));
  }
  if (consent?.saleOfDataAllowed !== undefined || consent?.saleOfData !== undefined) {
    addAttribute(attributes, "_tc_consent_sale_of_data", String(consent.saleOfDataAllowed ?? consent.saleOfData));
  }
  if (
    attributes._tc_consent_analytics ||
    attributes._tc_consent_marketing ||
    attributes._tc_consent_sale_of_data
  ) {
    addAttribute(attributes, "_tc_consent_timestamp", Date.now());
    addAttribute(attributes, "_tc_consent_source", "headless_storefront");
  }
  return attributes;
}

export function toShopifyCartAttributes(attributes: Record<string, string>): Array<{ key: string; value: string }> {
  return Object.entries(attributes).map(([key, value]) => ({ key, value }));
}

function currentUrl(): string | undefined {
  return typeof location === "undefined" ? undefined : location.href;
}

function currentReferrer(): string | undefined {
  return typeof document === "undefined" ? undefined : document.referrer;
}

function randomId(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `${Date.now()}.${Math.random().toString(36).slice(2)}`;
}

export function createTrackClearClient(config: TrackClearClientConfig) {
  const fetchFn = config.fetchFn ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error("TrackClear requires a fetch implementation.");
  }
  const storage = config.storage === undefined ? defaultStorage() : config.storage;
  const now = config.now ?? Date.now;
  let volatileRevocations: PendingConsentRevocation[] = [];
  let replayInFlight: Promise<void> | null = null;
  let queueMutation: Promise<unknown> = Promise.resolve();
  let revocationGeneration = 0;
  let fallbackSessionId: string | null = null;

  async function resolveSessionId(inputSessionId?: string | null): Promise<string> {
    const supplied = clean(inputSessionId) ?? clean(await config.getSessionId?.());
    if (supplied) return supplied;
    if (fallbackSessionId) return fallbackSessionId;
    try {
      fallbackSessionId = clean(storage?.getItem(TRACKCLEAR_SESSION_KEY));
    } catch {
      fallbackSessionId = null;
    }
    if (!fallbackSessionId) {
      fallbackSessionId = randomId();
      try {
        storage?.setItem(TRACKCLEAR_SESSION_KEY, fallbackSessionId);
      } catch {
        // Keep the opaque ID stable for this client instance when storage is unavailable.
      }
    }
    return fallbackSessionId;
  }

  function withQueueMutation<T>(operation: () => T | Promise<T>): Promise<T> {
    const execute = (): Promise<T> => {
      try {
        const locks = globalThis.navigator?.locks;
        if (locks && typeof locks.request === "function") {
          // Both Web Locks and Promise.resolve assimilate returned promises.
          // The cast narrows TypeScript's otherwise nested generic inference;
          // it does not change the resolved runtime value.
          return locks.request(
            CONSENT_REVOCATION_LOCK_NAME,
            () => Promise.resolve(operation())
          ) as Promise<T>;
        }
      } catch {
        // A missing or restricted Web Locks implementation falls back to the
        // per-client promise chain below.
      }
      return Promise.resolve(operation()) as Promise<T>;
    };
    const next = queueMutation.then(execute, execute);
    queueMutation = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  function readPendingRevocations(): PendingConsentRevocation[] {
    let parsed: unknown = [];
    try {
      const raw = storage?.getItem(CONSENT_REVOCATION_QUEUE_KEY);
      if (raw) parsed = JSON.parse(raw);
    } catch {
      // Corrupt or temporarily unreadable storage must not stop a new denial
      // from replacing it with a valid queue.
      parsed = [];
    }
    const stored = Array.isArray(parsed) ? parsed : [];
    const merged = new Map<string, PendingConsentRevocation>();
    const cutoff = now() - CONSENT_REVOCATION_MAX_AGE_MS;
    for (const entry of [...stored, ...volatileRevocations]) {
      if (!entry || typeof entry !== "object") continue;
      const candidate = entry as Partial<PendingConsentRevocation>;
      if (
        typeof candidate.id !== "string" ||
        typeof candidate.createdAt !== "number" ||
        candidate.createdAt < cutoff ||
        !candidate.payload ||
        typeof candidate.payload !== "object"
      ) continue;

      const rawPayload = candidate.payload as TrackClearIngestPayload;
      if (
        typeof rawPayload.eventId !== "string" ||
        typeof rawPayload.timestamp !== "number" ||
        !rawPayload.consent ||
        typeof rawPayload.consent !== "object"
      ) continue;
      const consent = normalizeConsent(undefined, rawPayload.consent);
      if (!hasExplicitConsentRevocation(consent)) continue;
      const payload = consentRevocationPayload({ ...rawPayload, consent });
      if (payload.timestamp < cutoff) continue;
      const id = `${payload.eventId}:${payload.timestamp}`;
      const generation = typeof candidate.generation === "string" && candidate.generation
        ? candidate.generation
        : `legacy:${id}:${candidate.createdAt}`;
      merged.set(generation, {
        id,
        generation,
        payload,
        createdAt: candidate.createdAt,
        attempts: Number.isFinite(candidate.attempts) ? Math.max(0, Number(candidate.attempts)) : 0,
        nextAttemptAt: Number.isFinite(candidate.nextAttemptAt) ? Number(candidate.nextAttemptAt) : 0,
      });
    }
    return Array.from(merged.values())
      .sort((left, right) =>
        left.createdAt - right.createdAt || left.generation.localeCompare(right.generation)
      )
      .slice(-CONSENT_REVOCATION_MAX_ITEMS);
  }

  function writePendingRevocations(entries: PendingConsentRevocation[]): void {
    volatileRevocations = entries.slice(-CONSENT_REVOCATION_MAX_ITEMS);
    if (!storage) return;
    try {
      if (volatileRevocations.length === 0 && storage.removeItem) {
        storage.removeItem(CONSENT_REVOCATION_QUEUE_KEY);
        return;
      }
      storage.setItem(CONSENT_REVOCATION_QUEUE_KEY, JSON.stringify(volatileRevocations));
    } catch {
      // Keep the in-memory queue authoritative for this client instance. A
      // successful server response is durable; failures remain replayable while
      // the page lives and caller-visible for headless integrations.
    }
  }

  function enqueueRevocation(payload: TrackClearIngestPayload): Promise<PendingConsentRevocationRef> {
    return withQueueMutation(() => {
      const minimalPayload = consentRevocationPayload(payload);
      const id = `${minimalPayload.eventId}:${minimalPayload.timestamp}`;
      const generation = `${now().toString(36)}.${(++revocationGeneration).toString(36)}.${randomId()}`;
      const entries = readPendingRevocations();
      entries.push({
        id,
        generation,
        payload: minimalPayload,
        createdAt: now(),
        attempts: 0,
        nextAttemptAt: 0,
      });
      writePendingRevocations(entries);
      return { id, generation };
    });
  }

  function settleRevocation(ref: PendingConsentRevocationRef, delivered: boolean): Promise<void> {
    return withQueueMutation(() => {
      const entries = readPendingRevocations();
      const next = entries.flatMap((entry) => {
        if (entry.id !== ref.id || entry.generation !== ref.generation) return [entry];
        if (delivered) return [];
        const attempts = entry.attempts + 1;
        return [{
          ...entry,
          attempts,
          nextAttemptAt: now() + consentRetryDelay(attempts),
        }];
      });
      writePendingRevocations(next);
    });
  }

  async function sendPayload(payload: TrackClearIngestPayload): Promise<Response> {
    return fetchFn(config.ingestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-TL-API-Key": config.apiKey,
      },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  }

  async function replayPendingConsentRevocations(): Promise<void> {
    if (replayInFlight) return replayInFlight;
    replayInFlight = (async () => {
      let entries: PendingConsentRevocation[];
      try {
        entries = await withQueueMutation(() => {
          const current = readPendingRevocations();
          writePendingRevocations(current);
          return current;
        });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.nextAttemptAt > now()) continue;
        try {
          const response = await sendPayload(entry.payload);
          await settleRevocation(entry, response.ok);
        } catch {
          try {
            await settleRevocation(entry, false);
          } catch {
            // The caller will retry on the next initialization or event.
          }
        }
      }
    })().finally(() => {
      replayInFlight = null;
    });
    return replayInFlight;
  }

  // Browser clients replay across reloads even before the next commerce event.
  void replayPendingConsentRevocations();

  async function track(eventName: TrackClearEventName, input: TrackClearEventInput = {}) {
    const attribution = { ...config.defaultAttribution, ...input.attribution };
    // Resolve aliases within each source before merging so an event-level
    // `marketing: false` overrides a default `marketingAllowed: true`.
    // Only the canonical server keys leave this SDK.
    const consent = normalizeConsent(config.defaultConsent, input.consent);
    const consentMode = config.consentMode ?? "LAX";
    const marketingAllowed = consentAllowed(consent, "marketing", consentMode);
    const analyticsAllowed = consentAllowed(consent, "analytics", consentMode);
    const scopedAttribution: TrackClearAttribution = marketingAllowed
      ? { ...attribution }
      : {
          ...attribution,
          fbp: null,
          fbc: null,
          fbclid: null,
          gbraid: null,
          wbraid: null,
          ttclid: null,
          ttp: null,
          rdtCid: null,
          epik: null,
          gclid: null,
          attributionSource:
            clean(attribution.utmSource)?.toLowerCase().slice(0, 100) ??
            (attribution.utmMedium || attribution.utmCampaign || attribution.utmContent || attribution.utmTerm
              ? "utm"
              : null),
          attributionTimestamp:
            attribution.utmSource || attribution.utmMedium || attribution.utmCampaign ||
            attribution.utmContent || attribution.utmTerm
              ? attribution.attributionTimestamp
              : null,
        };
    if (!analyticsAllowed) scopedAttribution.gaClientId = null;
    const customData = { ...(input.customData ?? {}) };
    if (input.checkoutToken) customData.checkoutToken = input.checkoutToken;
    if (input.cartToken) customData.cartToken = input.cartToken;

    const payload: TrackClearIngestPayload = {
      eventName,
      eventId: input.eventId ?? randomId(),
      timestamp: input.timestamp ?? now(),
      url: input.url ?? currentUrl(),
      referrer: input.referrer ?? currentReferrer(),
      trackclearSessionId: await resolveSessionId(input.trackclearSessionId),
      checkoutToken: input.checkoutToken ?? undefined,
      cartToken: input.cartToken ?? undefined,
      ...scopedAttribution,
      consent,
      userData: marketingAllowed ? input.userData ?? {} : {},
      customData,
    };
    let revocationRef: PendingConsentRevocationRef | null = null;
    if (hasExplicitConsentRevocation(consent)) {
      try {
        revocationRef = await enqueueRevocation(payload);
      } catch {
        // A successful server response is itself durable. If the request fails,
        // the rejection remains visible to headless callers so they can retry.
      }
    }
    if (!revocationRef) await replayPendingConsentRevocations();

    let response: Response;
    try {
      response = await sendPayload(payload);
    } catch (error) {
      if (revocationRef) {
        try { await settleRevocation(revocationRef, false); } catch { /* keep caller-visible failure */ }
        void replayPendingConsentRevocations();
      }
      throw error;
    }

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (revocationRef) {
        try { await settleRevocation(revocationRef, false); } catch { /* keep caller-visible failure */ }
        void replayPendingConsentRevocations();
      }
      throw new Error(typeof body.error === "string" ? body.error : "TrackClear ingest failed");
    }
    if (revocationRef) {
      try { await settleRevocation(revocationRef, true); } catch { /* idempotent replay is safe */ }
      void replayPendingConsentRevocations();
    }
    return body;
  }

  return {
    track,
    pageView: (input?: TrackClearEventInput) => track("PageView", input),
    viewContent: (input?: TrackClearEventInput) => track("ViewContent", input),
    addToCart: (input?: TrackClearEventInput) => track("AddToCart", input),
    initiateCheckout: (input?: TrackClearEventInput) => track("InitiateCheckout", input),
    purchase: (input?: TrackClearEventInput) => track("Purchase", input),
    flushPendingConsentRevocations: replayPendingConsentRevocations,
  };
}
