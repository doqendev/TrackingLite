import { describe, expect, it } from "vitest";
import {
  contentIdOptionsFromWorkspace,
  normalizeContentId,
  normalizeCustomDataContentIds,
  numericShopifyId,
} from "@/lib/content-id";

describe("content-id", () => {
  it("extracts numeric Shopify IDs from GraphQL IDs", () => {
    expect(numericShopifyId("gid://shopify/ProductVariant/1234567890")).toBe("1234567890");
    expect(numericShopifyId("1234567890")).toBe("1234567890");
  });

  it("defaults to variant numeric ID with product and SKU fallbacks", () => {
    expect(normalizeContentId({ variantId: "gid://shopify/ProductVariant/111", productId: 222 })).toBe("111");
    expect(normalizeContentId({ productId: "gid://shopify/Product/222", sku: "SKU-333" })).toBe("222");
    expect(normalizeContentId({ sku: "SKU-333" })).toBe("SKU-333");
  });

  it("supports product, GraphQL, SKU, prefix, suffix, and custom template modes", () => {
    const input = {
      variantId: 111,
      productId: 222,
      sku: "SKU-333",
      country: "US",
    };

    expect(normalizeContentId(input, { mode: "PRODUCT_NUMERIC_ID" })).toBe("222");
    expect(normalizeContentId(input, { mode: "VARIANT_GRAPHQL_ID" })).toBe("gid://shopify/ProductVariant/111");
    expect(normalizeContentId(input, { mode: "PRODUCT_GRAPHQL_ID" })).toBe("gid://shopify/Product/222");
    expect(normalizeContentId(input, { mode: "SKU" })).toBe("SKU-333");
    expect(normalizeContentId(input, { prefix: "shopify_", suffix: "_v" })).toBe("shopify_111_v");
    expect(
      normalizeContentId(input, {
        mode: "CUSTOM",
        template: "shopify_{{country}}_{{product_id}}_{{variant_id}}",
      })
    ).toBe("shopify_US_222_111");
  });

  it("normalizes customData content IDs and rich contents", () => {
    const customData = normalizeCustomDataContentIds<Record<string, unknown>>({
      contentIds: ["gid://shopify/ProductVariant/111"],
      contents: [
        { id: "gid://shopify/ProductVariant/111", quantity: 2, itemPrice: 19.99 },
      ],
    });

    expect(customData.contentIds).toEqual(["111"]);
    expect(customData.content_ids).toEqual(["111"]);
    expect(customData.contents).toEqual([
      { id: "111", content_id: "111", quantity: 2, itemPrice: 19.99 },
    ]);
  });

  it("uses rich content item fields for SKU and custom template ingest normalization", () => {
    const skuData = normalizeCustomDataContentIds<Record<string, unknown>>(
      {
        contentIds: ["gid://shopify/ProductVariant/111"],
        contents: [
          {
            id: "gid://shopify/ProductVariant/111",
            productId: "gid://shopify/Product/222",
            sku: "SKU-111",
            quantity: 1,
          },
        ],
      },
      { mode: "SKU" }
    );
    expect(skuData.contentIds).toEqual(["SKU-111"]);
    expect(skuData.contents).toEqual([
      {
        id: "SKU-111",
        content_id: "SKU-111",
        productId: "gid://shopify/Product/222",
        sku: "SKU-111",
        quantity: 1,
      },
    ]);

    const customData = normalizeCustomDataContentIds<Record<string, unknown>>(
      {
        contentIds: ["gid://shopify/ProductVariant/111"],
        contents: [{ variantId: 111, productId: 222, sku: "SKU-111" }],
      },
      { mode: "CUSTOM", template: "{{product_id}}-{{variant_id}}-{{sku}}" }
    );
    expect(customData.contentIds).toEqual(["222-111-SKU-111"]);
  });

  it("builds content ID options from workspace catalog settings", () => {
    expect(
      contentIdOptionsFromWorkspace({
        catalogIdMode: "SKU",
        catalogIdPrefix: "sku:",
        catalogIdSuffix: ":us",
        catalogIdTemplate: "{{sku}}",
      })
    ).toEqual({
      mode: "SKU",
      prefix: "sku:",
      suffix: ":us",
      template: "{{sku}}",
    });

    expect(contentIdOptionsFromWorkspace(null)).toEqual({
      mode: "VARIANT_NUMERIC_ID",
      prefix: null,
      suffix: null,
      template: null,
    });
  });
});
