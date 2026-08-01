import { describe, expect, it, vi } from "vitest";
import {
  IngestPayloadSchema,
  isPrivacyMinimizedConsentRevocation,
} from "@/lib/ingest-validation";

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    eventName: "AddToCart",
    eventId: "evt-123",
    timestamp: Date.now(),
    customData: { value: 29.99, currency: "EUR", numItems: 1 },
    ...overrides,
  };
}

describe("IngestPayloadSchema", () => {
  it("accepts a bounded event and normalizes defaults", () => {
    const result = IngestPayloadSchema.parse(validPayload());

    expect(result.url).toBe("");
    expect(result.referrer).toBe("");
    expect(result.userData).toEqual({});
    expect(result.consent).toEqual({});
  });

  it("rejects stale and implausibly future timestamps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:00:00.000Z"));

    expect(() =>
      IngestPayloadSchema.parse(validPayload({ timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000 }))
    ).toThrow(/seven-day window/);
    expect(() =>
      IngestPayloadSchema.parse(validPayload({ timestamp: Date.now() + 16 * 60 * 1000 }))
    ).toThrow(/too far in the future/);

    vi.useRealTimers();
  });

  it("allows only privacy-minimized consent revocations through the 30-day replay window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:00:00.000Z"));
    const timestamp = Date.now() - 29 * 24 * 60 * 60 * 1000;
    const revocation = {
      eventName: "PageView",
      eventId: "consent-revocation",
      timestamp,
      url: "",
      referrer: "",
      trackclearSessionId: "session-123",
      consent: { marketingAllowed: false },
      userData: {},
      customData: { checkoutToken: "checkout-123" },
      onlyDestinations: [],
    };

    expect(IngestPayloadSchema.parse(revocation).timestamp).toBe(timestamp);
    expect(() => IngestPayloadSchema.parse({
      ...revocation,
      timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000,
    })).toThrow(/30-day window/);
    expect(() => IngestPayloadSchema.parse(validPayload({ timestamp }))).toThrow(/seven-day window/);
    expect(() => IngestPayloadSchema.parse({
      ...revocation,
      onlyDestinations: ["META"],
    })).toThrow(/seven-day window/);
    expect(() => IngestPayloadSchema.parse({
      ...revocation,
      fbp: "fb.1.1700000000000.1234567890",
    })).toThrow(/seven-day window/);
    expect(() => IngestPayloadSchema.parse({
      ...revocation,
      userData: { email: "private@example.com" },
    })).toThrow(/seven-day window/);
    const orderOnly = {
      ...revocation,
      trackclearSessionId: null,
      customData: { orderName: "#1001" },
    };
    expect(isPrivacyMinimizedConsentRevocation(orderOnly)).toBe(false);
    expect(() => IngestPayloadSchema.parse(orderOnly)).toThrow(/seven-day window/);

    vi.useRealTimers();
  });

  it("rejects unsafe or unbounded custom data", () => {
    expect(() =>
      IngestPayloadSchema.parse(validPayload({ customData: { constructor: { prototype: "polluted" } } }))
    ).toThrow(/Unsafe customData key/);

    expect(() =>
      IngestPayloadSchema.parse(validPayload({ customData: { contents: Array.from({ length: 501 }, () => ({ id: "1" })) } }))
    ).toThrow(/at most 500 items/);
  });

  it("rejects invalid monetary and item values", () => {
    expect(() =>
      IngestPayloadSchema.parse(validPayload({ customData: { value: -1, currency: "EURO" } }))
    ).toThrow();
    expect(() =>
      IngestPayloadSchema.parse(validPayload({ customData: { num_items: 1.5 } }))
    ).toThrow(/numItems/);
  });

  it("rejects coercible non-scalar known fields", () => {
    for (const customData of [
      { value: true },
      { value: "" },
      { value: [] },
      { currency: ["USD"] },
      { currency: 123 },
      { numItems: false },
      { numItems: "1.5" },
      { orderId: true },
      { checkoutToken: ["checkout-1"] },
    ]) {
      expect(() => IngestPayloadSchema.parse(validPayload({ customData }))).toThrow();
    }
  });

  it("accepts deliberate numeric-string compatibility", () => {
    const result = IngestPayloadSchema.parse(
      validPayload({
        customData: {
          value: "29.99",
          currency: "eur",
          num_items: "2",
          orderId: 123456,
        },
      })
    );

    expect(result.customData).toEqual({
      value: "29.99",
      currency: "eur",
      num_items: "2",
      orderId: 123456,
    });
  });

  it("rejects unknown destinations and unknown top-level fields", () => {
    expect(() =>
      IngestPayloadSchema.parse(validPayload({ onlyDestinations: ["META", "UNKNOWN"] }))
    ).toThrow();
    expect(() => IngestPayloadSchema.parse(validPayload({ unexpected: true }))).toThrow();
  });

  it("accepts TikTok browser identity", () => {
    const result = IngestPayloadSchema.parse(
      validPayload({
        ttclid: "tt-click",
        ttp: "tt.1.1234567890.abcdef",
        attributionTimestamp: Date.now(),
        attributionSource: "tiktok",
      })
    );

    expect(result.ttp).toBe("tt.1.1234567890.abcdef");
    expect(result.attributionSource).toBe("tiktok");
  });

  it("accepts the Shopify sale or sharing consent signal", () => {
    const result = IngestPayloadSchema.parse(
      validPayload({
        consent: {
          analyticsAllowed: true,
          marketingAllowed: true,
          saleOfDataAllowed: false,
        },
      })
    );

    expect(result.consent.saleOfDataAllowed).toBe(false);
  });
});
