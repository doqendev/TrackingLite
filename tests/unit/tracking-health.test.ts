import { describe, expect, it } from "vitest";
import { buildCartAttributionCheck } from "@/lib/tracking-health";

describe("tracking health cart attribution check", () => {
  const latestPurchaseAt = new Date("2026-05-23T12:00:00.000Z");

  it("marks recent cart_attributes webhook purchases as excellent", () => {
    const check = buildCartAttributionCheck({
      attributionCounts: { cart_attributes: 2, session_enrichment: 1, landing_site: 1 },
      recentWebhookPurchaseCount: 2,
      latestAttributedPurchaseAt: latestPurchaseAt,
      latestPurchaseAt,
    });

    expect(check.severity).toBe("ok");
    expect(check.label).toBe("Cart helper attribution");
    expect(check.detail).toContain("Excellent");
    expect(check.detail).toContain("doing its job");
    expect(check.detail).toContain("durable cart_attributes");
    expect(check.detail).toContain("cart attributes 2");
  });

  it("warns when webhook purchases only use session or landing attribution", () => {
    const check = buildCartAttributionCheck({
      attributionCounts: { session_enrichment: 1, landing_site: 1 },
      recentWebhookPurchaseCount: 2,
      latestAttributedPurchaseAt: latestPurchaseAt,
      latestPurchaseAt,
    });

    expect(check.severity).toBe("warning");
    expect(check.detail).toContain("Warning");
    expect(check.detail).toContain("attribution survived");
    expect(check.detail).toContain("not through durable cart attributes");
    expect(check.detail).toContain("Install and verify the Cart Attribution Helper");
  });

  it("errors when webhook purchases have no attribution context", () => {
    const check = buildCartAttributionCheck({
      attributionCounts: { none: 2 },
      recentWebhookPurchaseCount: 2,
      latestAttributedPurchaseAt: null,
      latestPurchaseAt,
    });

    expect(check.severity).toBe("error");
    expect(check.detail).toContain("purchase attribution is weak or missing");
    expect(check.detail).toContain("no attribution context");
    expect(check.detail).toContain("Verify Custom Pixel, Shopify webhook, and Cart Attribution Helper");
  });
});
