import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: { workspace: { findFirst: vi.fn().mockResolvedValue({
  apiKey: "tl_test", enableOpenAI: true, enableMeta: true, metaPixelId: "meta",
  enableTikTok: true, tiktokPixelId: "tiktok", consentMode: "STRICT",
  metaBrowserTrackingEnabled: false, tiktokBrowserTrackingEnabled: false,
}) } } }));
import { GET } from "@/app/api/pixel/[workspaceId]/route";

describe("generated Shopify pixel with ChatGPT Ads", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it("preserves source events and click age through concurrent callbacks, checkout enrichment and denial", async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const values = new Map<string, string>();
    const storage = { getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => { values.set(key, value); } };
    const handlers: Record<string, (event: unknown) => unknown> = {};
    let deny: (event: unknown) => Promise<void> = async () => {};
    const privacy = { analyticsProcessingAllowed: true, marketingAllowed: true, saleOfDataAllowed: true };
    const landing = "https://shop.example/?oppref=Opaque%2F%2B";
    vi.stubGlobal("window", {
      __tcAnalytics: { subscribe: (name: string, callback: (event: unknown) => unknown) => { handlers[name] = callback; } },
      __tcBrowser: { localStorage: storage, sessionStorage: storage,
        cookie: { get: async () => "", set: async () => {} } },
      __tcInit: { customerPrivacy: privacy, context: { document: { location: { href: landing } } }, data: {} },
      __tcCustomerPrivacy: { subscribe: (_name: string, callback: typeof deny) => { deny = callback; } },
    });
    vi.stubGlobal("document", { cookie: "", referrer: "" });
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("setTimeout", vi.fn());
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const script = await (await GET(new Request("https://trackclear.example/api/pixel/store"), {
      params: Promise.resolve({ workspaceId: "store" }),
    })).text();
    new Function(script)();
    await vi.waitFor(() => expect(Object.keys(handlers)).toHaveLength(7));
    const context = (href: string) => ({ document: { location: { href } } });
    const payloads = () => fetch.mock.calls.flatMap(args => {
      const [url, options] = args as unknown as [string, RequestInit];
      return String(url).includes("/api/events/ingest") ? [JSON.parse(String(options.body))] : [];
    });
    const checkout = { token: "checkout", totalPrice: { amount: "39.01", currencyCode: "EUR" }, lineItems: [] };
    handlers.page_viewed({ timestamp: new Date(now - 2000).toISOString(), context: context(landing), data: {} });
    handlers.product_added_to_cart({ timestamp: new Date(now - 1000).toISOString(), context: context("https://shop.example/cart"), data: {} });
    handlers.checkout_started({ timestamp: new Date(now).toISOString(), context: context("https://shop.example/checkouts/one"), data: { checkout } });
    await vi.waitFor(() => expect(payloads()).toHaveLength(3));
    expect(payloads().map(p => [p.eventName, p.timestamp, p.url])).toEqual([
      ["PageView", now - 2000, landing], ["AddToCart", now - 1000, "https://shop.example/cart"],
      ["InitiateCheckout", now, "https://shop.example/checkouts/one"],
    ]);
    expect(payloads().every(p => p.oppref === "Opaque/+" && p.opprefCapturedAt === now)).toBe(true);
    const checkoutId = payloads()[2].eventId;
    clock.mockReturnValue(now + 10000);
    handlers.checkout_contact_info_submitted({ timestamp: new Date(now + 10000).toISOString(),
      context: context("https://shop.example/checkouts/one/contact"), data: { checkout: { ...checkout, email: "buyer@example.com" } } });
    await vi.waitFor(() => expect(payloads()).toHaveLength(5));
    expect(payloads().find(p => p.onlyDestinations?.includes("OPENAI"))).toMatchObject({
      eventId: checkoutId, timestamp: now, url: "https://shop.example/checkouts/one",
      oppref: "Opaque/+", opprefCapturedAt: now, userData: { email: "buyer@example.com" },
    });
    await deny({ customerPrivacy: { ...privacy, marketingAllowed: false, saleOfDataAllowed: false } });
    expect(JSON.parse(values.get("_tc_openai_click") ?? "null")).toBeNull();
    handlers.page_viewed({ timestamp: new Date(now + 10000).toISOString(), context: context(landing), data: {} });
    await vi.waitFor(() => expect(payloads().some(p => p.consent.marketingAllowed === false)).toBe(true));
    expect(payloads().filter(p => p.consent.marketingAllowed === false).every(p => !p.oppref && !p.opprefCapturedAt)).toBe(true);
  });
});
