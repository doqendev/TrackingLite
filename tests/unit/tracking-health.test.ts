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

import { buildCartAttributionCheck, getTrackingHealth } from "@/lib/tracking-health";

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
