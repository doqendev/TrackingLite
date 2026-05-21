import { describe, it, expect } from "vitest";
import { normalizeToMetaCapiEvent } from "@/lib/event-normalizer";
import type { SnippetEventPayload } from "@/types/events";

const BASE_TIMESTAMP_MS = 1700000000000; // 1700000000 seconds

function makePayload(overrides: Partial<SnippetEventPayload> = {}): SnippetEventPayload {
  return {
    eventName: "PageView",
    eventId: "evt-abc-123",
    timestamp: BASE_TIMESTAMP_MS,
    ...overrides,
  };
}

describe("normalizeToMetaCapiEvent", () => {
  describe("PageView event (minimal data)", () => {
    it("sets event_name from payload", () => {
      const result = normalizeToMetaCapiEvent(makePayload(), null, null);
      expect(result.event_name).toBe("PageView");
    });

    it("converts timestamp from ms to Unix seconds", () => {
      const result = normalizeToMetaCapiEvent(makePayload(), null, null);
      expect(result.event_time).toBe(1700000000);
    });

    it("passes event_id through unchanged", () => {
      const result = normalizeToMetaCapiEvent(makePayload({ eventId: "my-unique-id" }), null, null);
      expect(result.event_id).toBe("my-unique-id");
    });

    it("always sets action_source to 'website'", () => {
      const result = normalizeToMetaCapiEvent(makePayload(), null, null);
      expect(result.action_source).toBe("website");
    });

    it("omits event_source_url when url is not provided", () => {
      const result = normalizeToMetaCapiEvent(makePayload(), null, null);
      expect(result.event_source_url).toBeUndefined();
    });

    it("sets event_source_url when url is provided", () => {
      const result = normalizeToMetaCapiEvent(
        makePayload({ url: "https://example.com/page" }),
        null,
        null
      );
      expect(result.event_source_url).toBe("https://example.com/page");
    });

    it("includes client_ip_address when provided", () => {
      const result = normalizeToMetaCapiEvent(makePayload(), "1.2.3.4", null);
      expect(result.user_data.client_ip_address).toBe("1.2.3.4");
    });

    it("includes client_user_agent when provided", () => {
      const result = normalizeToMetaCapiEvent(makePayload(), null, "Mozilla/5.0");
      expect(result.user_data.client_user_agent).toBe("Mozilla/5.0");
    });

    it("omits ip and user_agent when both are null", () => {
      const result = normalizeToMetaCapiEvent(makePayload(), null, null);
      expect(result.user_data.client_ip_address).toBeUndefined();
      expect(result.user_data.client_user_agent).toBeUndefined();
    });

    it("includes fbp when provided in valid format", () => {
      const result = normalizeToMetaCapiEvent(makePayload({ fbp: "fb.1.1700000000000.1234567890" }), null, null);
      expect(result.user_data.fbp).toBe("fb.1.1700000000000.1234567890");
    });

    it("includes fbc when provided in valid format", () => {
      const fbcVal = `fb.1.${Date.now()}.AbCdEfGhIjKl`;
      const result = normalizeToMetaCapiEvent(makePayload({ fbc: fbcVal }), null, null);
      expect(result.user_data.fbc).toBe(fbcVal);
    });

    it("omits custom_data when no customData is provided", () => {
      const result = normalizeToMetaCapiEvent(makePayload(), null, null);
      expect(result.custom_data).toBeUndefined();
    });

    it("omits custom_data when customData is an empty object", () => {
      const result = normalizeToMetaCapiEvent(makePayload({ customData: {} }), null, null);
      expect(result.custom_data).toBeUndefined();
    });
  });

  describe("ViewContent event", () => {
    it("normalizes content_ids as array of strings", () => {
      const result = normalizeToMetaCapiEvent(
        makePayload({
          eventName: "ViewContent",
          customData: { content_ids: ["123", "456"], content_name: "Blue T-Shirt", value: 29.99, currency: "USD" },
        }),
        null,
        null
      );
      expect(result.custom_data?.content_ids).toEqual(["123", "456"]);
    });

    it("normalizes content_name as string", () => {
      const result = normalizeToMetaCapiEvent(
        makePayload({
          eventName: "ViewContent",
          customData: { content_name: "Blue T-Shirt", value: 29.99, currency: "USD" },
        }),
        null,
        null
      );
      expect(result.custom_data?.content_name).toBe("Blue T-Shirt");
    });

    it("normalizes value as number", () => {
      const result = normalizeToMetaCapiEvent(
        makePayload({
          eventName: "ViewContent",
          customData: { value: "29.99", currency: "USD" },
        }),
        null,
        null
      );
      expect(result.custom_data?.value).toBe(29.99);
    });

    it("normalizes currency as string", () => {
      const result = normalizeToMetaCapiEvent(
        makePayload({
          eventName: "ViewContent",
          customData: { value: 29.99, currency: "EUR" },
        }),
        null,
        null
      );
      expect(result.custom_data?.currency).toBe("EUR");
    });
  });

  describe("AddToCart event", () => {
    it("includes content_ids", () => {
      const result = normalizeToMetaCapiEvent(
        makePayload({
          eventName: "AddToCart",
          customData: { content_ids: ["gid://shopify/ProductVariant/789"], num_items: 2, value: 59.98, currency: "USD" },
        }),
        null,
        null
      );
      expect(result.custom_data?.content_ids).toEqual(["gid://shopify/ProductVariant/789"]);
    });

    it("normalizes num_items as number", () => {
      const result = normalizeToMetaCapiEvent(
        makePayload({
          eventName: "AddToCart",
          customData: { num_items: "3", value: 10, currency: "USD" },
        }),
        null,
        null
      );
      expect(result.custom_data?.num_items).toBe(3);
    });

    it("includes value and currency", () => {
      const result = normalizeToMetaCapiEvent(
        makePayload({
          eventName: "AddToCart",
          customData: { value: 59.98, currency: "GBP" },
        }),
        null,
        null
      );
      expect(result.custom_data?.value).toBe(59.98);
      expect(result.custom_data?.currency).toBe("GBP");
    });
  });

  describe("InitiateCheckout event", () => {
    it("includes value and currency", () => {
      const result = normalizeToMetaCapiEvent(
        makePayload({
          eventName: "InitiateCheckout",
          customData: { value: 120.0, currency: "USD", content_ids: ["v1", "v2"] },
          userData: { email: "test@example.com", firstName: "Jane", lastName: "Doe" },
        }),
        null,
        null
      );
      expect(result.custom_data?.value).toBe(120.0);
      expect(result.custom_data?.currency).toBe("USD");
    });

    it("includes content_ids", () => {
      const result = normalizeToMetaCapiEvent(
        makePayload({
          eventName: "InitiateCheckout",
          customData: { content_ids: ["v1", "v2"], value: 100, currency: "USD" },
        }),
        null,
        null
      );
      expect(result.custom_data?.content_ids).toEqual(["v1", "v2"]);
    });

    it("hashes PII from userData (email produces em array)", () => {
      const result = normalizeToMetaCapiEvent(
        makePayload({
          eventName: "InitiateCheckout",
          customData: { value: 100, currency: "USD" },
          userData: { email: "test@example.com" },
        }),
        null,
        null
      );
      // Email should be hashed and placed in em array
      expect(Array.isArray(result.user_data.em)).toBe(true);
      expect(result.user_data.em).toHaveLength(1);
      // Hash is a 64-char hex string (SHA-256)
      expect(result.user_data.em![0]).toMatch(/^[0-9a-f]{64}$/);
    });

    it("hashes first and last name from userData", () => {
      const result = normalizeToMetaCapiEvent(
        makePayload({
          eventName: "InitiateCheckout",
          customData: { value: 100, currency: "USD" },
          userData: { firstName: "Jane", lastName: "Doe" },
        }),
        null,
        null
      );
      expect(Array.isArray(result.user_data.fn)).toBe(true);
      expect(Array.isArray(result.user_data.ln)).toBe(true);
    });
  });

  describe("Purchase event", () => {
    it("includes value, currency, and order_id", () => {
      const result = normalizeToMetaCapiEvent(
        makePayload({
          eventName: "Purchase",
          customData: {
            value: 250.0,
            currency: "USD",
            order_id: "order-999",
            contents: [{ id: "v1", quantity: 2, item_price: 125 }],
          },
        }),
        null,
        null
      );
      expect(result.custom_data?.value).toBe(250.0);
      expect(result.custom_data?.currency).toBe("USD");
      expect(result.custom_data?.order_id).toBe("order-999");
    });

    it("normalizes contents array with id, quantity, and item_price", () => {
      const result = normalizeToMetaCapiEvent(
        makePayload({
          eventName: "Purchase",
          customData: {
            value: 100,
            currency: "USD",
            contents: [
              { id: 42, quantity: "2", item_price: "50.00" },
              { id: "v2", quantity: 1 },
            ],
          },
        }),
        null,
        null
      );
      const contents = result.custom_data?.contents as Array<{ id: string; quantity: number; item_price?: number }>;
      expect(contents).toHaveLength(2);
      expect(contents[0].id).toBe("42");
      expect(contents[0].quantity).toBe(2);
      expect(contents[0].item_price).toBe(50);
      expect(contents[1].id).toBe("v2");
      expect(contents[1].quantity).toBe(1);
      expect(contents[1].item_price).toBeUndefined();
    });

    it("includes content_ids", () => {
      const result = normalizeToMetaCapiEvent(
        makePayload({
          eventName: "Purchase",
          customData: {
            value: 100,
            currency: "USD",
            content_ids: ["v1", "v2"],
            contents: [],
          },
        }),
        null,
        null
      );
      expect(result.custom_data?.content_ids).toEqual(["v1", "v2"]);
    });

    it("hashes PII from userData", () => {
      const result = normalizeToMetaCapiEvent(
        makePayload({
          eventName: "Purchase",
          customData: { value: 100, currency: "USD" },
          userData: { email: "buyer@example.com", firstName: "John", lastName: "Smith" },
        }),
        null,
        null
      );
      expect(Array.isArray(result.user_data.em)).toBe(true);
      expect(result.user_data.em![0]).toMatch(/^[0-9a-f]{64}$/);
      expect(Array.isArray(result.user_data.fn)).toBe(true);
      expect(Array.isArray(result.user_data.ln)).toBe(true);
    });
  });

  describe("event_time is Unix timestamp in seconds", () => {
    it("floors milliseconds to seconds", () => {
      const result = normalizeToMetaCapiEvent(
        makePayload({ timestamp: 1700000000999 }),
        null,
        null
      );
      expect(result.event_time).toBe(1700000000);
    });

    it("handles round second boundary", () => {
      const result = normalizeToMetaCapiEvent(
        makePayload({ timestamp: 1700000001000 }),
        null,
        null
      );
      expect(result.event_time).toBe(1700000001);
    });
  });

  describe("action_source is always 'website'", () => {
    it("is set to website for PageView", () => {
      const result = normalizeToMetaCapiEvent(makePayload({ eventName: "PageView" }), null, null);
      expect(result.action_source).toBe("website");
    });

    it("is set to website for Purchase", () => {
      const result = normalizeToMetaCapiEvent(makePayload({ eventName: "Purchase" }), null, null);
      expect(result.action_source).toBe("website");
    });
  });

  describe("event_id is passed through", () => {
    it("preserves a UUID-style event_id", () => {
      const id = "550e8400-e29b-41d4-a716-446655440000";
      const result = normalizeToMetaCapiEvent(makePayload({ eventId: id }), null, null);
      expect(result.event_id).toBe(id);
    });

    it("preserves a short string event_id", () => {
      const result = normalizeToMetaCapiEvent(makePayload({ eventId: "short" }), null, null);
      expect(result.event_id).toBe("short");
    });
  });

  describe("fbp/fbc validation", () => {
    it("passes through valid fbp format", () => {
      const result = normalizeToMetaCapiEvent(
        makePayload({ fbp: "fb.1.1700000000000.1234567890" }),
        null,
        null
      );
      expect(result.user_data.fbp).toBe("fb.1.1700000000000.1234567890");
    });

    it("passes through valid 15-digit fbp random value", () => {
      const fbp = "fb.1.1700000000000.123456789012345";
      const result = normalizeToMetaCapiEvent(makePayload({ fbp }), null, null);
      expect(result.user_data.fbp).toBe(fbp);
    });

    it("passes through valid 20-digit fbp random value", () => {
      const fbp = "fb.1.1700000000000.12345678901234567890";
      const result = normalizeToMetaCapiEvent(makePayload({ fbp }), null, null);
      expect(result.user_data.fbp).toBe(fbp);
    });

    it("strips fbp random values longer than 20 digits", () => {
      const result = normalizeToMetaCapiEvent(
        makePayload({ fbp: "fb.1.1700000000000.123456789012345678901" }),
        null,
        null
      );
      expect(result.user_data.fbp).toBeUndefined();
    });

    it("strips invalid fbp format", () => {
      const result = normalizeToMetaCapiEvent(
        makePayload({ fbp: "invalid-fbp-value" }),
        null,
        null
      );
      expect(result.user_data.fbp).toBeUndefined();
    });

    it("strips fbp with wrong prefix", () => {
      const result = normalizeToMetaCapiEvent(
        makePayload({ fbp: "xx.1.1700000000000.1234567890" }),
        null,
        null
      );
      expect(result.user_data.fbp).toBeUndefined();
    });

    it("passes through valid fbc format", () => {
      const fbc = `fb.1.${Date.now()}.AbCdEfGhIjKl`;
      const result = normalizeToMetaCapiEvent(
        makePayload({ fbc }),
        null,
        null
      );
      expect(result.user_data.fbc).toBe(fbc);
    });

    it("strips fbc older than 90 days", () => {
      const oldTs = Date.now() - 91 * 24 * 60 * 60 * 1000;
      const fbc = `fb.1.${oldTs}.somefbclid`;
      const result = normalizeToMetaCapiEvent(
        makePayload({ fbc }),
        null,
        null
      );
      expect(result.user_data.fbc).toBeUndefined();
    });

    it("passes fbc at 89 days (edge case)", () => {
      const ts = Date.now() - 89 * 24 * 60 * 60 * 1000;
      const fbc = `fb.1.${ts}.somefbclid`;
      const result = normalizeToMetaCapiEvent(
        makePayload({ fbc }),
        null,
        null
      );
      expect(result.user_data.fbc).toBe(fbc);
    });

    it("strips invalid fbc format", () => {
      const result = normalizeToMetaCapiEvent(
        makePayload({ fbc: "not-a-valid-fbc" }),
        null,
        null
      );
      expect(result.user_data.fbc).toBeUndefined();
    });

    it("handles null fbp and fbc gracefully", () => {
      const result = normalizeToMetaCapiEvent(
        makePayload({}),
        null,
        null
      );
      expect(result.user_data.fbp).toBeUndefined();
      expect(result.user_data.fbc).toBeUndefined();
    });
  });

  describe("camelCase customData keys (as sent by the JS snippet)", () => {
    it("normalizes contentIds to content_ids for ViewContent", () => {
      const result = normalizeToMetaCapiEvent(
        makePayload({
          eventName: "ViewContent",
          customData: {
            contentIds: ["gid://shopify/ProductVariant/123"],
            contentType: "product",
            contentName: "Blue T-Shirt",
            contentCategory: "Tops",
            value: 29.99,
            currency: "USD",
          },
        }),
        null,
        null
      );
      expect(result.custom_data?.content_ids).toEqual(["gid://shopify/ProductVariant/123"]);
      expect(result.custom_data?.content_type).toBe("product");
      expect(result.custom_data?.content_name).toBe("Blue T-Shirt");
      expect(result.custom_data?.content_category).toBe("Tops");
      expect(result.custom_data?.value).toBe(29.99);
      expect(result.custom_data?.currency).toBe("USD");
    });

    it("normalizes numItems to num_items for AddToCart", () => {
      const result = normalizeToMetaCapiEvent(
        makePayload({
          eventName: "AddToCart",
          customData: {
            contentIds: ["gid://shopify/ProductVariant/789"],
            contentType: "product",
            numItems: 2,
            value: 59.98,
            currency: "USD",
          },
        }),
        null,
        null
      );
      expect(result.custom_data?.content_ids).toEqual(["gid://shopify/ProductVariant/789"]);
      expect(result.custom_data?.num_items).toBe(2);
    });

    it("normalizes orderId to order_id and itemPrice to item_price for Purchase", () => {
      const result = normalizeToMetaCapiEvent(
        makePayload({
          eventName: "Purchase",
          customData: {
            value: 250.0,
            currency: "USD",
            contentIds: ["v1", "v2"],
            contentType: "product",
            orderId: "order-999",
            numItems: 3,
            contents: [
              { id: "v1", quantity: 2, itemPrice: 100 },
              { id: "v2", quantity: 1, itemPrice: 50 },
            ],
          },
        }),
        null,
        null
      );
      expect(result.custom_data?.order_id).toBe("order-999");
      expect(result.custom_data?.num_items).toBe(3);
      expect(result.custom_data?.content_ids).toEqual(["v1", "v2"]);
      const contents = result.custom_data?.contents as Array<{ id: string; quantity: number; item_price?: number }>;
      expect(contents).toHaveLength(2);
      expect(contents[0].item_price).toBe(100);
      expect(contents[1].item_price).toBe(50);
    });

    it("handles InitiateCheckout with camelCase contentIds and numItems", () => {
      const result = normalizeToMetaCapiEvent(
        makePayload({
          eventName: "InitiateCheckout",
          customData: {
            value: 120.0,
            currency: "USD",
            contentIds: ["v1", "v2"],
            contentType: "product",
            numItems: 2,
          },
        }),
        null,
        null
      );
      expect(result.custom_data?.content_ids).toEqual(["v1", "v2"]);
      expect(result.custom_data?.num_items).toBe(2);
    });

    it("snake_case still works alongside camelCase support", () => {
      // Verify existing snake_case behaviour is unbroken
      const result = normalizeToMetaCapiEvent(
        makePayload({
          eventName: "ViewContent",
          customData: {
            content_ids: ["123"],
            content_type: "product",
            content_name: "Widget",
            value: 9.99,
            currency: "GBP",
          },
        }),
        null,
        null
      );
      expect(result.custom_data?.content_ids).toEqual(["123"]);
      expect(result.custom_data?.content_type).toBe("product");
      expect(result.custom_data?.content_name).toBe("Widget");
    });
  });
});
