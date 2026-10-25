import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CART_HELPER_CONSENT_WAIT_MS,
  CART_HELPER_WRITE_CACHE_KEY,
  CART_HELPER_WRITE_REUSE_MS,
  TRACKCLEAR_CART_ATTRIBUTE_KEYS,
  TRACKCLEAR_FORBIDDEN_CART_ATTRIBUTE_KEYS,
  buildCartUpdateBody,
  cartAttributeSignature,
  ensureTrackClearSessionId,
  extractShopifyCartAttribution,
  generateShopifyCartAttributionHelperCode,
  isForeignAttributeOnlyCartUpdate,
  resolveHelperMarketingState,
  shouldSkipCartAttributeWrite,
  verifyCartAttributes,
  writeAndVerifyCartAttributes,
} from "@/lib/shopify-cart-attribution-helper";
import { updateOpenAIClickContext } from "@/lib/openai-click-context";

function memoryStorage(initial: Record<string, string> = {}) {
  const store = { ...initial };
  return {
    store,
    storage: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
    },
  };
}

function memoryCookies(initial: Record<string, string> = {}) {
  const store = { ...initial };
  return {
    store,
    cookies: {
      get: (key: string) => store[key] ?? null,
      set: (key: string, value: string) => {
        store[key] = value;
      },
    },
  };
}

describe("Shopify cart attribution helper", () => {
  it("generates helper JavaScript with cart write, cart verification, and attribution fields", () => {
    const js = generateShopifyCartAttributionHelperCode("ws_123", "STRICT");

    expect(() => new Function(js)).not.toThrow();
    expect(js).toContain("_trackclear_session_id");
    expect(js).toContain("/cart/update.js");
    expect(js).toContain("/cart.js");
    expect(js).toContain("_fbp");
    expect(js).toContain("_fbc");
    expect(js).toContain("_fbclid");
    expect(js).toContain("_gclid");
    expect(js).toContain("_gbraid");
    expect(js).toContain("_wbraid");
    expect(js).toContain("_ttclid");
    expect(js).toContain("_ttp");
    expect(js).toContain("_utm_source");
    expect(js).toContain("_utm_campaign");
    expect(js).toContain("_landing_page");
    expect(js).toContain("_tc_attribution_timestamp");
    expect(js).toContain("_tc_attribution_source");
    expect(js).toContain("_tc_consent_analytics");
    expect(js).toContain("_tc_consent_marketing");
    expect(js).toContain("_tc_consent_sale_of_data");
    expect(js).toContain("trackclear_debug");
    expect(js).toContain("retrying cart update");
    expect(js).toContain("visitorConsentCollected");
    expect(js).toContain('M="STRICT"');
    expect(js).toContain("resolveHelperMarketingState(M,cn)");
    expect(js).toContain('name:"consent-tracking-api"');
    expect(js).toContain("shouldSkipCartAttributeWrite");
    expect(js).toContain("isForeignAttributeOnlyCartUpdate");
    expect(js).toContain('max-age=0');

    for (const key of TRACKCLEAR_CART_ATTRIBUTE_KEYS) {
      expect(js).toContain(key);
    }
  });

  it("keeps backslashes out of the helper's own code, which the production minifier strips", () => {
    let own = generateShopifyCartAttributionHelperCode("ws_123", "LAX", true);
    for (const fn of [
      updateOpenAIClickContext,
      resolveHelperMarketingState,
      isForeignAttributeOnlyCartUpdate,
      cartAttributeSignature,
      shouldSkipCartAttributeWrite,
    ]) {
      own = own.replace(fn.toString(), "");
    }

    expect(own).not.toContain("\\");
  });

  it("extracts click IDs and UTM values from the landing URL", () => {
    const { storage } = memoryStorage();
    const { cookies } = memoryCookies();

    const result = extractShopifyCartAttribution({
      url: "https://dirava.com/products/test?fbclid=FB123&ttclid=TT123&gbraid=GB123&wbraid=WB123&utm_source=meta&utm_campaign=test",
      now: 1710000000000,
      storage,
      cookies,
      generateId: () => "session_123",
      generateFbpRandom: () => "1234567890",
    });

    expect(result.attributes._trackclear_session_id).toBe("session_123");
    expect(result.attributes._fbclid).toBe("FB123");
    expect(result.attributes._ttclid).toBe("TT123");
    expect(result.attributes._gbraid).toBe("GB123");
    expect(result.attributes._wbraid).toBe("WB123");
    expect(result.attributes._utm_source).toBe("meta");
    expect(result.attributes._utm_campaign).toBe("test");
    expect(result.attributes._fbc).toBe("fb.1.1710000000000.FB123");
    expect(result.attributes._fbp).toBe("fb.1.1710000000000.1234567890");
    expect(result.attributes._landing_page).toContain("https://dirava.com/products/test");
    expect(result.attributes._tc_attribution_timestamp).toBe("1710000000000");
    expect(result.attributes._tc_attribution_source).toBe("meta");
  });

  it("replaces stale cross-channel URL context and captures an existing TikTok cookie", () => {
    const { storage } = memoryStorage({
      _tc_cart_attr_context: JSON.stringify({
        fbclid: "OLD_META_CLICK",
        utmSource: "facebook",
        utmCampaign: "old_campaign",
        capturedAt: "1709999999000",
      }),
    });
    const { cookies } = memoryCookies({ _ttp: "TTP123" });

    const result = extractShopifyCartAttribution({
      url: "https://dirava.com/products/test?ttclid=NEW_TIKTOK_CLICK&utm_source=tiktok",
      now: 1710000000000,
      storage,
      cookies,
      generateId: () => "session_123",
      generateFbpRandom: () => "1234567890",
    });

    expect(result.attributes._fbclid).toBe("");
    expect(result.attributes._ttclid).toBe("NEW_TIKTOK_CLICK");
    expect(result.attributes._ttp).toBe("TTP123");
    expect(result.attributes._utm_source).toBe("tiktok");
    expect(result.attributes._utm_campaign).toBe("");
    expect(result.attributes._tc_attribution_source).toBe("tiktok");
  });

  it("does not create or retain advertising identifiers after explicit marketing denial", () => {
    const { storage, store: storageStore } = memoryStorage({
      _fbp: "fb.1.1710000000000.1234567890",
      _tc_cart_attr_context: JSON.stringify({
        fbclid: "OLD_CLICK",
        ttclid: "OLD_TT",
        capturedAt: "1709999999000",
        source: "meta",
      }),
    });
    const { cookies, store } = memoryCookies({
      _fbp: "fb.1.1710000000000.1234567890",
      _ttp: "TTP123",
    });

    const result = extractShopifyCartAttribution({
      url: "https://dirava.com/products/test?fbclid=FB123",
      now: 1710000000000,
      storage,
      cookies,
      consent: { marketingAllowed: false },
      generateId: () => "session_123",
    });

    expect(result.attributes._fbp).toBe("");
    expect(result.attributes._fbc).toBe("");
    expect(result.attributes._fbclid).toBe("");
    expect(result.attributes._ttp).toBe("");
    expect(store._fbp).toBe("");
    expect(store._ttp).toBe("");
    expect(store._fbc).toBe("");
    const storedContext = JSON.parse(storageStore._tc_cart_attr_context);
    expect(storedContext).not.toHaveProperty("fbclid");
    expect(storedContext).not.toHaveProperty("ttclid");
    expect(storedContext).not.toHaveProperty("source");
  });

  it("neither creates nor strips advertising identifiers in strict mode while consent is unknown", () => {
    const { storage } = memoryStorage();
    const { cookies, store } = memoryCookies({ _fbp: "fb.1.1710000000000.1234567890" });

    const result = extractShopifyCartAttribution({
      url: "https://dirava.com/products/test?fbclid=FB123",
      now: 1710000000000,
      storage,
      cookies,
      consentMode: "STRICT",
      consent: {},
      generateId: () => "session_123",
    });

    expect(result.attributes).not.toHaveProperty("_fbp");
    expect(result.attributes).not.toHaveProperty("_fbclid");
    expect(result.attributes._trackclear_session_id).toBe("session_123");
    expect(store._fbp).toBe("fb.1.1710000000000.1234567890");
  });

  it("writes advertising identifiers in strict mode once marketing is explicitly allowed", () => {
    const { storage } = memoryStorage();
    const { cookies } = memoryCookies({ _fbp: "fb.1.1710000000000.1234567890" });

    const result = extractShopifyCartAttribution({
      url: "https://dirava.com/products/test?fbclid=FB123",
      now: 1710000000000,
      storage,
      cookies,
      consentMode: "STRICT",
      consent: { marketingAllowed: true },
      generateId: () => "session_123",
    });

    expect(result.attributes._fbp).toBe("fb.1.1710000000000.1234567890");
    expect(result.attributes._fbclid).toBe("FB123");
  });

  it("clears advertising identifiers after a sale or sharing opt-out", () => {
    const { storage } = memoryStorage();
    const { cookies } = memoryCookies({ _fbp: "fb.1.1710000000000.1234567890" });

    const result = extractShopifyCartAttribution({
      url: "https://dirava.com/products/test?fbclid=FB123",
      now: 1710000000000,
      storage,
      cookies,
      consent: { marketingAllowed: true, saleOfDataAllowed: false },
      generateId: () => "session_123",
    });

    expect(result.attributes._fbp).toBe("");
    expect(result.attributes._fbclid).toBe("");
    expect(result.attributes._tc_consent_marketing).toBe("true");
    expect(result.attributes._tc_consent_sale_of_data).toBe("false");
  });

  it("reuses an existing TrackClear session ID", () => {
    const { storage, store: storageStore } = memoryStorage({
      _trackclear_session_id: "existing_session",
    });
    const { cookies, store: cookieStore } = memoryCookies();

    const result = ensureTrackClearSessionId({
      storage,
      cookies,
      generateId: () => "new_session",
    });

    expect(result).toEqual({ sessionId: "existing_session", generated: false });
    expect(storageStore._trackclear_session_id).toBe("existing_session");
    expect(cookieStore._trackclear_session_id).toBe("existing_session");
  });

  it("generates and persists a missing TrackClear session ID", () => {
    const { storage, store: storageStore } = memoryStorage();
    const { cookies, store: cookieStore } = memoryCookies();

    const result = ensureTrackClearSessionId({
      storage,
      cookies,
      generateId: () => "generated_session",
    });

    expect(result).toEqual({ sessionId: "generated_session", generated: true });
    expect(storageStore._trackclear_session_id).toBe("generated_session");
    expect(cookieStore._trackclear_session_id).toBe("generated_session");
  });

  it("builds cart update bodies and verifies cart attributes", () => {
    const attributes = {
      _trackclear_session_id: "session_123",
      _fbclid: "FB123",
      _utm_campaign: "test",
    };

    expect(buildCartUpdateBody(attributes)).toContain(
      "attributes%5B_trackclear_session_id%5D=session_123"
    );
    expect(verifyCartAttributes(attributes, attributes)).toEqual([]);
    expect(verifyCartAttributes(attributes, { _fbclid: "FB123" })).toEqual([
      "_trackclear_session_id",
      "_utm_campaign",
    ]);
  });

  it("writes and verifies empty values so stale cart attribution can be cleared", () => {
    const attributes = { _fbclid: "", _ttclid: "NEW_CLICK" };

    expect(buildCartUpdateBody(attributes)).toContain("attributes%5B_fbclid%5D=");
    expect(verifyCartAttributes(attributes, { _ttclid: "NEW_CLICK" })).toEqual([]);
  });

  it("posts attributes and verifies them through /cart.js", async () => {
    const fetcher = vi.fn(async (input: string) => {
      if (input === "/cart.js") {
        return {
          json: async () => ({
            attributes: {
              _trackclear_session_id: "session_123",
              _fbclid: "FB123",
            },
          }),
        };
      }
      return { json: async () => ({}) };
    });

    const result = await writeAndVerifyCartAttributes(
      { _trackclear_session_id: "session_123", _fbclid: "FB123" },
      { fetcher }
    );

    expect(result).toEqual({ ok: true, missing: [], attempts: 1, verified: true });
    expect(fetcher).toHaveBeenCalledWith(
      "/cart/update.js",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: expect.stringContaining("attributes%5B_fbclid%5D=FB123"),
      })
    );
    expect(fetcher).toHaveBeenCalledWith(
      "/cart.js",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("retries once when verification is missing attributes", async () => {
    let verifyCount = 0;
    const fetcher = vi.fn(async (input: string) => {
      if (input === "/cart.js") {
        verifyCount += 1;
        return {
          json: async () => ({
            attributes:
              verifyCount === 1
                ? { _fbclid: "FB123" }
                : { _trackclear_session_id: "session_123", _fbclid: "FB123" },
          }),
        };
      }
      return { json: async () => ({}) };
    });

    const result = await writeAndVerifyCartAttributes(
      { _trackclear_session_id: "session_123", _fbclid: "FB123" },
      { fetcher }
    );

    expect(result).toEqual({ ok: true, missing: [], attempts: 2, verified: true });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("does not throw or block when cart writes fail", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("network blocked");
    });

    const result = await writeAndVerifyCartAttributes(
      { _trackclear_session_id: "session_123" },
      { fetcher }
    );

    expect(result).toEqual({
      ok: false,
      missing: ["request_failed"],
      attempts: 1,
      verified: false,
    });
  });

  it("does not define forbidden raw PII cart attributes", () => {
    const js = generateShopifyCartAttributionHelperCode("ws_123");

    for (const key of TRACKCLEAR_FORBIDDEN_CART_ATTRIBUTE_KEYS) {
      expect(TRACKCLEAR_CART_ATTRIBUTE_KEYS).not.toContain(key);
      expect(js).not.toContain(`_${key}`);
      expect(js).not.toContain(`"${key}"`);
    }
  });
});

describe("cart helper decisions", () => {
  it("treats an explicit refusal as a denial in both modes and silence differently per mode", () => {
    expect(resolveHelperMarketingState("LAX", { marketingAllowed: false })).toBe("denied");
    expect(resolveHelperMarketingState("STRICT", { marketingAllowed: false })).toBe("denied");
    expect(resolveHelperMarketingState("LAX", { marketingAllowed: true, saleOfDataAllowed: false })).toBe("denied");
    expect(resolveHelperMarketingState("STRICT", { marketingAllowed: true })).toBe("allowed");
    expect(resolveHelperMarketingState("LAX", {})).toBe("allowed");
    expect(resolveHelperMarketingState("LAX", null)).toBe("allowed");
    expect(resolveHelperMarketingState("STRICT", {})).toBe("unknown");
    expect(resolveHelperMarketingState("STRICT", undefined)).toBe("unknown");
  });

  it("recognizes another script's attribute-only cart writes and nothing else", () => {
    const base = "https://shop.example/products/sign";
    const own = TRACKCLEAR_CART_ATTRIBUTE_KEYS;

    expect(isForeignAttributeOnlyCartUpdate("/cart/update.js?attributes[fbp]=fb.1.1.1&attributes[country]=US", undefined, base, own)).toBe(true);
    expect(isForeignAttributeOnlyCartUpdate("/cart/update", "attributes%5Bvisitor%5D=v1&note=hi", base, own)).toBe(true);
    expect(isForeignAttributeOnlyCartUpdate("/cart/update.js", JSON.stringify({ attributes: { visitor: "v1" } }), base, own)).toBe(true);
    expect(isForeignAttributeOnlyCartUpdate("/cart/update.js", new URLSearchParams("attributes[visitor]=v1"), base, own)).toBe(true);
    const form = new FormData();
    form.append("attributes[visitor]", "v1");
    expect(isForeignAttributeOnlyCartUpdate({ url: "https://shop.example/cart/update.js" }, form, base, own)).toBe(true);

    // TrackClear's own keys, item changes, other endpoints and unreadable bodies are cart changes.
    expect(isForeignAttributeOnlyCartUpdate("/cart/update.js?attributes[_fbp]=", undefined, base, own)).toBe(false);
    expect(isForeignAttributeOnlyCartUpdate("/cart/update.js", JSON.stringify({ attributes: { _trackclear_session_id: "x" } }), base, own)).toBe(false);
    expect(isForeignAttributeOnlyCartUpdate("/cart/update.js", "updates%5B123%5D=2", base, own)).toBe(false);
    expect(isForeignAttributeOnlyCartUpdate("/cart/update.js", JSON.stringify({ attributes: { visitor: "v1" }, sections: "cart" }), base, own)).toBe(false);
    expect(isForeignAttributeOnlyCartUpdate("/cart/add.js", "id=1&quantity=1", base, own)).toBe(false);
    expect(isForeignAttributeOnlyCartUpdate("/cart/update.js", new Blob(["attributes[visitor]=v1"]), base, own)).toBe(false);
    expect(isForeignAttributeOnlyCartUpdate("/cart/update.js", undefined, base, own)).toBe(false);
  });

  it("signs cart attributes without the consent timestamp and independent of key order", () => {
    const first = cartAttributeSignature({ _fbp: "a", _trackclear_session_id: "s", _tc_consent_timestamp: "1" });
    const second = cartAttributeSignature({ _tc_consent_timestamp: "2", _trackclear_session_id: "s", _fbp: "a" });

    expect(first).toBe(second);
    expect(cartAttributeSignature({ _fbp: "b", _trackclear_session_id: "s" })).not.toBe(first);
    expect(first).not.toContain("_fbp");
    expect(first).toMatch(/^[0-9a-z]+\.[0-9a-z]+$/);
  });

  it("skips a write only for the same cart, the same values and a recent verification", () => {
    const now = 1792929600000;
    const cache = { token: "cart-1", signature: "sig", verifiedAt: now - 1000 };

    expect(shouldSkipCartAttributeWrite(cache, "cart-1", "sig", now, CART_HELPER_WRITE_REUSE_MS)).toBe(true);
    expect(shouldSkipCartAttributeWrite(cache, "cart-2", "sig", now, CART_HELPER_WRITE_REUSE_MS)).toBe(false);
    expect(shouldSkipCartAttributeWrite(cache, "cart-1", "other", now, CART_HELPER_WRITE_REUSE_MS)).toBe(false);
    expect(shouldSkipCartAttributeWrite(cache, null, "sig", now, CART_HELPER_WRITE_REUSE_MS)).toBe(false);
    expect(shouldSkipCartAttributeWrite({}, "cart-1", "sig", now, CART_HELPER_WRITE_REUSE_MS)).toBe(false);
    expect(
      shouldSkipCartAttributeWrite(cache, "cart-1", "sig", now + CART_HELPER_WRITE_REUSE_MS, CART_HELPER_WRITE_REUSE_MS)
    ).toBe(false);
  });
});

type Listener = (event: { detail?: unknown; target?: unknown }) => void;
type PrivacyAnswers = { marketingAllowed?: boolean; analyticsProcessingAllowed?: boolean; saleOfDataAllowed?: boolean };
type RecordedRequest = { path: string; method: string; body: string | null };

const ALLOWED: PrivacyAnswers = { marketingAllowed: true, analyticsProcessingAllowed: true, saleOfDataAllowed: true };
const NOT_ALLOWED: PrivacyAnswers = { marketingAllowed: false, analyticsProcessingAllowed: false, saleOfDataAllowed: true };

// One shopper's browser across page loads: cookies, localStorage and the
// Shopify cart persist, while each loadHelperPage() call is a fresh page.
function createProfile(cookies: Record<string, string> = {}, storage: Record<string, string> = {}) {
  return {
    cookies: new Map(Object.entries(cookies)),
    cookieWrites: [] as string[],
    storage: new Map(Object.entries(storage)),
    cart: { token: null as string | null, attributes: {} as Record<string, string> },
    requests: [] as RecordedRequest[],
  };
}
type Profile = ReturnType<typeof createProfile>;

function giveCart(profile: Profile, attributes: Record<string, string> = {}) {
  profile.cart.token = "c1-token?key=abc";
  profile.cart.attributes = { ...attributes };
  profile.cookies.set("cart", encodeURIComponent(profile.cart.token));
}

function cartServer(profile: Profile) {
  return vi.fn(async (input: unknown, init?: { method?: string; body?: unknown }) => {
    const raw = input && typeof input === "object" && "url" in input ? String((input as { url: string }).url) : String(input);
    const url = new URL(raw, "https://shop.example");
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? init.body : null;
    profile.requests.push({ path: url.pathname, method, body });
    if (url.pathname === "/cart/update.js" || url.pathname === "/cart/add.js") {
      if (!profile.cart.token) giveCart(profile, profile.cart.attributes);
      const params = new URLSearchParams(body && !body.startsWith("{") ? body : url.search);
      params.forEach((value, key) => {
        const match = /^attributes\[(.+)\]$/.exec(key);
        if (!match) return;
        if (value === "") delete profile.cart.attributes[match[1]];
        else profile.cart.attributes[match[1]] = value;
      });
    }
    return { json: async () => ({ token: profile.cart.token, attributes: { ...profile.cart.attributes } }) };
  });
}

function loadHelperPage(
  profile: Profile,
  options: {
    mode?: "STRICT" | "LAX";
    openAI?: boolean;
    url?: string;
    // "none": no Shopify privacy API on the page at all. "silent": an API whose
    // methods answer nothing and whose loader never calls back.
    privacy: "none" | "silent" | { answers: PrivacyAnswers; loadDelayMs: number };
  }
) {
  const documentListeners: Record<string, Listener[]> = {};
  const windowListeners: Record<string, Listener[]> = {};
  const fetchMock = cartServer(profile);
  const privacy = options.privacy;
  const shopify: Record<string, unknown> = {};
  if (privacy === "silent") {
    shopify.customerPrivacy = { marketingAllowed: () => undefined, analyticsProcessingAllowed: () => undefined };
    shopify.loadFeatures = vi.fn();
  } else if (privacy !== "none") {
    shopify.loadFeatures = vi.fn((_features: unknown, callback: (error?: unknown) => void) => {
      setTimeout(() => {
        shopify.customerPrivacy = {
          marketingAllowed: () => privacy.answers.marketingAllowed,
          analyticsProcessingAllowed: () => privacy.answers.analyticsProcessingAllowed,
          saleOfDataAllowed: () => privacy.answers.saleOfDataAllowed,
        };
        callback();
      }, privacy.loadDelayMs);
    });
  }

  class FakeXHR {
    private listeners: Array<() => void> = [];
    open(_method: string, _url: string) {}
    send(_body?: unknown) {
      setTimeout(() => this.listeners.forEach((listener) => listener()), 0);
    }
    addEventListener(_type: string, listener: () => void) {
      this.listeners.push(listener);
    }
  }

  const fakeDocument = {
    readyState: "complete",
    get cookie() {
      return Array.from(profile.cookies, ([name, value]) => `${name}=${value}`).join("; ");
    },
    set cookie(value: string) {
      profile.cookieWrites.push(value);
      const [pair, ...flags] = value.split(";");
      const name = pair.slice(0, pair.indexOf("=")).trim();
      if (flags.some((flag) => flag.trim() === "max-age=0")) profile.cookies.delete(name);
      else profile.cookies.set(name, pair.slice(pair.indexOf("=") + 1));
    },
    addEventListener(type: string, listener: Listener) {
      (documentListeners[type] ||= []).push(listener);
    },
  };
  const fakeWindow = {
    Shopify: privacy === "none" ? undefined : shopify,
    fetch: fetchMock as unknown as (input: unknown, init?: { method?: string; body?: unknown }) => Promise<unknown>,
    XMLHttpRequest: FakeXHR,
    addEventListener(type: string, listener: Listener) {
      (windowListeners[type] ||= []).push(listener);
    },
  };
  const fakeStorage = {
    getItem: (key: string) => profile.storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      profile.storage.set(key, String(value));
    },
    removeItem: (key: string) => {
      profile.storage.delete(key);
    },
  };

  const js = generateShopifyCartAttributionHelperCode("ws_123", options.mode ?? "LAX", options.openAI ?? false);
  new Function("window", "document", "localStorage", "location", "fetch", "XMLHttpRequest", "setTimeout", "clearTimeout", js)(
    fakeWindow,
    fakeDocument,
    fakeStorage,
    { href: options.url ?? "https://shop.example/products/sign" },
    fetchMock,
    FakeXHR,
    setTimeout,
    clearTimeout
  );

  return {
    window: fakeWindow,
    shopify,
    XMLHttpRequest: FakeXHR,
    dispatchDocument: (type: string, event: { detail?: unknown } = {}) =>
      (documentListeners[type] || []).forEach((listener) => listener(event)),
    dispatchWindow: (type: string) => (windowListeners[type] || []).forEach((listener) => listener({})),
  };
}

function helperWrites(profile: Profile) {
  return profile.requests.filter(
    (request) => request.path === "/cart/update.js" && (request.body ?? "").includes("_trackclear_session_id")
  );
}

describe("generated cart helper on a storefront", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for Shopify's consent answer and writes no ad identifiers where marketing is not allowed", async () => {
    const profile = createProfile();
    const page = loadHelperPage(profile, { privacy: { answers: NOT_ALLOWED, loadDelayMs: 500 } });

    await vi.advanceTimersByTimeAsync(400);
    expect(helperWrites(profile)).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(400);
    expect(page.shopify.loadFeatures).toHaveBeenCalledWith(
      [{ name: "consent-tracking-api", version: "0.2" }],
      expect.any(Function)
    );
    expect(helperWrites(profile)).toHaveLength(1);
    expect(helperWrites(profile)[0].body).toContain("attributes%5B_fbp%5D=&");
    expect(profile.cart.attributes._tc_consent_marketing).toBe("false");
    expect(profile.cart.attributes).not.toHaveProperty("_fbp");
    expect(profile.cookies.has("_fbp")).toBe(false);
    expect(profile.cookieWrites.some((write) => write.startsWith("_fbp=fb."))).toBe(false);
  });

  it("takes the decision from visitorConsentCollected when the privacy API answers nothing", async () => {
    const profile = createProfile();
    const page = loadHelperPage(profile, { privacy: "silent" });

    await vi.advanceTimersByTimeAsync(100);
    expect(helperWrites(profile)).toHaveLength(0);
    page.dispatchDocument("visitorConsentCollected", {
      detail: { marketingAllowed: false, analyticsAllowed: true, saleOfDataAllowed: true },
    });
    await vi.advanceTimersByTimeAsync(200);

    expect(helperWrites(profile)).toHaveLength(1);
    expect(profile.cart.attributes._tc_consent_marketing).toBe("false");
    expect(profile.cart.attributes._tc_consent_analytics).toBe("true");
    expect(profile.cookieWrites.some((write) => write.startsWith("_fbp=fb."))).toBe(false);
  });

  it("keeps LAX allow-by-default only after Shopify gave no answer within the wait", async () => {
    const profile = createProfile();
    loadHelperPage(profile, { privacy: "silent" });

    await vi.advanceTimersByTimeAsync(CART_HELPER_CONSENT_WAIT_MS - 200);
    expect(helperWrites(profile)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(400);

    expect(helperWrites(profile)).toHaveLength(1);
    expect(profile.cart.attributes._fbp).toMatch(/^fb\.1\.\d{13}\.\d{10}$/);
    expect(profile.cart.attributes).not.toHaveProperty("_tc_consent_marketing");
  });

  it("leaves ad identifiers, cookies and ChatGPT click context alone in STRICT mode while consent is unknown", async () => {
    const fbp = "fb.1.1792900000000.1234567890";
    const click = JSON.stringify({ value: "opp_1", capturedAt: Date.now() - 1000 });
    const profile = createProfile({ _fbp: fbp }, { _tc_openai_click: click });
    giveCart(profile, { _fbp: fbp, _trackclear_oppref: "opp_1" });

    loadHelperPage(profile, { mode: "STRICT", openAI: true, privacy: "none" });
    await vi.advanceTimersByTimeAsync(300);

    expect(helperWrites(profile)).toHaveLength(1);
    expect(helperWrites(profile)[0].body).not.toContain("attributes%5B_fbp%5D");
    expect(helperWrites(profile)[0].body).not.toContain("attributes%5B_trackclear_oppref%5D");
    expect(profile.cart.attributes._fbp).toBe(fbp);
    expect(profile.cart.attributes._trackclear_oppref).toBe("opp_1");
    expect(profile.cookies.get("_fbp")).toBe(fbp);
    expect(profile.storage.get("_tc_openai_click")).toBe(click);
  });

  it("writes ad identifiers where marketing is allowed and leaves an unchanged cart alone on later pages", async () => {
    const profile = createProfile();
    loadHelperPage(profile, { privacy: { answers: ALLOWED, loadDelayMs: 50 } });
    await vi.advanceTimersByTimeAsync(300);

    expect(helperWrites(profile)).toHaveLength(1);
    expect(profile.cart.attributes._fbp).toMatch(/^fb\.1\./);
    expect(profile.cart.attributes._tc_consent_marketing).toBe("true");
    expect(JSON.parse(profile.storage.get(CART_HELPER_WRITE_CACHE_KEY) ?? "{}")).toMatchObject({
      token: profile.cart.token,
    });

    const nextPage = loadHelperPage(profile, {
      url: "https://shop.example/collections/all",
      privacy: { answers: ALLOWED, loadDelayMs: 50 },
    });
    await vi.advanceTimersByTimeAsync(300);
    nextPage.dispatchWindow("pageshow");
    nextPage.dispatchWindow("pagehide");
    await vi.advanceTimersByTimeAsync(300);

    const cartRequests = profile.requests.filter((r) => r.path === "/cart/update.js" || r.path === "/cart.js");
    expect(cartRequests.map((r) => r.path)).toEqual(["/cart/update.js", "/cart.js"]);
  });

  it("ignores other scripts' attribute-only cart writes and re-verifies after a real cart change", async () => {
    const profile = createProfile();
    const page = loadHelperPage(profile, { privacy: { answers: ALLOWED, loadDelayMs: 50 } });
    await vi.advanceTimersByTimeAsync(300);
    expect(helperWrites(profile)).toHaveLength(1);

    for (let i = 0; i < 6; i += 1) {
      await page.window.fetch("/cart/update.js?attributes[fbp]=fb.1.1.1&attributes[country]=US");
      await vi.advanceTimersByTimeAsync(1250);
    }
    await page.window.fetch("/cart/update.js", {
      method: "POST",
      body: JSON.stringify({ attributes: { visitor: "v1" } }),
    });
    const xhr = new page.XMLHttpRequest();
    xhr.open("POST", "/cart/update.js");
    xhr.send("attributes%5Bvisitor%5D=v2");
    await vi.advanceTimersByTimeAsync(500);
    expect(helperWrites(profile)).toHaveLength(1);

    await page.window.fetch("/cart/add.js", { method: "POST", body: "id=1&quantity=1" });
    await vi.advanceTimersByTimeAsync(500);
    expect(helperWrites(profile)).toHaveLength(2);

    const change = new page.XMLHttpRequest();
    change.open("POST", "/cart/change.js");
    change.send("id=1&quantity=0");
    await vi.advanceTimersByTimeAsync(500);
    expect(helperWrites(profile)).toHaveLength(3);
  });
});
