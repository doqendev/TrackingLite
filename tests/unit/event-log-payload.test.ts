import { describe, expect, it } from "vitest";
import { buildEventLogPayload, sanitizeEventLogCustomData } from "@/lib/event-log-payload";

describe("event-log-payload", () => {
  it("stores user data flags instead of raw user data", () => {
    const payload = buildEventLogPayload({
      eventName: "Purchase",
      customData: { value: 99.99, currency: "USD" },
      userData: {
        email: "buyer@example.com",
        phone: "+15551234567",
        firstName: "Jane",
        lastName: "Doe",
        city: "Austin",
        state: "TX",
        zip: "78701",
        countryCode: "US",
        customerId: "gid://shopify/Customer/1",
      },
      fbp: "fb.1.1700000000000.1234567890",
      fbc: "fb.1.1700000000000.CLICK123",
      fbclid: "CLICK123",
      ttclid: "TT123",
    });

    expect(payload).toMatchObject({
      eventName: "Purchase",
      customData: { value: 99.99, currency: "USD" },
      userDataFlags: {
        hasEmail: true,
        hasPhone: true,
        hasName: true,
        hasAddress: true,
        hasCustomerId: true,
      },
      clickIdFlags: {
        hasFbp: true,
        hasFbc: true,
        hasFbclid: true,
        hasTtclid: true,
      },
    });
    expect(JSON.stringify(payload)).not.toContain("buyer@example.com");
    expect(JSON.stringify(payload)).not.toContain("+15551234567");
    expect(JSON.stringify(payload)).not.toContain("Jane");
    expect(JSON.stringify(payload)).not.toContain("gid://shopify/Customer/1");
    expect(payload).not.toHaveProperty("userData");
  });

  it("removes nested PII-shaped values from custom data", () => {
    const sanitized = sanitizeEventLogCustomData({
      value: 40,
      currency: "USD",
      checkoutToken: "checkout-token-123",
      cartToken: "cart-token-123",
      email: "buyer@example.com",
      customer: {
        first_name: "Jane",
        last_name: "Doe",
        address1: "123 Main St",
      },
      contents: [
        { id: "variant-1", quantity: 1, item_price: 40 },
      ],
    });

    expect(sanitized).toEqual({
      value: 40,
      currency: "USD",
      customer: {},
      contents: [
        { id: "variant-1", quantity: 1, item_price: 40 },
      ],
    });
    expect(JSON.stringify(sanitized)).not.toContain("buyer@example.com");
    expect(JSON.stringify(sanitized)).not.toContain("Jane");
    expect(JSON.stringify(sanitized)).not.toContain("123 Main St");
    expect(JSON.stringify(sanitized)).not.toContain("checkout-token-123");
    expect(JSON.stringify(sanitized)).not.toContain("cart-token-123");
  });
});
