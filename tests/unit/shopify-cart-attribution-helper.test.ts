import { describe, expect, it, vi } from "vitest";
import {
  TRACKCLEAR_CART_ATTRIBUTE_KEYS,
  TRACKCLEAR_FORBIDDEN_CART_ATTRIBUTE_KEYS,
  buildCartUpdateBody,
  ensureTrackClearSessionId,
  extractShopifyCartAttribution,
  generateShopifyCartAttributionHelperCode,
  verifyCartAttributes,
  writeAndVerifyCartAttributes,
} from "@/lib/shopify-cart-attribution-helper";

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
    expect(js).toContain("trackclear_debug");
    expect(js).toContain("retrying cart update");
    expect(js).toContain("visitorConsentCollected");
    expect(js).toContain('M="STRICT"');
    expect(js).toContain('M==="STRICT"?cn.marketingAllowed===true');
    expect(js).toContain('max-age=0');

    for (const key of TRACKCLEAR_CART_ATTRIBUTE_KEYS) {
      expect(js).toContain(key);
    }
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

  it("requires explicit marketing opt-in in strict helper mode", () => {
    const { storage } = memoryStorage();
    const { cookies } = memoryCookies();

    const result = extractShopifyCartAttribution({
      url: "https://dirava.com/products/test?fbclid=FB123",
      now: 1710000000000,
      storage,
      cookies,
      consentMode: "STRICT",
      consent: {},
      generateId: () => "session_123",
    });

    expect(result.attributes._fbp).toBe("");
    expect(result.attributes._fbclid).toBe("");
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
