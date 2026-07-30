import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUpsert = vi.fn();
const mockFindFirst = vi.fn();
const mockUpdateMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    eventLog: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  },
}));

import {
  buildInternalAttributionEventId,
  persistInternalAttributionEvent,
  sanitizeInternalAttribution,
  supersedeInternalAttributionEvent,
} from "@/lib/internal-attribution";

describe("privacy-minimized internal attribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue({ id: "internal_event_1" });
    mockFindFirst.mockResolvedValue(null);
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("keeps campaign reporting fields while removing query strings and path identifiers", () => {
    const result = sanitizeInternalAttribution({
      workspaceId: "ws_123",
      eventName: "Purchase",
      eventId: "raw-browser-event-id",
      dedupKey: "raw-shopify-order-1001",
      url: "https://www.mizoke.com/account/buyer%40example.com/orders/123456789012?ttclid=secret#receipt",
      referrer: "https://www.tiktok.com/@creator/video/123?ttclid=secret",
      utmSource: "tiktok",
      utmMedium: "paid_social",
      utmCampaign: "chopper-sign-us",
      utmContent: "caption-v1",
      utmTerm: "one piece sign",
      value: 42.5,
      currency: "usd",
      numItems: 2,
    });

    expect(result.eventId).toMatch(/^internal-attribution:[a-f0-9]{64}$/);
    expect(result.eventId).not.toContain("raw-browser-event-id");
    expect(result.eventId).not.toContain("raw-shopify-order-1001");
    expect(result.pageUrl).toBe(
      "https://www.mizoke.com/account/redacted/orders/redacted"
    );
    expect(result.referrerHost).toBe("tiktok.com");
    expect(result).toMatchObject({
      utmSource: "tiktok",
      utmMedium: "paid_social",
      utmCampaign: "chopper-sign-us",
      value: 42.5,
      currency: "USD",
      numItems: 2,
    });
    expect(JSON.stringify(result.payload)).not.toContain("buyer@example.com");
    expect(JSON.stringify(result.payload)).not.toContain("ttclid");
  });

  it("derives anonymous source and medium from an external referrer host", () => {
    const result = sanitizeInternalAttribution({
      workspaceId: "ws_123",
      eventName: "ViewContent",
      eventId: "evt_1",
      url: "https://www.mizoke.com/worlds/one-piece/one-piece-custom-sign",
      referrer: "https://search.example/results?q=private",
    });

    expect(result.utmSource).toBe("search.example");
    expect(result.utmMedium).toBe("referral");
    expect(result.pageUrl).toBe(
      "https://www.mizoke.com/worlds/one-piece/one-piece-custom-sign"
    );
  });

  it("upserts a sent INTERNAL row with no delivery or identity fields", async () => {
    await persistInternalAttributionEvent({
      workspaceId: "ws_123",
      eventName: "Purchase",
      eventId: "raw-event-id",
      dedupKey: "#1001",
      url: "https://www.mizoke.com/products/sign?fbclid=CLICK123",
      utmSource: "tiktok",
      value: 42.5,
      currency: "USD",
      numItems: 1,
    });

    expect(mockUpsert).toHaveBeenCalledOnce();
    const args = mockUpsert.mock.calls[0][0];
    expect(args.create).toMatchObject({
      workspaceId: "ws_123",
      destination: "INTERNAL",
      status: "SENT",
      source: "internal_analytics",
      customerIp: null,
      userAgent: null,
      fbp: null,
      fbc: null,
      orderId: null,
      orderName: null,
      checkoutToken: null,
      cartToken: null,
      gclid: null,
      ttclid: null,
      retryPayloadEncrypted: null,
      deliveryClaimToken: null,
    });
    expect(args.create.eventId).not.toContain("#1001");
    expect(JSON.stringify(args.create)).not.toContain("CLICK123");
    expect(JSON.stringify(args.create)).not.toContain("raw-event-id");
  });

  it("does not add an internal duplicate when the same event already has an external row", async () => {
    mockFindFirst.mockResolvedValueOnce({ id: "meta_event_1" });

    await persistInternalAttributionEvent({
      workspaceId: "ws_123",
      eventName: "Purchase",
      eventId: "shopify-purchase:ws_123:1001",
      value: 42.5,
      currency: "USD",
    });

    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("uses a workspace-scoped one-way identifier", () => {
    const first = buildInternalAttributionEventId({
      workspaceId: "ws_1",
      eventName: "Purchase",
      eventId: "evt",
      dedupKey: "order-1",
    });
    const second = buildInternalAttributionEventId({
      workspaceId: "ws_2",
      eventName: "Purchase",
      eventId: "evt",
      dedupKey: "order-1",
    });

    expect(first).not.toBe(second);
  });

  it("supersedes the matching anonymous row after a consented delivery exists", async () => {
    await supersedeInternalAttributionEvent({
      workspaceId: "ws_123",
      eventName: "Purchase",
      eventId: "raw-event-id",
      dedupKey: "#1001",
    });

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "ws_123",
        eventId: expect.stringMatching(/^internal-attribution:[a-f0-9]{64}$/),
        destination: "INTERNAL",
        status: { not: "SUPERSEDED" },
      },
      data: {
        status: "SUPERSEDED",
        errorMessage: "Replaced by consented destination delivery",
      },
    });
  });
});
