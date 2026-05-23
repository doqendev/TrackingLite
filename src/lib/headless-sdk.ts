export type TrackClearEventName =
  | "PageView"
  | "ViewContent"
  | "AddToCart"
  | "InitiateCheckout"
  | "Purchase";

export type TrackClearConsent = {
  analyticsAllowed?: boolean;
  marketingAllowed?: boolean;
  analytics?: boolean;
  marketing?: boolean;
};

export type TrackClearAttribution = {
  fbp?: string | null;
  fbc?: string | null;
  fbclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  ttclid?: string | null;
  rdtCid?: string | null;
  epik?: string | null;
  gclid?: string | null;
  gaClientId?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
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
  getSessionId?: () => string | null | undefined;
};

export type StorageLike = {
  getItem(key: string): string | null | undefined;
  setItem(key: string, value: string): void;
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

function clean(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function getSearchParam(url: URL, name: string): string | null {
  return clean(url.searchParams.get(name));
}

export function captureUrlAttribution(rawUrl: string): TrackClearAttribution {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return {};
  }

  return {
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

function readCookieSessionId(cookies: HeadlessCookieAdapter | null, key: string): string | null {
  if (!cookies) return null;
  try {
    const value = cookies.get(key);
    return typeof value === "string" || value === null || value === undefined
      ? normalizeSessionId(value)
      : null;
  } catch {
    return null;
  }
}

function persistSessionId(
  sessionId: string,
  storage: StorageLike | null,
  cookies: HeadlessCookieAdapter | null,
  key: string
) {
  try {
    storage?.setItem(key, sessionId);
  } catch {
    // Ignore blocked storage; cookie persistence below is still attempted.
  }

  try {
    const result = cookies?.set(key, sessionId, {
      maxAgeSeconds: TRACKCLEAR_SESSION_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "Lax",
    });
    if (result && typeof (result as Promise<void>).catch === "function") {
      void (result as Promise<void>).catch(() => undefined);
    }
  } catch {
    // Ignore blocked cookies; callers still receive the in-memory ID.
  }
}

export function ensureTrackClearSessionId({
  storage = defaultStorage(),
  cookies = createDocumentCookieAdapter(),
  key = TRACKCLEAR_SESSION_KEY,
  generateId = randomId,
}: {
  storage?: StorageLike | null;
  cookies?: HeadlessCookieAdapter | null;
  key?: string;
  generateId?: () => string;
} = {}): string {
  const existing =
    readStorageSessionId(storage, key) ??
    readCookieSessionId(cookies, key);

  if (existing) {
    persistSessionId(existing, storage, cookies, key);
    return existing;
  }

  const sessionId = normalizeSessionId(generateId()) ?? randomId();
  persistSessionId(sessionId, storage, cookies, key);
  return sessionId;
}

export async function ensureMetaAttributionCookies({
  attribution = {},
  cookies = createDocumentCookieAdapter(),
  now = Date.now(),
  random = Math.random,
}: {
  attribution?: TrackClearAttribution;
  cookies?: HeadlessCookieAdapter | null;
  now?: number;
  random?: () => number;
} = {}): Promise<TrackClearAttribution> {
  const next: TrackClearAttribution = { ...attribution };
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

function addAttribute(attributes: Record<string, string>, key: string, value: unknown) {
  const text = clean(value);
  if (text) attributes[key] = text;
}

export function buildTrackClearCartAttributes({
  attribution = {},
  trackclearSessionId,
  landingPage,
  consent,
}: {
  attribution?: TrackClearAttribution;
  trackclearSessionId?: string | null;
  landingPage?: string | null;
  consent?: TrackClearConsent;
}): Record<string, string> {
  const attributes: Record<string, string> = {};
  addAttribute(attributes, "_trackclear_session_id", trackclearSessionId);
  addAttribute(attributes, "_fbp", attribution.fbp);
  addAttribute(attributes, "_fbc", attribution.fbc);
  addAttribute(attributes, "_fbclid", attribution.fbclid);
  addAttribute(attributes, "_gclid", attribution.gclid);
  addAttribute(attributes, "_gbraid", attribution.gbraid);
  addAttribute(attributes, "_wbraid", attribution.wbraid);
  addAttribute(attributes, "_ttclid", attribution.ttclid);
  addAttribute(attributes, "_rdt_cid", attribution.rdtCid);
  addAttribute(attributes, "_epik", attribution.epik);
  addAttribute(attributes, "_utm_source", attribution.utmSource);
  addAttribute(attributes, "_utm_medium", attribution.utmMedium);
  addAttribute(attributes, "_utm_campaign", attribution.utmCampaign);
  addAttribute(attributes, "_utm_content", attribution.utmContent);
  addAttribute(attributes, "_utm_term", attribution.utmTerm);
  addAttribute(attributes, "_landing_page", landingPage);
  if (consent?.analyticsAllowed !== undefined || consent?.analytics !== undefined) {
    addAttribute(attributes, "_tc_consent_analytics", String(consent.analyticsAllowed ?? consent.analytics));
  }
  if (consent?.marketingAllowed !== undefined || consent?.marketing !== undefined) {
    addAttribute(attributes, "_tc_consent_marketing", String(consent.marketingAllowed ?? consent.marketing));
  }
  if (attributes._tc_consent_analytics || attributes._tc_consent_marketing) {
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

  async function track(eventName: TrackClearEventName, input: TrackClearEventInput = {}) {
    const attribution = { ...config.defaultAttribution, ...input.attribution };
    const consent = { ...config.defaultConsent, ...input.consent };
    const customData = { ...(input.customData ?? {}) };
    if (input.checkoutToken) customData.checkoutToken = input.checkoutToken;
    if (input.cartToken) customData.cartToken = input.cartToken;

    const response = await fetchFn(config.ingestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-TL-API-Key": config.apiKey,
      },
      body: JSON.stringify({
        eventName,
        eventId: input.eventId ?? randomId(),
        timestamp: input.timestamp ?? Date.now(),
        url: input.url ?? currentUrl(),
        referrer: input.referrer ?? currentReferrer(),
        trackclearSessionId: input.trackclearSessionId ?? config.getSessionId?.() ?? null,
        checkoutToken: input.checkoutToken ?? undefined,
        cartToken: input.cartToken ?? undefined,
        ...attribution,
        consent,
        userData: input.userData ?? {},
        customData,
      }),
      keepalive: true,
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof body.error === "string" ? body.error : "TrackClear ingest failed");
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
  };
}
