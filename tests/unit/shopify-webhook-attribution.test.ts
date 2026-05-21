import { describe, expect, it } from "vitest";
import {
  buildLineItemContentIds,
  buildLineItemContents,
  buildOrderAttribution,
  canonicalShopifyLineItemId,
  extractOrderAttributes,
} from "@/lib/shopify-webhook-attribution";

describe("shopify-webhook-attribution", () => {
  it("extracts Shopify order attributes from note_attributes arrays", () => {
    const attrs = extractOrderAttributes({
      note_attributes: [
        { name: "_fbp", value: "fb.1.1700000000000.1234567890" },
        { name: "_utm_campaign", value: "spring_test" },
      ],
    });

    expect(attrs._fbp).toBe("fb.1.1700000000000.1234567890");
    expect(attrs._utm_campaign).toBe("spring_test");
  });

  it("builds attribution and synthesizes fbc from stored fbclid", () => {
    const attribution = buildOrderAttribution(
      {
        note_attributes: [
          { name: "_fbp", value: "fb.1.1700000000000.1234567890" },
          { name: "_fbclid", value: "CLICK123" },
          { name: "_gclid", value: "GCLID123" },
          { name: "_ttclid", value: "TTCLID123" },
          { name: "_rdt_cid", value: "RDT123" },
          { name: "_epik", value: "EPIK123" },
          { name: "_utm_source", value: "meta" },
          { name: "_utm_medium", value: "paid_social" },
        ],
      },
      1700000000000
    );

    expect(attribution.fbp).toBe("fb.1.1700000000000.1234567890");
    expect(attribution.fbc).toBe("fb.1.1700000000000.CLICK123");
    expect(attribution.gclid).toBe("GCLID123");
    expect(attribution.ttclid).toBe("TTCLID123");
    expect(attribution.rdtCid).toBe("RDT123");
    expect(attribution.epik).toBe("EPIK123");
    expect(attribution.utmSource).toBe("meta");
    expect(attribution.utmMedium).toBe("paid_social");
  });

  it("uses an explicit _fbc attribute when one exists", () => {
    const attribution = buildOrderAttribution(
      {
        note_attributes: [
          { name: "_fbclid", value: "CLICK123" },
          { name: "_fbc", value: "fb.1.1700000000000.EXPLICIT" },
        ],
      },
      1700000000001
    );

    expect(attribution.fbc).toBe("fb.1.1700000000000.EXPLICIT");
  });

  it("prefers variant IDs for webhook Purchase content IDs", () => {
    expect(
      canonicalShopifyLineItemId({
        variant_id: 111,
        product_id: 222,
        sku: "SKU-333",
      })
    ).toBe("111");
  });

  it("falls back to product ID then SKU when variant ID is absent", () => {
    expect(canonicalShopifyLineItemId({ product_id: 222, sku: "SKU-333" })).toBe("222");
    expect(canonicalShopifyLineItemId({ sku: "SKU-333" })).toBe("SKU-333");
  });

  it("builds Purchase content_ids and contents with quantities and prices", () => {
    const lineItems = [
      { variant_id: 111, product_id: 222, quantity: 2, price: "12.50" },
      { variant_id: 333, quantity: 1, price_set: { shop_money: { amount: "9.99" } } },
    ];

    expect(buildLineItemContentIds(lineItems)).toEqual(["111", "333"]);
    expect(buildLineItemContents(lineItems)).toEqual([
      { id: "111", quantity: 2, item_price: 12.5 },
      { id: "333", quantity: 1, item_price: 9.99 },
    ]);
  });
});
