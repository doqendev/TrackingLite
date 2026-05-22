import { describe, expect, it } from "vitest";
import {
  countPresentDiagnosticsAuditFields,
  getVisibleDiagnosticsAuditFields,
} from "@/lib/diagnostics-audit-fields";

describe("diagnostics-audit-fields", () => {
  it("shows only core captured fields for a clean Shopify V1 purchase without click IDs", () => {
    const entry = {
      value: 19.98,
      currency: "EUR",
      orderId: "8630280651016",
      numItems: 1,
      fbp: "fb.1.1710000000000.1234567890",
      pageUrl: "https://dirava.com/products/example",
      customerIp: "***",
      userAgent: "Mozilla/5.0...",
      fbc: null,
      ttclid: null,
      gclid: null,
      rdtCid: null,
      epik: null,
      utmSource: null,
    };
    const fields = getVisibleDiagnosticsAuditFields(entry, ["META", "TIKTOK"]);

    expect(fields.map((field) => field.key)).toEqual([
      "value",
      "currency",
      "orderId",
      "numItems",
      "fbp",
      "pageUrl",
      "customerIp",
      "userAgent",
    ]);
    expect(countPresentDiagnosticsAuditFields(entry, fields)).toBe(8);
  });

  it("includes captured V1 click and UTM fields when they exist", () => {
    const entry = {
      value: 19.98,
      currency: "EUR",
      orderId: "8630280651016",
      numItems: 1,
      fbp: "fb.1.1710000000000.1234567890",
      pageUrl: "https://dirava.com/products/example",
      customerIp: "***",
      userAgent: "Mozilla/5.0...",
      fbc: "fb.1.1710000000000.TEST",
      ttclid: "ttclid-123",
      utmSource: "tiktok",
      utmCampaign: "spring",
    };

    const fields = getVisibleDiagnosticsAuditFields(entry, ["META", "TIKTOK"]);

    expect(fields.map((field) => field.key)).toContain("fbc");
    expect(fields.map((field) => field.key)).toContain("ttclid");
    expect(fields.map((field) => field.key)).toContain("utmSource");
    expect(fields.map((field) => field.key)).toContain("utmCampaign");
    expect(fields.map((field) => field.key)).not.toContain("gclid");
    expect(countPresentDiagnosticsAuditFields(entry, fields)).toBe(fields.length);
  });

  it("does not show captured legacy click IDs when the workspace mode cannot send that destination", () => {
    const fields = getVisibleDiagnosticsAuditFields(
      {
        value: 19.98,
        currency: "EUR",
        orderId: "8630280651016",
        numItems: 1,
        fbp: "fb.1.1710000000000.1234567890",
        pageUrl: "https://dirava.com/products/example",
        customerIp: "***",
        userAgent: "Mozilla/5.0...",
        gclid: "google-click",
        rdtCid: "reddit-click",
        epik: "pinterest-click",
      },
      ["META", "TIKTOK"]
    );

    expect(fields.map((field) => field.key)).not.toContain("gclid");
    expect(fields.map((field) => field.key)).not.toContain("rdtCid");
    expect(fields.map((field) => field.key)).not.toContain("epik");
  });

  it("does not count order ID as a core field for non-purchase events", () => {
    const fields = getVisibleDiagnosticsAuditFields(
      {
        value: 24.99,
        currency: "EUR",
        orderId: null,
        numItems: 1,
        fbp: "fb.1.1710000000000.1234567890",
        pageUrl: "https://dirava.com/products/example",
        customerIp: "***",
        userAgent: "Mozilla/5.0...",
      },
      ["META", "TIKTOK"],
      "AddToCart"
    );

    expect(fields.map((field) => field.key)).not.toContain("orderId");
  });

  it("shows captured legacy destination click IDs when those destinations are allowed", () => {
    const fields = getVisibleDiagnosticsAuditFields(
      {
        value: 19.98,
        currency: "EUR",
        orderId: "8630280651016",
        numItems: 1,
        fbp: "fb.1.1710000000000.1234567890",
        pageUrl: "https://dirava.com/products/example",
        customerIp: "***",
        userAgent: "Mozilla/5.0...",
        gclid: "google-click",
        rdtCid: "reddit-click",
        epik: "pinterest-click",
      },
      ["META", "TIKTOK", "GA4", "KLAVIYO", "REDDIT", "PINTEREST", "GOOGLE_ADS"]
    );

    expect(fields.map((field) => field.key)).toEqual(
      expect.arrayContaining(["gclid", "rdtCid", "epik"])
    );
  });
});
