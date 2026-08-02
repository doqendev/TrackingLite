import { describe, expect, it } from "vitest";
import { normalizeToTikTokEvent } from "@/lib/destinations/tiktok";
import { hashPii } from "@/lib/hash-pii";

const baseEventData = {
  eventId: "shopify-purchase:ws_123:1001",
  timestamp: 1700000000000,
  url: "https://example.com/products/sign",
  referrer: "",
  userData: {},
  customData: {},
  clientIp: "203.0.113.10",
  userAgent: "Mozilla/5.0",
  ttclid: "TTCLID123",
  ttp: "TTP123",
};

describe("TikTok normalizer", () => {
  it("hashes customerId into user.external_id", () => {
    const event = normalizeToTikTokEvent("Purchase", {
      ...baseEventData,
      userData: {
        customerId: "gid://shopify/Customer/123",
      },
      customData: {
        value: 99,
        currency: "USD",
      },
    });

    expect(event?.user.external_id).toBe(hashPii("gid://shopify/Customer/123"));
    expect(event?.user.ttclid).toBe("TTCLID123");
    expect(event?.user.ttp).toBe("TTP123");
  });

  it("falls back to the hashed TrackClear session ID for anonymous external_id", () => {
    const event = normalizeToTikTokEvent("AddToCart", {
      ...baseEventData,
      trackclearSessionId: "session-uuid-1",
      customData: { value: 24.99, currency: "EUR" },
    });

    expect(event?.user.external_id).toBe(hashPii("session-uuid-1"));
  });

  it("prefers the hashed customerId over the session ID for external_id", () => {
    const event = normalizeToTikTokEvent("Purchase", {
      ...baseEventData,
      trackclearSessionId: "session-uuid-1",
      userData: { customerId: "12345" },
      customData: { value: 99, currency: "USD" },
    });

    expect(event?.user.external_id).toBe(hashPii("12345"));
  });

  it("prefers rich contents over contentIds so quantity and price are preserved", () => {
    const event = normalizeToTikTokEvent("Purchase", {
      ...baseEventData,
      customData: {
        value: 99,
        currency: "USD",
        content_type: "product",
        content_ids: ["111", "222"],
        contents: [
          { id: "111", quantity: 2, item_price: 12.5 },
          { id: "222", quantity: 1, itemPrice: 74 },
        ],
      },
    });

    expect(event?.properties?.contents).toEqual([
      { content_id: "111", content_type: "product", quantity: 2, price: 12.5 },
      { content_id: "222", content_type: "product", quantity: 1, price: 74 },
    ]);
  });

  it("falls back to contentIds when rich contents are absent", () => {
    const event = normalizeToTikTokEvent("AddToCart", {
      ...baseEventData,
      customData: {
        contentIds: ["111"],
        contentType: "product",
      },
    });

    expect(event?.properties?.contents).toEqual([
      { content_id: "111", content_type: "product" },
    ]);
  });
});
