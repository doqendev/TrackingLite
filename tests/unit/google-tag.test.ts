import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { googleTagForWorkspace, normalizeGoogleTagId, normalizeGoogleTagLabel } from "@/lib/google-tag";

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

const TAG = "AW-18544016973";
const LABELS = { purchase: "UPUGCOrzsK4dEM38vIpF", addToCart: "RZs9CJ2mr64dEM38vIpF",
  beginCheckout: "7_X1CMDws64dEM38vIpF", pageView: "xOeaCOXfr64dEM38vIpF" };
const workspace = {
  id: "ws_123",
  productMode: "SHOPIFY_META_TIKTOK_V1",
  installType: "SHOPIFY_CUSTOM_PIXEL",
  apiKey: "tl_test",
  metaPixelId: null,
  enableMeta: false,
  metaBrowserTrackingEnabled: false,
  tiktokPixelId: null,
  enableTikTok: false,
  tiktokBrowserTrackingEnabled: false,
  enableOpenAI: false,
  consentMode: "LAX",
  shopifyWebhookSecretEncrypted: null,
  shopifyWebhookVerifiedAt: new Date(),
  catalogIdMode: "VARIANT_NUMERIC_ID",
  catalogIdPrefix: null,
  catalogIdSuffix: null,
  catalogIdTemplate: null,
  customIngestDomain: null,
  customIngestDomainVerifiedAt: null,
  googleBrowserTrackingEnabled: true,
  googleTagId: TAG,
  googleTagPurchaseLabel: LABELS.purchase,
  googleTagAddToCartLabel: LABELS.addToCart,
  googleTagBeginCheckoutLabel: LABELS.beginCheckout,
  googleTagPageViewLabel: LABELS.pageView,
};

type Handler = (event: unknown) => unknown;
const ALLOWED = { analyticsProcessingAllowed: true, marketingAllowed: true, saleOfDataAllowed: true };
const PAGE = "https://shop.example/products/ring";
const variant = {
  id: "gid://shopify/ProductVariant/11",
  title: "Gold ring",
  price: { amount: "120.00", currencyCode: "EUR" },
  product: { id: "gid://shopify/Product/22", type: "Ring" },
};
const checkout = {
  token: "CHK1",
  email: "Buyer@Example.com",
  totalPrice: { amount: "120.00", currencyCode: "EUR" },
  lineItems: [],
  billingAddress: { firstName: "Ana", lastName: "Silva", zip: "1000-001", countryCode: "pt", city: "Lisboa",
    phone: "+351 912 345 678" },
  order: { id: "gid://shopify/Order/9507925491976" },
};

const event = (href = PAGE, data: Record<string, unknown> = {}) => ({
  timestamp: new Date().toISOString(),
  context: { document: { location: { href } } },
  data,
});

/** gtag() calls in order, as arrays; scripts appended to the document. */
function googleState(win: { dataLayer?: unknown[] }, appended: Array<{ src?: string }>) {
  return {
    calls: (win.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>)),
    scripts: appended.map((script) => script.src ?? ""),
  };
}

async function loadPixel(options: {
  privacy?: Record<string, boolean>;
  stored?: Record<string, unknown>;
  href?: string;
  overrides?: Record<string, unknown>;
} = {}) {
  mockFindFirst.mockResolvedValue({ ...workspace, ...options.overrides });
  const handlers: Record<string, Handler> = {};
  let consentCallback: Handler | null = null;
  const values = new Map<string, string>();
  if (options.stored) values.set("_tc", JSON.stringify(options.stored));
  const storage = {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
  };
  const appended: Array<{ src?: string }> = [];
  const win: Record<string, unknown> & { dataLayer?: unknown[] } = {
    __tcAnalytics: { subscribe: (name: string, callback: Handler) => { handlers[name] = callback; } },
    __tcBrowser: { localStorage: storage, sessionStorage: storage, cookie: { get: async () => "", set: async () => {} } },
    __tcInit: { customerPrivacy: options.privacy ?? ALLOWED, context: event(options.href).context, data: {} },
    __tcCustomerPrivacy: { subscribe: (_name: string, callback: Handler) => { consentCallback = callback; } },
  };
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", { cookie: "", referrer: "", createElement: () => ({}), getElementsByTagName: () => [],
    head: { appendChild: (node: { src?: string }) => { appended.push(node); } } });
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("setTimeout", vi.fn());
  const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  const response = await getPixel(new Request("https://trackclear.example/api/pixel/ws_123"), {
    params: Promise.resolve({ workspaceId: "ws_123" }),
  });
  const js = await response.text();
  new Function(js)();
  await vi.waitFor(() => expect(Object.keys(handlers)).toHaveLength(7));
  return {
    js,
    handlers,
    state: () => googleState(win, appended),
    consent: async (privacy: Record<string, boolean>) => {
      await (consentCallback as Handler)({ customerPrivacy: privacy });
    },
  };
}

const conversions = (calls: unknown[][]) =>
  calls.filter((call) => call[0] === "event" && call[1] === "conversion").map((call) => call[2] as Record<string, unknown>);

describe("Google tag settings", () => {
  it("accepts only an AW- tag ID and conversion labels", () => {
    expect(normalizeGoogleTagId(" aw-18544016973 ")).toBe(TAG);
    expect(normalizeGoogleTagId("G-ABC123")).toBeNull();
    expect(normalizeGoogleTagId("AW-12")).toBeNull();
    expect(normalizeGoogleTagLabel(" 7_X1CMDws64dEM38vIpF ")).toBe("7_X1CMDws64dEM38vIpF");
    expect(normalizeGoogleTagLabel("bad label")).toBeNull();
    expect(normalizeGoogleTagLabel("AW-18544016973/UPUGCOrzsK4dEM38vIpF")).toBeNull();
  });

  it("runs the tag only when enabled, configured and allowed for the store", () => {
    expect(googleTagForWorkspace(workspace)).toEqual({ id: TAG, purchaseLabel: LABELS.purchase,
      addToCartLabel: LABELS.addToCart, beginCheckoutLabel: LABELS.beginCheckout, pageViewLabel: LABELS.pageView });
    expect(googleTagForWorkspace({ ...workspace, googleBrowserTrackingEnabled: false })).toBeNull();
    expect(googleTagForWorkspace({ ...workspace, googleTagPurchaseLabel: null })).toBeNull();
    expect(googleTagForWorkspace({ ...workspace, installType: "HEADLESS_CUSTOM" })).toBeNull();
    expect(googleTagForWorkspace({ ...workspace, googleTagPageViewLabel: "x" })?.pageViewLabel).toBeNull();
  });
});

describe("Google tag in the Custom Pixel", () => {
  beforeAll(async () => {
    getPixel = (await import("@/app/api/pixel/[workspaceId]/route")).GET;
    getLegacyScript = (await import("@/app/api/s/[workspaceId]/route")).GET;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_INGEST_URL = "https://api.trackclear.test/api/events/ingest";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serves no Google tag when the store has not turned it on", async () => {
    const page = await loadPixel({ overrides: { googleBrowserTrackingEnabled: false } });
    expect(page.js).not.toContain("googletagmanager");
    page.handlers.page_viewed(event());
    expect(page.state()).toEqual({ calls: [], scripts: [] });
  });

  it("loads the tag with granted consent and reports each step with its label", async () => {
    const clickedAt = Date.now() - 2 * 86400000;
    const page = await loadPixel({ stored: { sid: "s1", gl: "G-CLICK", ga: clickedAt, ca: clickedAt, so: "google" } });
    expect(page.state().scripts).toEqual([`https://www.googletagmanager.com/gtag/js?id=${TAG}`]);
    expect(page.state().calls.slice(0, 2)).toEqual([
      ["consent", "default", { ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted",
        analytics_storage: "granted" }],
      ["js", expect.any(Date)],
    ]);

    page.handlers.page_viewed(event());
    page.handlers.product_added_to_cart(event(PAGE, { cartLine: { merchandise: variant, quantity: 1,
      cost: { totalAmount: { amount: "120.00", currencyCode: "EUR" } } } }));
    page.handlers.checkout_started(event("https://shop.example/checkouts/cn/CHK1", { checkout }));
    page.handlers.checkout_completed(event("https://shop.example/checkouts/cn/CHK1/thank-you", { checkout }));

    const calls = page.state().calls;
    // Every hit carries the stored Google click, since the sandbox cannot keep Google's cookie.
    expect(calls.find((call) => call[0] === "config")).toEqual(["config", TAG, {
      page_location: `${PAGE}?gclid=G-CLICK`, page_referrer: "", send_page_view: false, allow_enhanced_conversions: true,
    }]);
    expect(calls).toContainEqual(["event", "page_view", { send_to: TAG }]);
    expect(conversions(calls)).toEqual([
      { send_to: `${TAG}/${LABELS.pageView}` },
      { send_to: `${TAG}/${LABELS.addToCart}`, value: 120, currency: "EUR" },
      { send_to: `${TAG}/${LABELS.beginCheckout}`, value: 120, currency: "EUR" },
      { send_to: `${TAG}/${LABELS.purchase}`, value: 120, currency: "EUR", transaction_id: "9507925491976" },
    ]);
    expect(calls).toContainEqual(["set", "user_data", {
      email: "buyer@example.com",
      phone_number: "+351912345678",
      address: { first_name: "Ana", last_name: "Silva", city: "Lisboa", postal_code: "1000-001", country: "PT" },
    }]);
  });

  it("leaves out a phone that is not in international format and an incomplete address", async () => {
    const page = await loadPixel();
    page.handlers.checkout_completed(event(PAGE, { checkout: { ...checkout,
      billingAddress: { firstName: "Ana", phone: "912 345 678", countryCode: "PT" } } }));
    expect(page.state().calls).toContainEqual(["set", "user_data", { email: "buyer@example.com" }]);
  });

  it("never loads the tag or sends anything when marketing is denied", async () => {
    const page = await loadPixel({ privacy: { ...ALLOWED, marketingAllowed: false } });
    page.handlers.page_viewed(event());
    page.handlers.checkout_completed(event(PAGE, { checkout }));
    expect(page.state()).toEqual({ calls: [], scripts: [] });
  });

  it("waits for consent in strict mode, then sends the page view it held", async () => {
    const page = await loadPixel({ privacy: {}, overrides: { consentMode: "STRICT" } });
    page.handlers.page_viewed(event());
    expect(page.state()).toEqual({ calls: [], scripts: [] });

    await page.consent(ALLOWED);
    const calls = page.state().calls;
    expect(page.state().scripts).toHaveLength(1);
    expect(calls).toContainEqual(["event", "page_view", { send_to: TAG }]);
    expect(conversions(calls)).toEqual([{ send_to: `${TAG}/${LABELS.pageView}` }]);
  });

  it("updates Google consent to denied on a later refusal and stops sending", async () => {
    const page = await loadPixel();
    await page.consent({ ...ALLOWED, marketingAllowed: false });
    page.handlers.checkout_completed(event(PAGE, { checkout }));
    const calls = page.state().calls;
    expect(calls).toContainEqual(["consent", "update", { ad_storage: "denied", ad_user_data: "denied",
      ad_personalization: "denied", analytics_storage: "granted" }]);
    expect(conversions(calls)).toEqual([]);
  });

  it("skips steps without a label and never runs on a store whose mode excludes Google Ads", async () => {
    const page = await loadPixel({ overrides: { googleTagAddToCartLabel: null, googleTagPageViewLabel: null } });
    page.handlers.page_viewed(event());
    page.handlers.product_added_to_cart(event(PAGE, { cartLine: { merchandise: variant, quantity: 1,
      cost: { totalAmount: { amount: "120.00", currencyCode: "EUR" } } } }));
    expect(page.state().calls).toContainEqual(["event", "page_view", { send_to: TAG }]);
    expect(conversions(page.state().calls)).toEqual([]);

    vi.unstubAllGlobals();
    const headless = await loadPixel({ overrides: { installType: "HEADLESS_CUSTOM" } });
    expect(headless.js).not.toContain("googletagmanager");
  });

  it("reports the purchase from the legacy script too", async () => {
    mockFindFirst.mockResolvedValue(workspace);
    const handlers: Record<string, Handler> = {};
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
    const appended: Array<{ src?: string }> = [];
    const win: Record<string, unknown> & { dataLayer?: unknown[] } = {
      __tl: {
        analytics: { subscribe: (name: string, callback: Handler) => { handlers[name] = callback; } },
        customerPrivacy: { subscribe: vi.fn() },
        init: { customerPrivacy: ALLOWED },
      },
    };
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", { referrer: "", cookie: "", createElement: () => ({}), getElementsByTagName: () => [],
      head: { appendChild: (node: { src?: string }) => { appended.push(node); } } });
    vi.stubGlobal("location", { href: `${PAGE}?gbraid=GB-CLICK` });
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("crypto", { randomUUID: () => "event-id" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));

    const response = await getLegacyScript(new Request("http://localhost/api/s/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    new Function(await response.text())();
    handlers.checkout_completed(event(`${PAGE}?gbraid=GB-CLICK`, { checkout }));

    const state = googleState(win, appended);
    expect(state.scripts).toEqual([`https://www.googletagmanager.com/gtag/js?id=${TAG}`]);
    expect(state.calls.find((call) => call[0] === "config")?.[2]).toMatchObject({ page_location: `${PAGE}?gbraid=GB-CLICK` });
    expect(conversions(state.calls)).toEqual([
      { send_to: `${TAG}/${LABELS.purchase}`, value: 120, currency: "EUR", transaction_id: "9507925491976" },
    ]);
  });
});
