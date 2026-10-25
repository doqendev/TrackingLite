import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockFindFirst = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    workspace: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));

import { buildCheckoutEventId } from "@/lib/shopify-checkout-event";

let getPixel: typeof import("@/app/api/pixel/[workspaceId]/route").GET;
let getLegacyScript: typeof import("@/app/api/s/[workspaceId]/route").GET;

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
type IngestPayload = { eventName: string; userData: Record<string, unknown>; checkoutToken?: string };

const ALLOWED = { analyticsProcessingAllowed: true, marketingAllowed: true, saleOfDataAllowed: true };
const page = (href = "https://shop.example/products/sign") => ({
  timestamp: new Date().toISOString(),
  context: { document: { location: { href } } },
  data: {},
});

function ingestPayloads(fetchMock: ReturnType<typeof vi.fn>): IngestPayload[] {
  return fetchMock.mock.calls.flatMap((args) => {
    const [url, options] = args as unknown as [string, RequestInit];
    return String(url).includes("/api/events/ingest") ? [JSON.parse(String(options.body))] : [];
  });
}

async function runGeneratedPixel(cookies: Record<string, string>, privacy: Record<string, boolean>) {
  const handlers: Record<string, Handler> = {};
  const values = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      values.set(key, value);
    },
  };
  vi.stubGlobal("window", {
    __tcAnalytics: { subscribe: (name: string, callback: Handler) => { handlers[name] = callback; } },
    __tcBrowser: {
      localStorage: storage,
      sessionStorage: storage,
      cookie: { get: async (name: string) => cookies[name] ?? "", set: async () => {} },
    },
    __tcInit: { customerPrivacy: privacy, context: page().context, data: {} },
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
  return { handlers, fetchMock };
}

const variant = {
  id: "gid://shopify/ProductVariant/11",
  title: "One Piece sign",
  price: { amount: "39.01", currencyCode: "EUR" },
  product: { id: "gid://shopify/Product/22", type: "Sign" },
};

describe("country on Shopify funnel events", () => {
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

  it("sends the storefront country on every funnel event and prefers the checkout's own country", async () => {
    const { handlers, fetchMock } = await runGeneratedPixel({ localization: "us" }, ALLOWED);

    handlers.page_viewed(page());
    handlers.product_viewed({ ...page(), data: { productVariant: variant } });
    handlers.product_added_to_cart({
      ...page(),
      data: { cartLine: { merchandise: variant, quantity: 1, cost: { totalAmount: { amount: "39.01", currencyCode: "EUR" } } } },
    });
    handlers.checkout_started({
      ...page("https://shop.example/checkouts/cn/one"),
      data: { checkout: { token: "one", totalPrice: { amount: "39.01", currencyCode: "EUR" }, lineItems: [], billingAddress: { countryCode: "DE" } } },
    });
    handlers.checkout_started({
      ...page("https://shop.example/checkouts/cn/two"),
      data: { checkout: { token: "two", totalPrice: { amount: "39.01", currencyCode: "EUR" }, lineItems: [], localization: { country: { isoCode: "FR" } } } },
    });

    await vi.waitFor(() => expect(ingestPayloads(fetchMock)).toHaveLength(5));
    const payloads = ingestPayloads(fetchMock);
    expect(payloads.slice(0, 3).map((p) => [p.eventName, p.userData.countryCode])).toEqual([
      ["PageView", "US"],
      ["ViewContent", "US"],
      ["AddToCart", "US"],
    ]);
    expect(payloads.slice(3).map((p) => [p.checkoutToken, p.userData.countryCode])).toEqual([
      ["one", "DE"],
      ["two", "FR"],
    ]);
  });

  it("sends no country when marketing is denied or the cookie is not a country code", async () => {
    const denied = await runGeneratedPixel({ localization: "US" }, { ...ALLOWED, marketingAllowed: false });
    denied.handlers.page_viewed(page());
    await vi.waitFor(() => expect(ingestPayloads(denied.fetchMock)).toHaveLength(1));
    expect(ingestPayloads(denied.fetchMock)[0].userData).toEqual({});

    vi.unstubAllGlobals();
    const invalid = await runGeneratedPixel({ localization: "USA" }, ALLOWED);
    invalid.handlers.page_viewed(page());
    await vi.waitFor(() => expect(ingestPayloads(invalid.fetchMock)).toHaveLength(1));
    expect(ingestPayloads(invalid.fetchMock)[0].userData).not.toHaveProperty("countryCode");
  });

  it("sends the storefront country from the legacy script too", async () => {
    const handlers: Record<string, Handler> = {};
    const values = new Map<string, string>();
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
    // A cookie jar, not a string: the script writes _fbp and its session cookie.
    const jar = new Map([["localization", "PT"], ["cart_currency", "EUR"]]);
    vi.stubGlobal("document", {
      referrer: "",
      get cookie() {
        return Array.from(jar, ([name, value]) => `${name}=${value}`).join("; ");
      },
      set cookie(value: string) {
        const pair = value.split(";")[0];
        jar.set(pair.slice(0, pair.indexOf("=")).trim(), pair.slice(pair.indexOf("=") + 1));
      },
    });
    vi.stubGlobal("location", { href: "https://shop.example/products/sign" });
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("crypto", { randomUUID: () => "event-id" });
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getLegacyScript(new Request("http://localhost/api/s/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    new Function(await response.text())();
    handlers.page_viewed(page());

    await vi.waitFor(() => expect(ingestPayloads(fetchMock)).toHaveLength(1));
    expect(ingestPayloads(fetchMock)[0].userData).toEqual({ countryCode: "PT" });
  });

  it("names InitiateCheckout by the checkout token, as the checkout and order webhooks do", async () => {
    const { handlers, fetchMock } = await runGeneratedPixel({}, ALLOWED);
    const checkout = { token: "CHK-TOKEN-1", totalPrice: { amount: "39.25", currencyCode: "EUR" }, lineItems: [] };

    handlers.checkout_started({ ...page("https://shop.example/checkouts/cn/CHK-TOKEN-1"), data: { checkout } });
    handlers.checkout_contact_info_submitted({
      ...page("https://shop.example/checkouts/cn/CHK-TOKEN-1"),
      data: { checkout: { ...checkout, email: "buyer@example.com" } },
    });
    handlers.checkout_started({ ...page(), data: { checkout: { totalPrice: {}, lineItems: [] } } });

    await vi.waitFor(() => expect(ingestPayloads(fetchMock).length).toBeGreaterThanOrEqual(4));
    const ids = ingestPayloads(fetchMock).map((p) => (p as unknown as { eventId: string }).eventId);
    const expected = buildCheckoutEventId("ws_123", "CHK-TOKEN-1");
    // checkout_started, then the Meta/TikTok contact enrichment of the same event.
    expect(ids.slice(0, 2)).toEqual([expected, expected]);
    // Without a token the pixel falls back to a random ID instead of a shared one.
    expect(ids[3]).not.toBe(expected);
    expect(ids[3]).not.toMatch(/^shopify-checkout:/);
  });
});
