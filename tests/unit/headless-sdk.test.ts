import { describe, expect, it, vi } from "vitest";
import {
  buildTrackClearCartAttributes,
  captureTikTokAttributionCookie,
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
    removeItem: (key) => {
      delete store[key];
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
      attributionTimestamp: expect.any(Number),
      attributionSource: "meta",
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

  it("creates and persists a TrackClear session ID for headless storefronts", async () => {
    const { adapter, store: cookieStore } = memoryCookies();
    const { storage, store: storageStore } = memoryStorage();

    const sessionId = await ensureTrackClearSessionId({
      storage,
      cookies: adapter,
      generateId: () => "session_123",
    });

    expect(sessionId).toBe("session_123");
    expect(storageStore._trackclear_session_id).toBe("session_123");
    expect(cookieStore._trackclear_session_id).toBe("session_123");
  });

  it("reuses existing TrackClear session IDs and is safe without browser storage", async () => {
    const { adapter } = memoryCookies({ _trackclear_session_id: "cookie_session" });

    expect(
      await ensureTrackClearSessionId({
        storage: null,
        cookies: adapter,
        generateId: () => "new_session",
      })
    ).toBe("cookie_session");
    expect(
      await ensureTrackClearSessionId({
        storage: null,
        cookies: null,
        generateId: () => "ssr_safe_session",
      })
    ).toBe("ssr_safe_session");
  });

  it("awaits asynchronous headless cookie adapters", async () => {
    const set = vi.fn(async () => undefined);
    const sessionId = await ensureTrackClearSessionId({
      storage: null,
      cookies: { get: async () => "async_cookie_session", set },
      generateId: () => "should_not_generate",
    });

    expect(sessionId).toBe("async_cookie_session");
    expect(set).toHaveBeenCalledWith(
      "_trackclear_session_id",
      "async_cookie_session",
      expect.objectContaining({ path: "/", sameSite: "Lax" })
    );
  });

  it("captures an existing TikTok first-party cookie only when marketing is allowed", async () => {
    const { adapter, store } = memoryCookies({ _ttp: "ttp_cookie_123" });

    await expect(captureTikTokAttributionCookie({ cookies: adapter })).resolves.toEqual({
      ttp: "ttp_cookie_123",
    });
    await expect(
      captureTikTokAttributionCookie({ cookies: adapter, consent: { marketingAllowed: false } })
    ).resolves.toEqual({ ttp: null });
    expect(store._ttp).toBe("");
  });

  it("expires Meta cookies when marketing is denied or missing in strict mode", async () => {
    const { adapter, store } = memoryCookies({
      _fbp: "fb.1.1712345678901.1000000000",
      _fbc: "fb.1.1712345678901.FB123",
    });

    await expect(ensureMetaAttributionCookies({
      attribution: { fbclid: "FB123" },
      cookies: adapter,
      consent: {},
      consentMode: "STRICT",
    })).resolves.toMatchObject({ fbp: null, fbc: null });
    expect(store._fbp).toBe("");
    expect(store._fbc).toBe("");
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
        ttp: "TTP123",
        utmSource: "meta",
        attributionTimestamp: 1712345678901,
        attributionSource: "meta",
      },
      consent: {
        analyticsAllowed: true,
        marketingAllowed: true,
        saleOfDataAllowed: true,
      },
    });

    expect(attributes).toEqual(
      expect.objectContaining({
        _trackclear_session_id: "session_123",
        _fbp: "fb.1.1712345678901.1000000000",
        _fbc: "fb.1.1712345678901.FB123",
        _fbclid: "FB123",
        _ttclid: "TT123",
        _ttp: "TTP123",
        _tc_attribution_timestamp: "1712345678901",
        _tc_attribution_source: "meta",
        _utm_source: "meta",
        _landing_page: "https://dirava.com/products/test?fbclid=FB123",
        _tc_consent_analytics: "true",
        _tc_consent_marketing: "true",
        _tc_consent_sale_of_data: "true",
        _tc_consent_source: "headless_storefront",
      })
    );
    expect(toShopifyCartAttributes({ _fbclid: "FB123" })).toEqual([
      { key: "_fbclid", value: "FB123" },
    ]);
  });

  it("writes blank advertising cart attributes after marketing denial", () => {
    const attributes = buildTrackClearCartAttributes({
      attribution: {
        fbp: "fb.1.1712345678901.1000000000",
        fbc: "fb.1.1712345678901.FB123",
        fbclid: "FB123",
        ttclid: "TT123",
      },
      consent: { analyticsAllowed: true, marketingAllowed: false },
    });

    expect(attributes).toMatchObject({
      _fbp: "",
      _fbc: "",
      _fbclid: "",
      _ttclid: "",
      _tc_consent_marketing: "false",
    });
  });

  it("writes blank advertising attributes after a sale or sharing opt-out", () => {
    const attributes = buildTrackClearCartAttributes({
      attribution: {
        fbp: "fb.1.1712345678901.1000000000",
        fbclid: "FB123",
        ttclid: "TT123",
      },
      consent: {
        analyticsAllowed: true,
        marketingAllowed: true,
        saleOfDataAllowed: false,
      },
    });

    expect(attributes).toMatchObject({
      _fbp: "",
      _fbclid: "",
      _ttclid: "",
      _tc_consent_marketing: "true",
      _tc_consent_sale_of_data: "false",
    });
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

  it("generates and reuses a fallback session anchor when none is configured", async () => {
    const { storage, store } = memoryStorage();
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const client = createTrackClearClient({
      apiKey: "tl_test",
      ingestUrl: "https://api.trackclear.test/api/events/ingest",
      fetchFn,
      storage,
    });

    await client.pageView({ eventId: "fallback-session-1" });
    await client.pageView({
      eventId: "fallback-session-2",
      consent: { marketingAllowed: false },
    });

    const payloads = fetchFn.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(payloads[0].trackclearSessionId).toMatch(/\S+/);
    expect(payloads[1].trackclearSessionId).toBe(payloads[0].trackclearSessionId);
    expect(store._trackclear_session_id).toBe(payloads[0].trackclearSessionId);
  });

  it("gives event-level consent aliases precedence and emits only canonical server keys", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const client = createTrackClearClient({
      apiKey: "tl_test",
      ingestUrl: "https://api.trackclear.test/api/events/ingest",
      fetchFn,
      defaultConsent: { analytics: false, marketingAllowed: true },
    });

    await client.pageView({
      eventId: "evt_alias_precedence",
      consent: { analyticsAllowed: true, marketing: false },
    });

    const payload = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(payload.consent).toEqual({
      analyticsAllowed: true,
      marketingAllowed: false,
    });
    expect(payload.consent).not.toHaveProperty("analytics");
    expect(payload.consent).not.toHaveProperty("marketing");
  });

  it("strips marketing identity and PII from denied headless payloads", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, destinations: ["GA4"] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const client = createTrackClearClient({
      apiKey: "tl_test",
      ingestUrl: "https://api.trackclear.test/api/events/ingest",
      fetchFn,
      consentMode: "STRICT",
      defaultAttribution: {
        fbp: "fb.1.1712345678901.1000000000",
        fbclid: "FB123",
        ttclid: "TT123",
        gaClientId: "123.456",
      },
      defaultConsent: { analyticsAllowed: true, marketingAllowed: false },
    });

    await client.purchase({
      eventId: "evt_denied",
      userData: { email: "private@example.com", phone: "+351910000000" },
      customData: { value: 24.99, currency: "EUR" },
    });

    const payload = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(payload).toMatchObject({
      fbp: null,
      fbc: null,
      fbclid: null,
      ttclid: null,
      gaClientId: "123.456",
      userData: {},
    });
    expect(JSON.stringify(payload)).not.toContain("private@example.com");
  });

  it("persists failed consent revocations and replays only the minimal no-destination payload", async () => {
    const { storage, store } = memoryStorage();
    const failedFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "temporary failure" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );
    const firstClient = createTrackClearClient({
      apiKey: "tl_test",
      ingestUrl: "https://api.trackclear.test/api/events/ingest",
      fetchFn: failedFetch,
      storage,
      now: () => 1_800_000_000_000,
    });

    await expect(firstClient.pageView({
      eventId: "evt_consent_denial",
      timestamp: 1_800_000_000_000,
      trackclearSessionId: "session_123",
      consent: { analyticsAllowed: false, marketingAllowed: false },
      userData: { email: "must-not-be-persisted@example.com" },
    })).rejects.toThrow("temporary failure");

    const pending = JSON.parse(store._trackclear_pending_consent_v1);
    expect(pending).toHaveLength(1);
    expect(pending[0].generation).toEqual(expect.any(String));
    expect(pending[0].payload).toMatchObject({
      eventName: "PageView",
      eventId: "evt_consent_denial",
      timestamp: 1_800_000_000_000,
      trackclearSessionId: "session_123",
      consent: { analyticsAllowed: false, marketingAllowed: false },
      userData: {},
      customData: {},
      onlyDestinations: [],
    });
    expect(JSON.stringify(pending)).not.toContain("must-not-be-persisted@example.com");

    const replayFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const replayClient = createTrackClearClient({
      apiKey: "tl_test",
      ingestUrl: "https://api.trackclear.test/api/events/ingest",
      fetchFn: replayFetch,
      storage,
      now: () => 1_800_000_010_000,
    });
    await replayClient.flushPendingConsentRevocations();

    expect(replayFetch).toHaveBeenCalledTimes(1);
    const replayed = JSON.parse(replayFetch.mock.calls[0][1].body);
    expect(replayed.onlyDestinations).toEqual([]);
    expect(store._trackclear_pending_consent_v1).toBeUndefined();
  });

  it("replays a privacy-minimized denial throughout the 30-day client window", async () => {
    const now = 1_800_000_000_000;
    const denialAt = now - 29 * 24 * 60 * 60 * 1000;
    const { storage, store } = memoryStorage({
      _trackclear_pending_consent_v1: JSON.stringify([{
        id: `retained-denial:${denialAt}`,
        generation: "retained-generation",
        payload: {
          eventName: "PageView",
          eventId: "retained-denial",
          timestamp: denialAt,
          url: "",
          referrer: "",
          trackclearSessionId: "retained-session",
          consent: { marketingAllowed: false },
          userData: {},
          customData: {},
          onlyDestinations: [],
        },
        createdAt: denialAt,
        attempts: 0,
        nextAttemptAt: 0,
      }]),
    });
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const client = createTrackClearClient({
      apiKey: "tl_test",
      ingestUrl: "https://api.trackclear.test/api/events/ingest",
      fetchFn,
      storage,
      now: () => now,
    });

    await client.flushPendingConsentRevocations();

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchFn.mock.calls[0][1].body))).toMatchObject({
      eventId: "retained-denial",
      timestamp: denialAt,
      onlyDestinations: [],
    });
    expect(store._trackclear_pending_consent_v1).toBeUndefined();
  });

  it("does not let an old replay settlement delete a newer denial with the same event identity", async () => {
    const eventId = "same-denial";
    const eventTimestamp = 1_800_000_001_000;
    const { storage, store } = memoryStorage({
      _trackclear_pending_consent_v1: JSON.stringify([{
        id: `${eventId}:${eventTimestamp}`,
        generation: "old-generation",
        payload: {
          eventName: "PageView",
          eventId,
          timestamp: eventTimestamp,
          url: "",
          referrer: "",
          trackclearSessionId: "old-session",
          consent: { marketingAllowed: false },
          userData: {},
          customData: {},
          onlyDestinations: [],
        },
        createdAt: 1_800_000_000_000,
        attempts: 0,
        nextAttemptAt: 0,
      }]),
    });
    let releaseOld!: (response: Response) => void;
    const oldResponse = new Promise<Response>((resolve) => { releaseOld = resolve; });
    let ingestCalls = 0;
    const fetchFn = vi.fn((_url: string, _init?: RequestInit) => {
      ingestCalls += 1;
      if (ingestCalls === 1) return oldResponse;
      return Promise.resolve(new Response(JSON.stringify({ error: "temporary" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }));
    });
    const client = createTrackClearClient({
      apiKey: "tl_test",
      ingestUrl: "https://api.trackclear.test/api/events/ingest",
      fetchFn: fetchFn as typeof fetch,
      storage,
      now: () => 1_800_000_001_000,
    });
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));

    const current = client.pageView({
      eventId,
      timestamp: eventTimestamp,
      trackclearSessionId: "new-session",
      consent: { marketingAllowed: false },
    }).then(
      () => ({ error: null as Error | null }),
      (error: Error) => ({ error })
    );
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    releaseOld(new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    expect((await current).error?.message).toBe("temporary");
    await vi.waitFor(() => {
      const pending = JSON.parse(store._trackclear_pending_consent_v1);
      expect(pending).toHaveLength(1);
      expect(pending[0]).toMatchObject({
        id: `${eventId}:${eventTimestamp}`,
        payload: { eventId, timestamp: eventTimestamp },
      });
      expect(pending[0].generation).not.toBe("old-generation");
    });
  });

  it("retains different failed denial generations with the same event identity", async () => {
    const eventId = "same-denial-both-fail";
    const eventTimestamp = 1_800_000_001_000;
    const { storage, store } = memoryStorage({
      _trackclear_pending_consent_v1: JSON.stringify([{
        id: `${eventId}:${eventTimestamp}`,
        generation: "old-marketing-generation",
        payload: {
          eventName: "PageView",
          eventId,
          timestamp: eventTimestamp,
          url: "",
          referrer: "",
          trackclearSessionId: "old-session",
          consent: { marketingAllowed: false },
          userData: {},
          customData: {},
          onlyDestinations: [],
        },
        createdAt: 1_800_000_000_000,
        attempts: 0,
        nextAttemptAt: 0,
      }]),
    });
    let releaseOld!: (response: Response) => void;
    const oldResponse = new Promise<Response>((resolve) => { releaseOld = resolve; });
    let ingestCalls = 0;
    const fetchFn = vi.fn(() => {
      ingestCalls += 1;
      if (ingestCalls === 1) return oldResponse;
      return Promise.resolve(new Response(JSON.stringify({ error: "temporary" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }));
    });
    const client = createTrackClearClient({
      apiKey: "tl_test",
      ingestUrl: "https://api.trackclear.test/api/events/ingest",
      fetchFn: fetchFn as typeof fetch,
      storage,
      now: () => eventTimestamp,
    });
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));

    const current = client.pageView({
      eventId,
      timestamp: eventTimestamp,
      trackclearSessionId: "new-session",
      consent: { analyticsAllowed: false },
    }).then(
      () => ({ error: null as Error | null }),
      (error: Error) => ({ error })
    );
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    releaseOld(new Response(JSON.stringify({ error: "temporary" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }));

    expect((await current).error?.message).toBe("temporary");
    await vi.waitFor(() => {
      const pending = JSON.parse(store._trackclear_pending_consent_v1);
      expect(pending).toHaveLength(2);
      expect(new Set(pending.map((entry: { generation: string }) => entry.generation)).size).toBe(2);
      expect(pending.map((entry: { payload: { consent: Record<string, boolean> } }) =>
        entry.payload.consent
      )).toEqual(expect.arrayContaining([
        { marketingAllowed: false },
        { analyticsAllowed: false },
      ]));
    });
  });

  it("uses the shared Web Lock when the browser exposes the Web Locks API", async () => {
    const lockRequest = vi.fn(async (
      _name: string,
      callback: () => unknown | Promise<unknown>
    ) => callback());
    vi.stubGlobal("navigator", { locks: { request: lockRequest } });
    const { storage } = memoryStorage();
    const client = createTrackClearClient({
      apiKey: "tl_test",
      ingestUrl: "https://api.trackclear.test/api/events/ingest",
      fetchFn: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })),
      storage,
      now: () => 1_800_000_000_000,
    });

    try {
      await client.pageView({
        eventId: "locked-denial",
        timestamp: 1_800_000_000_000,
        consent: { marketingAllowed: false },
      });
      expect(lockRequest).toHaveBeenCalled();
      expect(lockRequest.mock.calls.every(([name]) =>
        name === "trackclear-consent-revocation-v1"
      )).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("retains a volatile denial queue when browser storage throws", async () => {
    let clock = 1_800_000_000_000;
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => { throw new Error("storage blocked"); },
      removeItem: () => { throw new Error("storage blocked"); },
    };
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "temporary" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    const client = createTrackClearClient({
      apiKey: "tl_test",
      ingestUrl: "https://api.trackclear.test/api/events/ingest",
      fetchFn,
      storage,
      now: () => clock,
    });

    await expect(client.pageView({
      eventId: "volatile-denial",
      timestamp: clock,
      trackclearSessionId: "session-volatile",
      consent: { analyticsAllowed: false },
    })).rejects.toThrow("temporary");
    clock += 10_000;
    await client.flushPendingConsentRevocations();
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchFn.mock.calls[1][1].body))).toMatchObject({
      eventId: "volatile-denial",
      onlyDestinations: [],
    });
  });

  it("replaces corrupt stored revocation JSON with a valid queued denial", async () => {
    const { storage, store } = memoryStorage({
      _trackclear_pending_consent_v1: "{not-json",
    });
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "temporary" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );
    const client = createTrackClearClient({
      apiKey: "tl_test",
      ingestUrl: "https://api.trackclear.test/api/events/ingest",
      fetchFn,
      storage,
      now: () => 1_800_000_000_000,
    });

    await expect(client.pageView({
      eventId: "replacement-denial",
      timestamp: 1_800_000_000_000,
      trackclearSessionId: "session-replacement",
      consent: { marketingAllowed: false },
    })).rejects.toThrow("temporary");
    expect(JSON.parse(store._trackclear_pending_consent_v1)).toHaveLength(1);
  });
});
