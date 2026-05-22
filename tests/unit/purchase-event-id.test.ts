import { describe, expect, it, vi } from "vitest";
import { buildPurchaseEventId, buildPurchaseEventIdFromCustomData } from "@/lib/purchase-event-id";

describe("purchase-event-id", () => {
  it("prefers Shopify order ID over other identifiers", () => {
    expect(
      buildPurchaseEventId({
        workspaceId: "ws_123",
        shopifyOrderId: "gid://shopify/Order/987654321",
        orderName: "#1001",
        checkoutToken: "checkout-token",
        cartToken: "cart-token",
      })
    ).toBe("shopify-purchase:ws_123:987654321");
  });

  it("falls back to order name, checkout token, then cart token", () => {
    expect(buildPurchaseEventId({ workspaceId: "ws_123", orderName: "#1001" })).toBe(
      "shopify-purchase:ws_123:1001"
    );
    expect(buildPurchaseEventId({ workspaceId: "ws_123", checkoutToken: "Checkout Token" })).toBe(
      "shopify-purchase:ws_123:checkout_token"
    );
    expect(buildPurchaseEventId({ workspaceId: "ws_123", cartToken: "Cart Token" })).toBe(
      "shopify-purchase:ws_123:cart_token"
    );
  });

  it("uses the provided fallback ID when no Shopify identifier exists", () => {
    expect(buildPurchaseEventId({ workspaceId: "ws_123", fallbackId: "evt_random" })).toBe("evt_random");
  });

  it("builds the same ID from customData order fields", () => {
    const eventId = buildPurchaseEventIdFromCustomData({
      workspaceId: "ws_123",
      eventId: "evt_random",
      customData: {
        orderId: "gid://shopify/Order/987654321",
        orderName: "#1001",
      },
    });

    expect(eventId).toBe("shopify-purchase:ws_123:987654321");
  });

  it("generates a random fallback if no identifier or fallback is provided", () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValueOnce("uuid-123" as `${string}-${string}-${string}-${string}-${string}`);

    expect(buildPurchaseEventId({ workspaceId: "ws_123" })).toBe("uuid-123");
  });
});
