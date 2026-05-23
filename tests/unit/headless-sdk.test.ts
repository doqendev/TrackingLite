import { describe, expect, it, vi } from "vitest";
import {
  buildTrackClearCartAttributes,
  captureUrlAttribution,
  createTrackClearClient,
  ensureMetaAttributionCookies,
  ensureTrackClearSessionId,
  fbcClickId,
  generateFbp,
  synthesizeFbcFromFbclid,
  toShopifyCartAttributes,
  validateFbc,
  validateFbp,
  type HeadlessCookieAdapter,
  type StorageLike,
} from "@/lib/headless-sdk";

function memoryCookies(initial: Record<string, string> = {}) {
  const store = { ...initial };
  const adapter: HeadlessCookieAdapter = {
    get: (name) => store[name] ?? null,
    set: (name, value) => {
      store[name] = value;
    },
  };
  return { store, adapter };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const store = { ...initial };
  const storage: StorageLike = {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => {
      store[key] = value;
    },
  };
  return { store, storage };
}

describe("headless-sdk", () => {
  it("captures attribution from storefront URLs", () => {
    const attribution = captureUrlAttribution(
      "https://mizoke.com/products/sign?fbclid=FB123&ttclid=TT123&rdt_cid=RD123&epik=EP123&gclid=G123&utm_source=meta&utm_medium=paid&utm_campaign=launch&utm_content=ad1&utm_term=sign"
    );

    expect(attribution).toEqual({
      fbclid: "FB123",
      gbraid: null,
      wbraid: null,
      ttclid: "TT123",
      rdtCid: "RD123",
      epik: "EP123",
      gclid: "G123",
      utmSource: "meta",
      utmMedium: "paid",
      utmCampaign: "launch",
      utmContent: "ad1",
      utmTerm: "sign",
    });
  });

  it("validates and synthesizes Meta attribution cookies", async () => {
    const now = 1_712_345_678_901;
    const { adapter, store } = memoryCookies();
    const attribution = await ensureMetaAttributionCookies({
      attribution: { fbclid: "CLICK123" },
      cookies: adapter,
      now,
      random: () => 0,
    });

    expect(attribution.fbp).toBe("fb.1.1712345678901.1000000000");
    expect(attribution.fbc).toBe("fb.1.1712345678901.CLICK123");
    expect(store._fbp).toBe(attribution.fbp);
    expect(store._fbc).toBe(attribution.fbc);
    expect(validateFbp(attribution.fbp)).toBe(attribution.fbp);
    expect(validateFbc(attribution.fbc, now)).toBe(attribution.fbc);
    expect(fbcClickId(attribution.fbc)).toBe("CLICK123");
    expect(synthesizeFbcFromFbclid("CLICK123", now)).toBe(attribution.fbc);
    expect(generateFbp(now, () => 0.999999)).toMatch(/^fb\.1\.1712345678901\.\d{10}$/);
  });

  it("creates and persists a TrackClear session ID for headless storefronts", () => {
    const { adapter, store: cookieStore } = memoryCookies();
    const { storage, store: storageStore } = memoryStorage();

    const sessionId = ensureTrackClearSessionId({
      storage,
      cookies: adapter,
      generateId: () => "session_123",
    });

    expect(sessionId).toBe("session_123");
    expect(storageStore._trackclear_session_id).toBe("session_123");
    expect(cookieStore._trackclear_session_id).toBe("session_123");
  });

  it("reuses existing TrackClear session IDs and is safe without browser storage", () => {
    const { adapter } = memoryCookies({ _trackclear_session_id: "cookie_session" });

    expect(
      ensureTrackClearSessionId({
        storage: null,
        cookies: adapter,
        generateId: () => "new_session",
      })
    ).toBe("cookie_session");
    expect(
      ensureTrackClearSessionId({
        storage: null,
        cookies: null,
        generateId: () => "ssr_safe_session",
      })
    ).toBe("ssr_safe_session");
  });

  it("builds Shopify cart attributes for Hydrogen cart mutations", () => {
    const attributes = buildTrackClearCartAttributes({
      trackclearSessionId: "session_123",
      landingPage: "https://dirava.com/products/test?fbclid=FB123",
      attribution: {
        fbp: "fb.1.1712345678901.1000000000",
        fbc: "fb.1.1712345678901.FB123",
        fbclid: "FB123",
        ttclid: "TT123",
        utmSource: "meta",
      },
      consent: { analyticsAllowed: true, marketingAllowed: false },
    });

    expect(attributes).toEqual(
      expect.objectContaining({
        _trackclear_session_id: "session_123",
        _fbp: "fb.1.1712345678901.1000000000",
        _fbc: "fb.1.1712345678901.FB123",
        _fbclid: "FB123",
        _ttclid: "TT123",
        _utm_source: "meta",
        _landing_page: "https://dirava.com/products/test?fbclid=FB123",
        _tc_consent_analytics: "true",
        _tc_consent_marketing: "false",
        _tc_consent_source: "headless_storefront",
      })
    );
    expect(toShopifyCartAttributes({ _fbclid: "FB123" })).toEqual([
      { key: "_fbclid", value: "FB123" },
    ]);
  });

  it("sends TrackClear ingest payloads with attribution and session context", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, destinations: ["META"] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const client = createTrackClearClient({
      apiKey: "tl_test",
      ingestUrl: "https://api.trackclear.test/api/events/ingest",
      fetchFn,
      defaultAttribution: { fbclid: "FB123" },
      defaultConsent: { marketingAllowed: true },
      getSessionId: () => "session_123",
    });

    const result = await client.addToCart({
      eventId: "evt_123",
      timestamp: 123,
      url: "https://dirava.com/products/test",
      customData: { value: 24.99, currency: "EUR" },
      cartToken: "cart_123",
    });

    expect(result).toEqual({ success: true, destinations: ["META"] });
    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.trackclear.test/api/events/ingest",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-TL-API-Key": "tl_test",
        },
      })
    );

    const payload = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(payload).toEqual(
      expect.objectContaining({
        eventName: "AddToCart",
        eventId: "evt_123",
        timestamp: 123,
        url: "https://dirava.com/products/test",
        trackclearSessionId: "session_123",
        cartToken: "cart_123",
        fbclid: "FB123",
        consent: { marketingAllowed: true },
        customData: expect.objectContaining({
          value: 24.99,
          currency: "EUR",
          cartToken: "cart_123",
        }),
      })
    );
  });
});
