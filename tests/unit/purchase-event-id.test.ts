import { describe, expect, it, vi } from "vitest";
import { buildPurchaseEventId, buildPurchaseEventIdFromCustomData } from "@/lib/purchase-event-id";

describe("purchase-event-id", () => {
  it("prefers Shopify order name over order ID when both are present", () => {
    expect(
      buildPurchaseEventId({
        workspaceId: "ws_123",
        shopifyOrderId: "gid://shopify/Order/987654321",
        orderName: "#1001",
        checkoutToken: "checkout-token",
        cartToken: "cart-token",
      })
    ).toBe("shopify-purchase:ws_123:1001");
  });

  it("falls back to Shopify order ID, checkout token, then cart token", () => {
    expect(buildPurchaseEventId({ workspaceId: "ws_123", shopifyOrderId: "gid://shopify/Order/987654321" })).toBe(
      "shopify-purchase:ws_123:987654321"
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

    expect(eventId).toBe("shopify-purchase:ws_123:1001");
  });

  it("converges when browser has only orderName and webhook has orderId plus orderName", () => {
    const browserEventId = buildPurchaseEventId({
      workspaceId: "ws_123",
      orderName: "#1001",
    });
    const webhookEventId = buildPurchaseEventId({
      workspaceId: "ws_123",
      shopifyOrderId: "987654321",
      orderName: "#1001",
    });

    expect(browserEventId).toBe("shopify-purchase:ws_123:1001");
    expect(webhookEventId).toBe(browserEventId);
  });

  it("converges when browser has GraphQL order ID and webhook has numeric order ID", () => {
    const browserEventId = buildPurchaseEventId({
      workspaceId: "ws_123",
      shopifyOrderId: "gid://shopify/Order/987654321",
    });
    const webhookEventId = buildPurchaseEventId({
      workspaceId: "ws_123",
      shopifyOrderId: "987654321",
    });

    expect(browserEventId).toBe("shopify-purchase:ws_123:987654321");
    expect(webhookEventId).toBe(browserEventId);
  });

  it("documents checkout-token-only browser Purchase cannot share the later order-based webhook ID", () => {
    const browserEventId = buildPurchaseEventId({
      workspaceId: "ws_123",
      checkoutToken: "checkout-token",
    });
    const webhookEventId = buildPurchaseEventId({
      workspaceId: "ws_123",
      shopifyOrderId: "987654321",
      orderName: "#1001",
    });

    expect(browserEventId).toBe("shopify-purchase:ws_123:checkout-token");
    expect(webhookEventId).toBe("shopify-purchase:ws_123:1001");
    expect(browserEventId).not.toBe(webhookEventId);
  });

  it("generates a random fallback if no identifier or fallback is provided", () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValueOnce("uuid-123" as `${string}-${string}-${string}-${string}-${string}`);

    expect(buildPurchaseEventId({ workspaceId: "ws_123" })).toBe("uuid-123");
  });
});
