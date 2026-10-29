import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  workspaceFindUnique: vi.fn(),
  eventFindFirst: vi.fn(),
  eventCount: vi.fn(),
  eventGroupBy: vi.fn(),
  eventFindMany: vi.fn(),
  deadLetterFindFirst: vi.fn(),
  inboxFindFirst: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    workspace: { findUnique: mocks.workspaceFindUnique },
    eventLog: {
      findFirst: mocks.eventFindFirst,
      count: mocks.eventCount,
      groupBy: mocks.eventGroupBy,
      findMany: mocks.eventFindMany,
    },
    webhookDeadLetter: { findFirst: mocks.deadLetterFindFirst },
    shopifyWebhookInbox: { findFirst: mocks.inboxFindFirst },
  },
}));

import { buildCartAttributionCheck, buildGoogleAdsDeliveryCheck, getTrackingHealth } from "@/lib/tracking-health";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.workspaceFindUnique.mockResolvedValue({
    id: "ws_1",
    enableMeta: true,
    metaPixelId: "meta_1",
    metaAccessTokenEncrypted: "encrypted",
    enableTikTok: true,
    tiktokPixelId: "tt_1",
    tiktokAccessTokenEncrypted: "encrypted",
    shopifyWebhookSecretEncrypted: "encrypted",
    shopifyWebhookVerifiedAt: new Date("2026-07-27T10:00:00.000Z"),
    shopifyWebhookLastReceivedAt: new Date("2026-07-27T10:00:00.000Z"),
    shopifyDomain: "example.myshopify.com",
  });
  mocks.eventFindFirst.mockResolvedValue(null);
  mocks.eventCount.mockResolvedValue(0);
  mocks.eventGroupBy.mockResolvedValue([]);
  mocks.eventFindMany.mockResolvedValue([]);
  mocks.deadLetterFindFirst.mockResolvedValue(null);
  mocks.inboxFindFirst.mockResolvedValue(null);
});

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

describe("tracking health Google Ads delivery check", () => {
  const lastEvent = (overrides: Record<string, unknown> = {}) => ({ createdAt: new Date(), status: "SENT", errorMessage: null,
    destinationRequestStatus: "SUCCESS", destinationStatusDetail: null, ...overrides });

  it("errors when the account or conversion action is missing", () => {
    expect(buildGoogleAdsDeliveryCheck({ configured: false, lastEvent: null, uploadCounts: {}, lastProblem: null }).severity).toBe("error");
  });
  it("waits for a real purchase after setup", () => {
    expect(buildGoogleAdsDeliveryCheck({ configured: true, lastEvent: null, uploadCounts: {}, lastProblem: null }))
      .toMatchObject({ severity: "warning", detail: expect.stringContaining("waiting for a real Purchase") });
  });
  it("is ok only when uploads are accepted and Google reports no problems", () => {
    expect(buildGoogleAdsDeliveryCheck({ configured: true, lastEvent: lastEvent(), uploadCounts: { SUCCESS: 3, PROCESSING: 1 }, lastProblem: null }))
      .toMatchObject({ severity: "ok", detail: expect.stringContaining("3 processed, 1 processing, 0 with problems") });
  });
  it("surfaces Google's reason when an accepted upload later failed", () => {
    const check = buildGoogleAdsDeliveryCheck({ configured: true, lastEvent: lastEvent(), uploadCounts: { SUCCESS: 2, FAILED: 1 },
      lastProblem: { destinationRequestStatus: "FAILED", destinationStatusDetail: { errors: [{ reason: "INVALID_GCLID", recordCount: 1 }] } } });
    expect(check).toMatchObject({ severity: "warning", detail: expect.stringContaining("FAILED for a recent upload (INVALID_GCLID)") });
  });
  it("treats a purchase held for Google's six-hour click window as expected", () => {
    const now = new Date("2026-10-29T12:00:00.000Z");
    const held = buildGoogleAdsDeliveryCheck({ configured: true, uploadCounts: { SUCCESS: 2 }, lastProblem: null, now,
      lastEvent: lastEvent({ status: "PENDING", destinationRequestStatus: null,
        nextRetryAt: new Date("2026-10-29T17:30:00.000Z") }) });
    expect(held).toMatchObject({ severity: "ok", detail: expect.stringContaining("uploads at 2026-10-29 17:30 UTC") });
    const overdue = buildGoogleAdsDeliveryCheck({ configured: true, uploadCounts: {}, lastProblem: null, now,
      lastEvent: lastEvent({ status: "PENDING", destinationRequestStatus: null,
        nextRetryAt: new Date("2026-10-29T11:00:00.000Z") }) });
    expect(overdue.severity).toBe("warning");
  });
  it("warns when the last upload was rejected before Google accepted it", () => {
    expect(buildGoogleAdsDeliveryCheck({ configured: true, uploadCounts: {}, lastProblem: null,
      lastEvent: lastEvent({ status: "FAILED", errorMessage: "Google Ads conversion upload rejected (HTTP 403 PERMISSION_DENIED)", destinationRequestStatus: null }) }))
      .toMatchObject({ severity: "warning", detail: expect.stringContaining("PERMISSION_DENIED") });
  });
});

describe("tracking health delivery-state queries", () => {
  it("counts only delivered purchases as duplicate sends and ignores superseded aliases", async () => {
    await getTrackingHealth("ws_1");

    expect(mocks.eventGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventName: "Purchase",
          status: "SENT",
        }),
      })
    );

    const purchaseHealthQueries = mocks.eventFindFirst.mock.calls
      .map(([query]) => query?.where)
      .filter((where) => where?.eventName === "Purchase" && where?.source === "webhook");
    expect(purchaseHealthQueries.length).toBeGreaterThan(0);
    expect(purchaseHealthQueries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: { not: "SUPERSEDED" } }),
      ])
    );

    const destinationHealthQueries = mocks.eventFindFirst.mock.calls
      .map(([query]) => query?.where)
      .filter((where) => where?.destination === "META" || where?.destination === "TIKTOK");
    expect(destinationHealthQueries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ destination: "META", status: { not: "SUPERSEDED" } }),
        expect.objectContaining({ destination: "TIKTOK", status: { not: "SUPERSEDED" } }),
      ])
    );
  });
});
