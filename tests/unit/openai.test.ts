import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { normalizeToOpenAIEvent, toOpenAIMinorUnits, sendToOpenAI, OPENAI_CLICK_TTL_MS } from "@/lib/destinations/openai";
import { updateOpenAIClickContext, openAIClickContextScript } from "@/lib/openai-click-context";
import type { DestinationEventJob } from "@/lib/queue";

const now = Date.now();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const event = (overrides: Partial<DestinationEventJob["event"]> = {}): DestinationEventJob["event"] => ({
  eventName: "Purchase", eventId: "shopify-purchase:store:123", timestamp: now,
  url: "https://shop.example/thank-you", referrer: "", clientIp: "203.0.113.1", userAgent: "test",
  userData: {}, customData: { currency: "EUR", value: "39.01" }, ...overrides,
});

describe("ChatGPT Ads event contract", () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([["USD", "1.005", 101], ["EUR", "39.01", 3901], ["JPY", "4200", 4200],
    ["KWD", "1.234", 1234], ["CLF", "1.1234", 11234]])("uses ISO minor units for %s", (currency, value, expected) => {
    expect(toOpenAIMinorUnits(value, currency as string)).toBe(expected);
  });
  it.each([["ZZZ", "1"], ["USD", "NaN"], ["USD", "-1"], ["USD", "1e25"]])("rejects invalid money %s %s", (currency, value) => {
    expect(() => toOpenAIMinorUnits(value, currency)).toThrow();
  });
  it.each([["PageView", "page_viewed"], ["ViewContent", "contents_viewed"], ["AddToCart", "items_added"],
    ["InitiateCheckout", "checkout_started"], ["Purchase", "order_created"]])("maps %s", (eventName, type) => {
    expect(normalizeToOpenAIEvent(event({ eventName }), now)).toMatchObject({ type, data: { type: "contents" } });
  });
  it("normalizes PII to the OpenAI contract without forwarding raw or arbitrary fields", () => {
    const result = normalizeToOpenAIEvent(event({ userData: { email: " Test@Example.COM ", phone: "+1 (415) 555-2671",
      firstName: "José", lastName: "O'Connor", customerId: " ABCdef ", countryCode: "us", city: "Austin" },
      customData: { currency: "USD", value: "1.25", personalMessage: "secret", contents: [{ id: "123", quantity: 2, itemPrice: "0.625", name: "Jane's gift" }] },
    }), now);
    expect(result.user).toMatchObject({ emails_sha256: [hash("test@example.com")], phone_numbers_sha256: [hash("14155552671")],
      first_names_sha256: [hash("josé")], last_names_sha256: [hash("oconnor")], external_ids_sha256: [hash("ABCdef")], countries: ["US"], cities: ["Austin"] });
    expect(result.data).toEqual({ type: "contents", amount: 125, currency: "USD", contents: [{ id: "123", quantity: 2, content_type: "product", amount: 63, currency: "USD" }] });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("Jane");
  });
  it("normalizes phone country codes without a guessed default country", () => {
    for (const phone of ["+44 20 7946 0958", "0044 20 7946 0958", "020 7946 0958"]) {
      expect(normalizeToOpenAIEvent(event({ userData: { phone, countryCode: "GB" } }), now)
        .user?.phone_numbers_sha256).toEqual([hash("442079460958")]);
    }
    expect(normalizeToOpenAIEvent(event({ userData: { phone: "4155552671" } }), now)
      .user?.phone_numbers_sha256).toBeUndefined();
  });
  it("reuses email hashes but never unverified phone hashes or a synthetic obref", () => {
    const result = normalizeToOpenAIEvent(event({ hashedEmail: hash("a@b.com"), hashedPhone: hash("+14155552671"), trackclearSessionId: "session" }), now);
    expect(result.user?.emails_sha256).toEqual([hash("a@b.com")]);
    expect(result.user).not.toHaveProperty("phone_numbers_sha256");
    expect(result.user).not.toHaveProperty("obref");
  });
  it("passes opaque clicks unchanged and drops expired or unanchored clicks", () => {
    const opaque = "MiXeD/+_= ";
    expect(normalizeToOpenAIEvent(event({ oppref: opaque, opprefCapturedAt: now - 1 }), now).oppref).toBe(opaque);
    expect(normalizeToOpenAIEvent(event({ oppref: opaque, opprefCapturedAt: now - OPENAI_CLICK_TTL_MS }), now).oppref).toBeUndefined();
    expect(normalizeToOpenAIEvent(event({ oppref: opaque }), now).oppref).toBeUndefined();
  });
  it("rejects expired/future events, unsupported events and non-web URLs", () => {
    for (const override of [{ timestamp: now - 604800001 }, { timestamp: now + 600001 }, { timestamp: now + 0.5 },
      { eventName: "Refund" }, { url: "javascript:alert(1)" }, { url: "/checkout" }]) {
      expect(() => normalizeToOpenAIEvent(event(override), now)).toThrow();
    }
  });
  it("validates without recording and sends the configured integration identity", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 })); vi.stubGlobal("fetch", fetch);
    expect(await sendToOpenAI("Pixel-ABC", "key", normalizeToOpenAIEvent(event(), now), true)).toMatchObject({ accepted: false, validated: true });
    const [url, request] = fetch.mock.calls[0];
    expect(url).toBe("https://bzr.openai.com/v1/events?pid=Pixel-ABC");
    expect(JSON.parse(request.body)).toMatchObject({ integration_source: "trackclear", validate_only: true });
    expect(request.headers.Authorization).toBe("Bearer key");
  });
  it("honors rate-limit metadata without retaining provider error bodies", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"email":"secret"}', { status: 429, headers: { "retry-after": "120" } })));
    await expect(sendToOpenAI("pixel", "key", normalizeToOpenAIEvent(event(), now))).rejects.toMatchObject({ statusCode: 429, retryAfterMs: 120000 });
  });
});

describe("Shopify ChatGPT click lifetime", () => {
  it("expires from URL capture, survives other campaigns, and clears on denial", () => {
    const first = updateOpenAIClickContext(null, "https://shop.example/?oppref=AbC%2F%2B", true, now);
    expect(first).toEqual({ value: "AbC/+", capturedAt: now });
    expect(updateOpenAIClickContext(first, "https://shop.example/?fbclid=other", true, now + 1000)).toEqual(first);
    expect(updateOpenAIClickContext(first, "https://shop.example/", true, now + OPENAI_CLICK_TTL_MS)).toBeNull();
    expect(updateOpenAIClickContext(first, "https://shop.example/?oppref=AbC", false, now)).toBeNull();
  });
  it("refreshes a repeated URL capture but not repeated reads on the same page", () => {
    const first = { value: "AbC", capturedAt: now };
    expect(updateOpenAIClickContext(first, "https://shop.example/?oppref=AbC", true, now + 100, false)).toEqual(first);
    expect(updateOpenAIClickContext(first, "https://shop.example/?oppref=AbC", true, now + 100)).toEqual({ ...first, capturedAt: now + 100 });
  });
  it("embeds executable code with no server/runtime dependency", () => {
    const result = runInNewContext(openAIClickContextScript() + ';updateOpenAIClickContext(null,"https://shop.example/?oppref=ABC",true,1000)', { URL });
    expect(result).toEqual({ value: "ABC", capturedAt: 1000 });
  });
});
