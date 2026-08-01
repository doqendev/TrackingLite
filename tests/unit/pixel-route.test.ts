import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockFindFirst = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    workspace: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));

let getPixel: typeof import("@/app/api/pixel/[workspaceId]/route").GET;
let getLegacyScript: typeof import("@/app/api/s/[workspaceId]/route").GET;

describe("GET /api/pixel/[workspaceId]", () => {
  beforeAll(async () => {
    const route = await import("@/app/api/pixel/[workspaceId]/route");
    const legacyRoute = await import("@/app/api/s/[workspaceId]/route");
    getPixel = route.GET;
    getLegacyScript = legacyRoute.GET;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_INGEST_URL = "https://api.trackclear.test/api/events/ingest";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not suppress browser fbq Purchase when Shopify webhook is not configured", async () => {
    mockFindFirst.mockResolvedValue({
      apiKey: "tl_test",
      metaPixelId: "123456",
      enableMeta: true,
      metaBrowserTrackingEnabled: false,
      consentMode: "STRICT",
      shopifyWebhookSecretEncrypted: null,
      shopifyWebhookVerifiedAt: null,
      catalogIdMode: "VARIANT_NUMERIC_ID",
      catalogIdPrefix: null,
      catalogIdSuffix: null,
      catalogIdTemplate: null,
    });

    const response = await getPixel(new Request("http://localhost/api/pixel/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    const js = await response.text();

    expect(() => new Function(js)).not.toThrow();
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=30, must-revalidate"
    );
    expect(js).toContain("var H=false;");
    expect(js).toContain('W="ws_123"');
    expect(js).toContain("\\d{7,20}");
    expect(js).toContain("o.name||co.orderName||o.id||o.admin_graphql_api_id");
    expect(js).toContain("orderId:o.id||o.name||co.orderName||null,orderName:o.name||co.orderName||null");
    expect(js).toContain('"shopify-purchase:"+W+":"+id');
    expect(js).toContain('var CM="VARIANT_NUMERIC_ID"');
    expect(js).toContain("contentIds:ci({variantId:v.id");
    expect(js).toContain("_trackclear_session_id");
    expect(js).toContain("/cart/update.js");
    expect(js).toContain("trackclearSessionId:sid");
    expect(js).toContain("gbraid:m?cid.gb:null");
    expect(js).toContain("_tc_consent_marketing");
    expect(js).toContain("_tc_consent_sale_of_data");
    expect(js).toContain("visitorConsentCollected");
    expect(js).toContain("ttp:m?ttpVal:null");
    expect(js).toContain("attributionTimestamp:_ats");
    expect(js).toContain("var _atn=Number(_ca[_ci].value);if(Number.isFinite(_atn))_ats=_atn");
    expect(js).toContain("var MB=false");
    expect(js).toContain("function bf(){return MB&&mk()");
    expect(js).toContain('if(typeof A.activate==="function")A.activate()');
    expect(js).toContain('if(!H&&bf())window.fbq("track","Purchase"');
  });

  it("does not suppress browser fbq Purchase when a saved webhook has not been verified", async () => {
    mockFindFirst.mockResolvedValue({
      apiKey: "tl_test",
      metaPixelId: "123456",
      shopifyWebhookSecretEncrypted: "encrypted-secret",
      shopifyWebhookVerifiedAt: null,
      catalogIdMode: "VARIANT_NUMERIC_ID",
      catalogIdPrefix: null,
      catalogIdSuffix: null,
      catalogIdTemplate: null,
    });

    const response = await getPixel(new Request("http://localhost/api/pixel/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    const js = await response.text();

    expect(() => new Function(js)).not.toThrow();
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=30, must-revalidate"
    );
    expect(js).toContain("var H=false;");
  });

  it("suppresses browser fbq Purchase after a signed Shopify webhook is verified", async () => {
    mockFindFirst.mockResolvedValue({
      apiKey: "tl_test",
      metaPixelId: "123456",
      shopifyWebhookSecretEncrypted: "encrypted-secret",
      shopifyWebhookVerifiedAt: new Date("2026-07-27T10:00:00.000Z"),
      catalogIdMode: "VARIANT_NUMERIC_ID",
      catalogIdPrefix: null,
      catalogIdSuffix: null,
      catalogIdTemplate: null,
    });

    const response = await getPixel(new Request("http://localhost/api/pixel/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    const js = await response.text();

    expect(() => new Function(js)).not.toThrow();
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=30, must-revalidate"
    );
    expect(js).toContain("var H=true;");
    expect(js).toContain('W="ws_123"');
    expect(js).toContain("\\d{7,20}");
    expect(js).toContain("o.name||co.orderName||o.id||o.admin_graphql_api_id");
    expect(js).toContain("orderId:o.id||o.name||co.orderName||null,orderName:o.name||co.orderName||null");
    expect(js).toContain('"shopify-purchase:"+W+":"+id');
    expect(js).toContain("_trackclear_session_id");
    expect(js).toContain("/cart/update.js");
    expect(js).toContain('if(!H&&bf())window.fbq("track","Purchase"');
  });

  it("applies the same Purchase fbq guard to the legacy /api/s script", async () => {
    mockFindFirst.mockResolvedValue({
      apiKey: "tl_test",
      metaPixelId: "123456",
      shopifyWebhookSecretEncrypted: "encrypted-secret",
      shopifyWebhookVerifiedAt: new Date("2026-07-27T10:00:00.000Z"),
      catalogIdMode: "VARIANT_NUMERIC_ID",
      catalogIdPrefix: null,
      catalogIdSuffix: null,
      catalogIdTemplate: null,
    });

    const response = await getLegacyScript(new Request("http://localhost/api/s/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    const js = await response.text();

    expect(() => new Function(js)).not.toThrow();
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=30, must-revalidate"
    );
    expect(js).toContain("var H=true;");
    expect(js).toContain('W="ws_123"');
    expect(js).toContain("\\d{7,20}");
    expect(js).toContain("o.name||co.orderName||o.id||o.admin_graphql_api_id");
    expect(js).toContain("orderId:o.id||o.name||co.orderName||null,orderName:o.name||co.orderName||null");
    expect(js).toContain('"shopify-purchase:"+W+":"+id');
    expect(js).toContain("_trackclear_session_id");
    expect(js).toContain("/cart/update.js");
    expect(js).toContain("trackclearSessionId:sid");
    expect(js).toContain('if(!H&&bf())window.fbq("track","Purchase"');
  });

  it("embeds catalog ID settings in generated pixel scripts", async () => {
    mockFindFirst.mockResolvedValue({
      apiKey: "tl_test",
      metaPixelId: "123456",
      shopifyWebhookSecretEncrypted: null,
      shopifyWebhookVerifiedAt: null,
      catalogIdMode: "SKU",
      catalogIdPrefix: "sku:",
      catalogIdSuffix: ":us",
      catalogIdTemplate: null,
    });

    const pixelResponse = await getPixel(new Request("http://localhost/api/pixel/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    const pixelJs = await pixelResponse.text();

    expect(pixelJs).toContain('var CM="SKU",CP="sku:",CS=":us",CT=""');
    expect(pixelJs).toContain("function fm(o)");
    expect(pixelJs).toContain("contentIds:ci({variantId:v.id");

    const legacyResponse = await getLegacyScript(new Request("http://localhost/api/s/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    const legacyJs = await legacyResponse.text();

    expect(legacyJs).toContain('var CM="SKU",CP="sku:",CS=":us",CT=""');
    expect(legacyJs).toContain("function fm(o)");
    expect(legacyJs).toContain("contentIds:ci({variantId:v.id");
  });

  it("uses a verified custom ingest domain in generated pixel scripts", async () => {
    mockFindFirst.mockResolvedValue({
      apiKey: "tl_test",
      metaPixelId: "123456",
      shopifyWebhookSecretEncrypted: null,
      shopifyWebhookVerifiedAt: null,
      catalogIdMode: "VARIANT_NUMERIC_ID",
      catalogIdPrefix: null,
      catalogIdSuffix: null,
      catalogIdTemplate: null,
      customIngestDomain: "t.dirava.com",
      customIngestDomainVerifiedAt: new Date("2026-05-22T10:00:00Z"),
    });

    const pixelResponse = await getPixel(new Request("http://localhost/api/pixel/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    const pixelJs = await pixelResponse.text();

    expect(pixelJs).toContain('E="https://t.dirava.com/api/events/ingest"');

    const legacyResponse = await getLegacyScript(new Request("http://localhost/api/s/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    const legacyJs = await legacyResponse.text();

    expect(legacyJs).toContain('E="https://t.dirava.com/api/events/ingest"');
  });

  it("persists and replays privacy-minimized consent revocations in both generated scripts", async () => {
    mockFindFirst.mockResolvedValue({
      apiKey: "tl_test",
      metaPixelId: "123456",
      enableMeta: true,
      metaBrowserTrackingEnabled: false,
      consentMode: "STRICT",
      shopifyWebhookSecretEncrypted: null,
      shopifyWebhookVerifiedAt: null,
      catalogIdMode: "VARIANT_NUMERIC_ID",
      catalogIdPrefix: null,
      catalogIdSuffix: null,
      catalogIdTemplate: null,
    });

    const [pixelResponse, legacyResponse] = await Promise.all([
      getPixel(new Request("http://localhost/api/pixel/ws_123"), {
        params: Promise.resolve({ workspaceId: "ws_123" }),
      }),
      getLegacyScript(new Request("http://localhost/api/s/ws_123"), {
        params: Promise.resolve({ workspaceId: "ws_123" }),
      }),
    ]);
    const scripts = [await pixelResponse.text(), await legacyResponse.text()];

    for (const js of scripts) {
      expect(() => new Function(js)).not.toThrow();
      expect(js).toContain('_trackclear_pending_consent_v1');
      expect(js).toContain('onlyDestinations:[]');
      expect(js).toContain('userData:{}');
      expect(js).toContain('if(dn(c))');
      expect(js).toContain('await dz({id:x.id,generation:x.generation},r.ok)');
      expect(js).toContain('await rr()');
      expect(js).toContain('DC=Promise.resolve()');
      expect(js).toContain('DX=2592000000');
      expect(js).toContain('function dk(f)');
      expect(js).toContain('LK="trackclear-consent-revocation-v1"');
      expect(js).toContain('navigator.locks.request(LK,f)');
      expect(js).toContain('.sort(function(a,b)');
      expect(js).toContain('}).slice(-DM)');
      expect(js).toContain('x.generation!==ref.generation');
      expect(js).toContain('generation:ref.generation');
      expect(js).not.toContain('.filter(function(x){return x.id!==id})');
      expect(js).not.toContain('must-not-be-persisted@example.com');
    }
    expect(scripts[0]).toContain('B.localStorage.getItem(DK)');
    expect(scripts[0]).toContain('B.sessionStorage.getItem(DK)');
    expect(scripts[0]).toContain('B.localStorage.setItem(DK,v)');
    expect(scripts[1]).toContain('localStorage.getItem(DK)');
    expect(scripts[1]).toContain('sessionStorage.getItem(DK)');
    expect(scripts[1]).toContain('localStorage.setItem(DK,v)');
  });

  it("merges independent local and session consent queues before replay", async () => {
    mockFindFirst.mockResolvedValue({
      apiKey: "tl_test",
      metaPixelId: "123456",
      enableMeta: true,
      metaBrowserTrackingEnabled: false,
      tiktokBrowserTrackingEnabled: false,
      consentMode: "STRICT",
      shopifyWebhookSecretEncrypted: null,
      shopifyWebhookVerifiedAt: null,
      catalogIdMode: "VARIANT_NUMERIC_ID",
      catalogIdPrefix: null,
      catalogIdSuffix: null,
      catalogIdTemplate: null,
    });
    const response = await getLegacyScript(new Request("http://localhost/api/s/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    const js = await response.text();
    const now = Date.now();
    const pending = (eventId: string, generation: string, createdAt: number) => ({
      id: `${eventId}:${now}`,
      generation,
      payload: {
        eventName: "PageView",
        eventId,
        timestamp: now,
        url: "",
        referrer: "",
        trackclearSessionId: `session-${eventId}`,
        consent: { marketingAllowed: false },
        userData: {},
        customData: {},
        onlyDestinations: [],
      },
      createdAt,
      attempts: 0,
      nextAttemptAt: 0,
    });
    const localValues = new Map<string, string>([[
      "_trackclear_pending_consent_v1",
      JSON.stringify([pending("local-only", "generation-local", now)]),
    ]]);
    const sessionValues = new Map<string, string>([[
      "_trackclear_pending_consent_v1",
      JSON.stringify([pending("session-only", "generation-session", now - 1_000)]),
    ]]);
    const storageAdapter = (values: Map<string, string>) => ({
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    });
    vi.stubGlobal("window", {
      __tl: {
        analytics: { subscribe: vi.fn() },
        customerPrivacy: { subscribe: vi.fn() },
        init: {
          customerPrivacy: {
            analyticsProcessingAllowed: true,
            marketingAllowed: true,
          },
        },
      },
    });
    vi.stubGlobal("document", { cookie: "", referrer: "" });
    vi.stubGlobal("location", { href: "https://shop.example/products/test" });
    vi.stubGlobal("localStorage", storageAdapter(localValues));
    vi.stubGlobal("sessionStorage", storageAdapter(sessionValues));
    vi.stubGlobal("crypto", { randomUUID: () => "session-id" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })
    );
    vi.stubGlobal("fetch", fetchMock);

    new Function(js)();

    await vi.waitFor(() => {
      const eventIds = fetchMock.mock.calls
        .filter(([input]) => String(input).includes("/api/events/ingest"))
        .map(([, init]) => JSON.parse(String((init as RequestInit).body)).eventId);
      expect(eventIds).toEqual(["session-only", "local-only"]);
    });
    await vi.waitFor(() => {
      expect(JSON.parse(localValues.get("_trackclear_pending_consent_v1") ?? "[]")).toEqual([]);
      expect(JSON.parse(sessionValues.get("_trackclear_pending_consent_v1") ?? "[]")).toEqual([]);
    });
  });

  it("keeps same-identity generated denials as separate generations when both fail", async () => {
    mockFindFirst.mockResolvedValue({
      apiKey: "tl_test",
      metaPixelId: "123456",
      enableMeta: true,
      metaBrowserTrackingEnabled: false,
      tiktokBrowserTrackingEnabled: false,
      consentMode: "STRICT",
      shopifyWebhookSecretEncrypted: null,
      shopifyWebhookVerifiedAt: null,
      catalogIdMode: "VARIANT_NUMERIC_ID",
      catalogIdPrefix: null,
      catalogIdSuffix: null,
      catalogIdTemplate: null,
    });
    const response = await getLegacyScript(new Request("http://localhost/api/s/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    const js = await response.text();
    let consentCallback: ((event: { customerPrivacy: Record<string, boolean> }) => void) | undefined;
    const values = new Map<string, string>();
    const storageAdapter = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
    const lockRequest = vi.fn(async (
      _name: string,
      callback: () => unknown | Promise<unknown>
    ) => callback());
    vi.stubGlobal("window", {
      __tl: {
        analytics: { subscribe: vi.fn() },
        customerPrivacy: {
          subscribe: vi.fn((_name: string, callback: typeof consentCallback) => {
            consentCallback = callback;
          }),
        },
        init: {
          customerPrivacy: {
            analyticsProcessingAllowed: true,
            marketingAllowed: true,
          },
        },
      },
    });
    vi.stubGlobal("document", { cookie: "", referrer: "" });
    vi.stubGlobal("location", { href: "https://shop.example/products/test" });
    vi.stubGlobal("localStorage", storageAdapter);
    vi.stubGlobal("sessionStorage", storageAdapter);
    vi.stubGlobal("navigator", { locks: { request: lockRequest } });
    vi.stubGlobal("crypto", { randomUUID: () => "same-generated-denial" });
    vi.stubGlobal("setTimeout", vi.fn());
    vi.stubGlobal("fetch", vi.fn((input: string | URL | Request) => Promise.resolve(
      new Response("{}", { status: String(input).includes("/cart/update.js") ? 200 : 500 })
    )));
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);

    try {
      new Function(js)();
      consentCallback?.({
        customerPrivacy: { analyticsProcessingAllowed: true, marketingAllowed: false },
      });
      await vi.waitFor(() => {
        expect(JSON.parse(values.get("_trackclear_pending_consent_v1") ?? "[]")).toHaveLength(1);
      });
      consentCallback?.({
        customerPrivacy: { analyticsProcessingAllowed: false, marketingAllowed: true },
      });
      await vi.waitFor(() => {
        const pending = JSON.parse(values.get("_trackclear_pending_consent_v1") ?? "[]");
        expect(pending).toHaveLength(2);
        expect(new Set(pending.map((entry: { generation: string }) => entry.generation)).size).toBe(2);
        expect(pending.map((entry: { payload: { consent: Record<string, boolean> } }) =>
          entry.payload.consent
        )).toEqual(expect.arrayContaining([
          { analyticsAllowed: true, marketingAllowed: false },
          { analyticsAllowed: false, marketingAllowed: true },
        ]));
      });
      expect(lockRequest).toHaveBeenCalled();
      expect(lockRequest.mock.calls.every(([name]) =>
        name === "trackclear-consent-revocation-v1"
      )).toBe(true);
    } finally {
      dateNow.mockRestore();
    }
  });

  it("gates Meta and TikTok browser SDKs behind explicit workspace ownership", async () => {
    mockFindFirst.mockResolvedValue({
      apiKey: "tl_test",
      metaPixelId: "123456",
      enableMeta: true,
      metaBrowserTrackingEnabled: true,
      tiktokPixelId: "TT-PIXEL-123",
      enableTikTok: true,
      tiktokBrowserTrackingEnabled: true,
      consentMode: "STRICT",
      shopifyWebhookSecretEncrypted: null,
      shopifyWebhookVerifiedAt: null,
      catalogIdMode: "VARIANT_NUMERIC_ID",
      catalogIdPrefix: null,
      catalogIdSuffix: null,
      catalogIdTemplate: null,
    });

    const [pixelResponse, legacyResponse] = await Promise.all([
      getPixel(new Request("http://localhost/api/pixel/ws_123"), {
        params: Promise.resolve({ workspaceId: "ws_123" }),
      }),
      getLegacyScript(new Request("http://localhost/api/s/ws_123"), {
        params: Promise.resolve({ workspaceId: "ws_123" }),
      }),
    ]);
    const scripts = [await pixelResponse.text(), await legacyResponse.text()];

    for (const js of scripts) {
      expect(() => new Function(js)).not.toThrow();
      expect(js).toContain("var MB=true");
      expect(js).toContain("var TB=true");
      expect(js).toContain('M="STRICT"');
      expect(js).toContain("https://connect.facebook.net/en_US/fbevents.js");
      expect(js).toContain("https://analytics.tiktok.com/i18n/pixel/events.js");
      expect(js).toContain('window.fbq("consent","grant")');
      expect(js).toContain('window.fbq("consent","revoke")');
      expect(js).toContain("window.ttq.grantConsent()");
      expect(js).toContain("window.ttq.revokeConsent()");
      expect(js).toContain('window.ttq.track("Pageview",{},{event_id:id})');
      expect(js).toContain('window.ttq.track("ViewContent",td(cd),{event_id:id})');
      expect(js).toContain('window.ttq.track("AddToCart",td(cd),{event_id:id})');
      expect(js).toContain('window.ttq.track("InitiateCheckout",td(cd),{event_id:id})');
      expect(js).toContain('window.ttq.track("CompletePayment",td(cd),{event_id:id})');
      expect(js).not.toContain("window.ttq.page(");
    }
    expect(scripts[0]).toContain('ttpVal=await B.cookie.get("_ttp")||ttpVal');
    expect(scripts[1]).toContain('ttpVal=gc("_ttp")||ttpVal');
    expect(scripts[0]).toContain('null,["KLAVIYO"]');
  });

  it("does not load browser SDKs before strict consent and revokes them after denial", async () => {
    mockFindFirst.mockResolvedValue({
      apiKey: "tl_test",
      metaPixelId: "123456",
      enableMeta: true,
      metaBrowserTrackingEnabled: true,
      tiktokPixelId: "TT-PIXEL-123",
      enableTikTok: true,
      tiktokBrowserTrackingEnabled: true,
      consentMode: "STRICT",
      shopifyWebhookSecretEncrypted: null,
      shopifyWebhookVerifiedAt: null,
      catalogIdMode: "VARIANT_NUMERIC_ID",
      catalogIdPrefix: null,
      catalogIdSuffix: null,
      catalogIdTemplate: null,
    });
    const response = await getLegacyScript(new Request("http://localhost/api/s/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    const js = await response.text();

    let consentCallback: ((event: { customerPrivacy: Record<string, boolean> }) => void) | undefined;
    const insertedScripts: Array<{ src?: string }> = [];
    const storage = new Map<string, string>();
    const storageAdapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    };
    const windowMock: Record<string, any> = {
      __tl: {
        analytics: { subscribe: vi.fn() },
        customerPrivacy: {
          subscribe: vi.fn((_name: string, callback: typeof consentCallback) => {
            consentCallback = callback;
          }),
        },
        init: { customerPrivacy: {} },
      },
    };
    const documentMock: Record<string, any> = {
      cookie: "",
      referrer: "",
      createElement: vi.fn(() => ({})),
      getElementsByTagName: vi.fn(() => [{
        parentNode: { insertBefore: (node: { src?: string }) => insertedScripts.push(node) },
      }]),
      head: { appendChild: (node: { src?: string }) => insertedScripts.push(node) },
    };
    vi.stubGlobal("window", windowMock);
    vi.stubGlobal("document", documentMock);
    vi.stubGlobal("location", { href: "https://shop.example/products/test?fbclid=FB123" });
    vi.stubGlobal("localStorage", storageAdapter);
    vi.stubGlobal("sessionStorage", storageAdapter);
    let ingestAvailable = false;
    const fetchMock = vi.fn((input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input);
      const status = url.includes("/cart/update.js") || ingestAvailable ? 200 : 500;
      return Promise.resolve(new Response("{}", { status }));
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("setTimeout", vi.fn());
    vi.stubGlobal("crypto", { randomUUID: () => "session-123" });

    new Function(js)();
    expect(insertedScripts).toHaveLength(0);
    expect(windowMock.fbq).toBeUndefined();
    expect(windowMock.ttq).toBeUndefined();

    consentCallback?.({
      customerPrivacy: {
        analyticsProcessingAllowed: true,
        marketingAllowed: true,
        saleOfDataAllowed: true,
      },
    });
    expect(insertedScripts.map((script) => script.src)).toEqual(expect.arrayContaining([
      "https://connect.facebook.net/en_US/fbevents.js",
      expect.stringContaining("https://analytics.tiktok.com/i18n/pixel/events.js"),
    ]));
    expect(windowMock.fbq.queue.some((entry: IArguments) => Array.from(entry).join(":") === "consent:grant")).toBe(true);
    expect(windowMock.fbq.queue.some((entry: IArguments) => Array.from(entry).join(":") === "init:123456")).toBe(true);
    expect(windowMock.ttq.some((entry: unknown[]) => entry[0] === "grantConsent")).toBe(true);

    consentCallback?.({
      customerPrivacy: {
        analyticsProcessingAllowed: true,
        marketingAllowed: true,
        saleOfDataAllowed: false,
      },
    });
    expect(windowMock.fbq.queue.some((entry: IArguments) => Array.from(entry).join(":") === "consent:revoke")).toBe(true);
    expect(windowMock.ttq.some((entry: unknown[]) => entry[0] === "revokeConsent")).toBe(true);

    await vi.waitFor(() => {
      const raw = storage.get("_trackclear_pending_consent_v1");
      expect(raw).toBeDefined();
      expect(JSON.parse(raw!)).toHaveLength(1);
    });
    const pending = JSON.parse(storage.get("_trackclear_pending_consent_v1")!);
    expect(pending[0].payload).toMatchObject({
      consent: {
        analyticsAllowed: true,
        marketingAllowed: true,
        saleOfDataAllowed: false,
      },
      userData: {},
      customData: {},
      onlyDestinations: [],
    });

    ingestAvailable = true;
    pending[0].nextAttemptAt = 0;
    storage.set("_trackclear_pending_consent_v1", JSON.stringify(pending));
    new Function(js)();
    await vi.waitFor(() => {
      expect(JSON.parse(storage.get("_trackclear_pending_consent_v1") ?? "[]")).toEqual([]);
    });
    const ingestPayloads = fetchMock.mock.calls
      .filter(([input]) => String(input).includes("/api/events/ingest"))
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(ingestPayloads.some((payload) =>
      payload.url === "" && Array.isArray(payload.onlyDestinations) && payload.onlyDestinations.length === 0
    )).toBe(true);
  });
});
