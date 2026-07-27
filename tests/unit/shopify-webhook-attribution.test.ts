import { describe, expect, it } from "vitest";
import {
  buildLineItemContentIds,
  buildLineItemContents,
  buildOrderAttribution,
  canonicalShopifyLineItemId,
  extractLandingSiteAttribution,
  extractOrderAttributes,
  normalizeLandingPageUrl,
  resolveNewestConsentValue,
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
          { name: "_ttp", value: "TTP123" },
          { name: "_rdt_cid", value: "RDT123" },
          { name: "_epik", value: "EPIK123" },
          { name: "_utm_source", value: "meta" },
          { name: "_utm_medium", value: "paid_social" },
          { name: "_trackclear_session_id", value: "tc-session-123" },
          { name: "_landing_page", value: "https://mizoke.com/products/sign?utm_source=meta" },
          { name: "_tc_consent_marketing", value: "true" },
          { name: "_tc_attribution_timestamp", value: "1699999999000" },
          { name: "_tc_attribution_source", value: "meta" },
        ],
      },
      1700000000000
    );

    expect(attribution.trackclearSessionId).toBe("tc-session-123");
    expect(attribution.fbp).toBe("fb.1.1700000000000.1234567890");
    expect(attribution.fbc).toBe("fb.1.1699999999000.CLICK123");
    expect(attribution.gclid).toBe("GCLID123");
    expect(attribution.ttclid).toBe("TTCLID123");
    expect(attribution.ttp).toBe("TTP123");
    expect(attribution.rdtCid).toBe("RDT123");
    expect(attribution.epik).toBe("EPIK123");
    expect(attribution.utmSource).toBe("meta");
    expect(attribution.utmMedium).toBe("paid_social");
    expect(attribution.landingPage).toBe("https://mizoke.com/products/sign?utm_source=meta");
    expect(attribution.consentMarketing).toBe("true");
    expect(attribution.attributionTimestamp).toBe(1699999999000);
    expect(attribution.attributionSource).toBe("meta");
  });

  it("drops stale or future attribution touch metadata without dropping order identifiers", () => {
    const now = 1700000000000;
    const stale = buildOrderAttribution({
      note_attributes: [
        { name: "_ttclid", value: "TTCLID123" },
        { name: "_tc_attribution_timestamp", value: String(now - 31 * 24 * 60 * 60 * 1000) },
        { name: "_tc_attribution_source", value: "tiktok" },
      ],
    }, now);
    const future = buildOrderAttribution({
      note_attributes: [
        { name: "_tc_attribution_timestamp", value: String(now + 6 * 60 * 1000) },
        { name: "_tc_attribution_source", value: "meta" },
      ],
    }, now);

    expect(stale.ttclid).toBe("TTCLID123");
    expect(stale.attributionTimestamp).toBeNull();
    expect(stale.attributionSource).toBeNull();
    expect(future.attributionTimestamp).toBeNull();
    expect(future.attributionSource).toBeNull();
  });

  it("resolves the newest bounded consent snapshot instead of trusting source order", () => {
    const now = 1700000000000;

    expect(resolveNewestConsentValue({
      cartValue: "true",
      cartTimestamp: now - 2_000,
      sessionValue: false,
      sessionTimestamp: now - 1_000,
      now,
    })).toBe(false);
    expect(resolveNewestConsentValue({
      cartValue: "false",
      cartTimestamp: now - 1_000,
      sessionValue: true,
      sessionTimestamp: now - 2_000,
      now,
    })).toBe(false);
    expect(resolveNewestConsentValue({
      cartValue: "false",
      cartTimestamp: now - 25 * 60 * 60 * 1000,
      sessionValue: true,
      sessionTimestamp: now - 1_000,
      now,
    })).toBe(true);
    expect(resolveNewestConsentValue({
      cartValue: "false",
      cartTimestamp: now - 29 * 24 * 60 * 60 * 1000,
      now,
    })).toBe(false);
    expect(resolveNewestConsentValue({
      cartValue: "true",
      cartTimestamp: now + 6 * 60 * 1000,
      sessionValue: false,
      sessionTimestamp: now - 25 * 60 * 60 * 1000,
      now,
    })).toBe(false);
  });

  it("keeps a 29-day-old cart denial available to LAX webhook filtering", () => {
    const now = 1_700_000_000_000;
    const denialAt = now - 29 * 24 * 60 * 60 * 1000;
    const attribution = buildOrderAttribution({
      note_attributes: [
        { name: "_tc_consent_marketing", value: "false" },
        { name: "_tc_consent_timestamp", value: String(denialAt) },
      ],
    }, now);

    expect(attribution.consentTimestamp).toBe(denialAt);
    expect(resolveNewestConsentValue({
      cartValue: attribution.consentMarketing,
      cartTimestamp: attribution.consentTimestamp,
      now,
    })).toBe(false);
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

  it("extracts landing_site fbclid and synthesizes fbc from it", () => {
    const attribution = extractLandingSiteAttribution(
      "/products/custom-sign?fbclid=LANDING_CLICK&utm_source=meta&utm_campaign=launch&gclid=GCLID123&ttclid=TT123&rdt_cid=RDT123&epik=EPIK123",
      "mizoke.com",
      1700000000000
    );

    expect(attribution.pageUrl).toBe(
      "https://mizoke.com/products/custom-sign?fbclid=LANDING_CLICK&utm_source=meta&utm_campaign=launch&gclid=GCLID123&ttclid=TT123&rdt_cid=RDT123&epik=EPIK123"
    );
    expect(attribution.fbclid).toBe("LANDING_CLICK");
    expect(attribution.fbcFromFbclid).toBe("fb.1.1700000000000.LANDING_CLICK");
    expect(attribution.utmSource).toBe("meta");
    expect(attribution.utmCampaign).toBe("launch");
    expect(attribution.gclid).toBe("GCLID123");
    expect(attribution.ttclid).toBe("TT123");
    expect(attribution.rdtCid).toBe("RDT123");
    expect(attribution.epik).toBe("EPIK123");
  });

  it("normalizes relative landing_site values to absolute store URLs", () => {
    expect(
      normalizeLandingPageUrl(
        "/products/custom-sign?fbclid=CLICK123&utm_source=meta",
        "mizoke.com"
      )
    ).toBe("https://mizoke.com/products/custom-sign?fbclid=CLICK123&utm_source=meta");
  });

  it("keeps absolute landing_site values as absolute URLs", () => {
    expect(
      normalizeLandingPageUrl(
        "https://www.mizoke.com/products/custom-sign?utm_source=meta",
        "mizoke.com"
      )
    ).toBe("https://www.mizoke.com/products/custom-sign?utm_source=meta");
  });

  it("falls back to the shop URL for unsafe landing_site protocols", () => {
    expect(normalizeLandingPageUrl("https://[", "mizoke.com")).toBe("https://mizoke.com");

    const attribution = extractLandingSiteAttribution(
      "javascript:alert(1)",
      "mizoke.com",
      1700000000000
    );

    expect(attribution.pageUrl).toBe("https://mizoke.com");
    expect(attribution.fbclid).toBeNull();
    expect(attribution.fbcFromFbclid).toBeNull();
    expect(attribution.utmSource).toBeNull();
  });

  it("returns null pageUrl for empty landing_site values", () => {
    expect(normalizeLandingPageUrl(null, "mizoke.com")).toBeNull();
    expect(normalizeLandingPageUrl("", "mizoke.com")).toBeNull();

    const attribution = extractLandingSiteAttribution(null, "mizoke.com", 1700000000000);
    expect(attribution.pageUrl).toBeNull();
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

  it("applies workspace catalog ID settings to webhook line items", () => {
    const lineItems = [
      {
        variant_id: 111,
        product_id: 222,
        sku: "SKU-333",
        quantity: 1,
        price: "10.00",
      },
    ];

    expect(buildLineItemContentIds(lineItems, { mode: "SKU", prefix: "sku:" })).toEqual([
      "sku:SKU-333",
    ]);
    expect(
      buildLineItemContents(lineItems, {
        mode: "CUSTOM",
        template: "{{product_id}}-{{variant_id}}",
      })
    ).toEqual([{ id: "222-111", quantity: 1, item_price: 10 }]);
  });
});
