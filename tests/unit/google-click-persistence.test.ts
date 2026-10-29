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

const DAY = 24 * 60 * 60 * 1000;
const workspace = {
  apiKey: "tl_test",
  metaPixelId: "123456",
  enableMeta: true,
  metaBrowserTrackingEnabled: false,
  tiktokPixelId: null,
  enableTikTok: false,
  tiktokBrowserTrackingEnabled: false,
  enableOpenAI: false,
  consentMode: "LAX",
  shopifyWebhookSecretEncrypted: null,
  shopifyWebhookVerifiedAt: null,
  catalogIdMode: "VARIANT_NUMERIC_ID",
  catalogIdPrefix: null,
  catalogIdSuffix: null,
  catalogIdTemplate: null,
  customIngestDomain: null,
  customIngestDomainVerifiedAt: null,
};

type Handler = (event: unknown) => unknown;
type Payload = Record<string, unknown>;

const ALLOWED = { analyticsProcessingAllowed: true, marketingAllowed: true, saleOfDataAllowed: true };
const variant = {
  id: "gid://shopify/ProductVariant/11",
  title: "One Piece sign",
  price: { amount: "39.01", currencyCode: "EUR" },
  product: { id: "gid://shopify/Product/22", type: "Sign" },
};

function ingestPayloads(fetchMock: ReturnType<typeof vi.fn>): Payload[] {
  return fetchMock.mock.calls.flatMap((args) => {
    const [url, options] = args as unknown as [string, RequestInit];
    return String(url).includes("/api/events/ingest") ? [JSON.parse(String(options.body))] : [];
  });
}

function cartWrites(fetchMock: ReturnType<typeof vi.fn>): Array<Record<string, string>> {
  return fetchMock.mock.calls.flatMap((args) => {
    const [url, options] = args as unknown as [string, RequestInit];
    if (!String(url).includes("/cart/update.js")) return [];
    const attributes: Record<string, string> = {};
    new URLSearchParams(String(options.body)).forEach((value, key) => {
      const match = /^attributes\[(.+)\]$/.exec(key);
      if (match) attributes[match[1]] = value;
    });
    return [attributes];
  });
}

// One page load of the Custom Pixel: the URL, what an earlier page stored and
// the cart's attributes are what the shopper's browser brings to it.
async function loadPixelPage(options: {
  href: string;
  stored?: Record<string, unknown>;
  cart?: Array<{ key: string; value: string }>;
  privacy?: Record<string, boolean>;
}) {
  const handlers: Record<string, Handler> = {};
  const values = new Map<string, string>();
  if (options.stored) values.set("_tc", JSON.stringify(options.stored));
  const storage = {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const context = { document: { location: { href: options.href } } };
  vi.stubGlobal("window", {
    __tcAnalytics: { subscribe: (name: string, callback: Handler) => { handlers[name] = callback; } },
    __tcBrowser: {
      localStorage: storage,
      sessionStorage: storage,
      cookie: { get: async () => "", set: async () => {} },
    },
    __tcInit: { customerPrivacy: options.privacy ?? ALLOWED, context, data: { cart: { attributes: options.cart ?? [] } } },
    __tcCustomerPrivacy: { subscribe: () => {} },
  });
  vi.stubGlobal("document", { cookie: "", referrer: "" });
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("setTimeout", vi.fn());
  const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  const response = await getPixel(new Request("https://trackclear.example/api/pixel/ws_123"), {
    params: Promise.resolve({ workspaceId: "ws_123" }),
  });
  new Function(await response.text())();
  await vi.waitFor(() => expect(Object.keys(handlers)).toHaveLength(7));
  const event = { timestamp: new Date().toISOString(), context, data: {} };
  return {
    stored: () => JSON.parse(values.get("_tc") ?? "{}") as Record<string, unknown>,
    async pageView() {
      handlers.page_viewed(event);
      await vi.waitFor(() => expect(ingestPayloads(fetchMock).length).toBeGreaterThanOrEqual(1));
      return ingestPayloads(fetchMock)[0];
    },
    async addToCart() {
      handlers.product_added_to_cart({
        ...event,
        data: { cartLine: { merchandise: variant, quantity: 1, cost: { totalAmount: { amount: "39.01", currencyCode: "EUR" } } } },
      });
      await vi.waitFor(() => expect(cartWrites(fetchMock).length).toBeGreaterThanOrEqual(1));
      return cartWrites(fetchMock)[0];
    },
  };
}

describe("Google click kept through later visits (Custom Pixel)", () => {
  beforeAll(async () => {
    getPixel = (await import("@/app/api/pixel/[workspaceId]/route")).GET;
    getLegacyScript = (await import("@/app/api/s/[workspaceId]/route")).GET;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_INGEST_URL = "https://api.trackclear.test/api/events/ingest";
    mockFindFirst.mockResolvedValue(workspace);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores a new Google click with its own capture time", async () => {
    const before = Date.now();
    const page = await loadPixelPage({ href: "https://shop.example/products/sign?gclid=G1" });
    const payload = await page.pageView();

    expect(payload).toMatchObject({ gclid: "G1", attributionSource: "google" });
    expect(payload.googleClickCapturedAt).toBeGreaterThanOrEqual(before);
    expect(payload.googleClickCapturedAt).toBeLessThanOrEqual(Date.now());
    expect(page.stored()).toMatchObject({ gl: "G1", ga: payload.googleClickCapturedAt });
  });

  it("keeps the Google click and its time through a later Meta ad click", async () => {
    const clickedAt = Date.now() - 10 * DAY;
    const page = await loadPixelPage({
      href: "https://shop.example/products/sign?fbclid=F1",
      stored: { sid: "s1", gl: "G1", ga: clickedAt, ca: clickedAt, so: "google" },
    });
    const payload = await page.pageView();

    expect(payload).toMatchObject({ fbclid: "F1", gclid: "G1", googleClickCapturedAt: clickedAt, attributionSource: "meta" });
    expect(payload.attributionTimestamp).not.toBe(clickedAt);
    const cart = await page.addToCart();
    expect(cart).toMatchObject({ _fbclid: "F1", _gclid: "G1", _tc_google_click_at: String(clickedAt),
      _tc_attribution_source: "meta" });
  });

  it("keeps the Google click through an email link without calling the visit a Google touch", async () => {
    const clickedAt = Date.now() - 3 * DAY;
    const page = await loadPixelPage({
      href: "https://shop.example/?utm_source=newsletter&utm_medium=email",
      stored: { sid: "s1", gl: "G1", ga: clickedAt, ca: clickedAt, so: "google" },
    });
    const payload = await page.pageView();

    expect(payload).toMatchObject({ gclid: "G1", googleClickCapturedAt: clickedAt, attributionSource: "newsletter",
      utmSource: "newsletter" });
  });

  it("keeps a returning visit's original touch time and landing page", async () => {
    const clickedAt = Date.now() - 5 * DAY;
    const landing = "https://shop.example/landing?gclid=G1";
    const page = await loadPixelPage({
      href: "https://shop.example/products/sign",
      stored: { sid: "s1", lp: landing, gl: "G1", ga: clickedAt, ca: clickedAt, so: "google" },
    });
    const payload = await page.pageView();

    expect(payload).toMatchObject({ gclid: "G1", googleClickCapturedAt: clickedAt, attributionTimestamp: clickedAt,
      attributionSource: "google" });
    expect(page.stored()).toMatchObject({ ca: clickedAt, lp: landing });
  });

  it("replaces the Google click only with a newer one", async () => {
    const before = Date.now();
    const page = await loadPixelPage({
      href: "https://shop.example/?gbraid=B2",
      stored: { sid: "s1", gl: "G1", ga: Date.now() - 2 * DAY, ca: Date.now() - 2 * DAY, so: "google" },
    });
    const payload = await page.pageView();

    expect(payload).toMatchObject({ gbraid: "B2", gclid: null });
    expect(payload.googleClickCapturedAt).toBeGreaterThanOrEqual(before);
  });

  it("drops a Google click older than 90 days while later touches stay", async () => {
    const page = await loadPixelPage({
      href: "https://shop.example/products/sign",
      stored: { sid: "s1", gl: "G1", ga: Date.now() - 91 * DAY, fb: "F0", ca: Date.now() - 10 * DAY, so: "meta" },
    });
    const payload = await page.pageView();

    expect(payload).toMatchObject({ gclid: null, googleClickCapturedAt: null, fbclid: "F0", attributionSource: "meta" });
    expect(page.stored()).toMatchObject({ gl: null, ga: null });
  });

  it("dates a click stored before capture times by that context's touch", async () => {
    const touchedAt = Date.now() - 4 * DAY;
    const page = await loadPixelPage({
      href: "https://shop.example/?fbclid=F1",
      stored: { sid: "s1", gl: "G1", ca: touchedAt, so: "google" },
    });

    expect(await page.pageView()).toMatchObject({ gclid: "G1", googleClickCapturedAt: touchedAt });
  });

  it("recovers a dated Google click from the cart, but not an undated one on a new touch", async () => {
    const clickedAt = Date.now() - 6 * DAY;
    const dated = await loadPixelPage({
      href: "https://shop.example/?fbclid=F1",
      cart: [{ key: "_gclid", value: "G1" }, { key: "_tc_google_click_at", value: String(clickedAt) }],
    });
    expect(await dated.pageView()).toMatchObject({ gclid: "G1", googleClickCapturedAt: clickedAt, fbclid: "F1" });

    vi.unstubAllGlobals();
    const undated = await loadPixelPage({
      href: "https://shop.example/?fbclid=F1",
      cart: [{ key: "_gclid", value: "G1" }],
    });
    expect(await undated.pageView()).toMatchObject({ gclid: null, googleClickCapturedAt: null });
  });

  it("clears the Google click and its time when marketing is denied", async () => {
    const page = await loadPixelPage({
      href: "https://shop.example/products/sign",
      stored: { sid: "s1", gl: "G1", ga: Date.now() - DAY, ca: Date.now() - DAY, so: "google" },
      privacy: { ...ALLOWED, marketingAllowed: false },
    });
    const payload = await page.pageView();

    expect(payload).toMatchObject({ gclid: null, googleClickCapturedAt: null });
    expect(page.stored()).toMatchObject({ gl: null, ga: null });
    expect(await page.addToCart()).toMatchObject({ _gclid: "", _tc_google_click_at: "" });
  });

  it("keeps the Google click through a later Meta click in the legacy script too", async () => {
    const clickedAt = Date.now() - 8 * DAY;
    const handlers: Record<string, Handler> = {};
    const values = new Map<string, string>([
      ["_tc", JSON.stringify({ sid: "s1", gl: "G1", ga: clickedAt, ca: clickedAt, so: "google" })],
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
    vi.stubGlobal("window", {
      __tl: {
        analytics: { subscribe: (name: string, callback: Handler) => { handlers[name] = callback; } },
        customerPrivacy: { subscribe: vi.fn() },
        init: { customerPrivacy: ALLOWED },
      },
    });
    vi.stubGlobal("document", { referrer: "", cookie: "" });
    vi.stubGlobal("location", { href: "https://shop.example/products/sign?fbclid=F1" });
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("crypto", { randomUUID: () => "event-id" });
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getLegacyScript(new Request("http://localhost/api/s/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    new Function(await response.text())();
    handlers.page_viewed({});

    await vi.waitFor(() => expect(ingestPayloads(fetchMock)).toHaveLength(1));
    expect(ingestPayloads(fetchMock)[0]).toMatchObject({ fbclid: "F1", gclid: "G1", googleClickCapturedAt: clickedAt,
      attributionSource: "meta" });
    expect(JSON.parse(values.get("_tc") ?? "{}")).toMatchObject({ gl: "G1", ga: clickedAt, fb: "F1" });
  });
});
