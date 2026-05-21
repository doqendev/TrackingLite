import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockQueueAdd = vi.fn().mockResolvedValue({ id: "job-1" });
const mockLookupWorkspaceByApiKey = vi.fn();
const mockEventLogCreate = vi.fn();
const mockStoreSessionContext = vi.fn();

vi.mock("@/lib/api-key", () => ({
  isValidApiKeyFormat: () => true,
}));

vi.mock("@/lib/api-key-cache", () => ({
  lookupWorkspaceByApiKey: (...args: unknown[]) => mockLookupWorkspaceByApiKey(...args),
}));

vi.mock("@/lib/queue", () => ({
  getEventQueue: () => ({ add: mockQueueAdd }),
  getTiktokQueue: () => ({ add: mockQueueAdd }),
  getGA4Queue: () => ({ add: mockQueueAdd }),
  getKlaviyoQueue: () => ({ add: mockQueueAdd }),
  getRedditQueue: () => ({ add: mockQueueAdd }),
  getPinterestQueue: () => ({ add: mockQueueAdd }),
  getGoogleAdsQueue: () => ({ add: mockQueueAdd }),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  checkPurchaseRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("@/lib/billing", () => ({
  checkOrderLimits: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("@/lib/session-enrichment", () => ({
  storeSessionContext: (...args: unknown[]) => mockStoreSessionContext(...args),
}));

vi.mock("@/lib/db", () => ({
  db: {
    eventLog: {
      create: (...args: unknown[]) => mockEventLogCreate(...args),
      findFirst: vi.fn(),
    },
  },
}));

let postIngest: typeof import("@/app/api/events/ingest/route").POST;

function makeRequest(body: Record<string, unknown>, headers: Record<string, string>) {
  return new NextRequest("http://localhost/api/events/ingest", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("ingest attribution handling", () => {
  beforeAll(async () => {
    const route = await import("@/app/api/events/ingest/route");
    postIngest = route.POST;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T12:00:00.000Z"));

    mockLookupWorkspaceByApiKey.mockResolvedValue({
      id: "ws_123",
      userId: "user_123",
      isActive: true,
      consentMode: "LAX",
      enablePageView: true,
      enableViewContent: true,
      enableAddToCart: true,
      enableInitiateCheckout: true,
      enablePurchase: true,
      hasMetaCredentials: true,
      hasTikTokCredentials: false,
      hasGA4Credentials: false,
      hasKlaviyoCredentials: false,
      hasRedditCredentials: false,
      hasPinterestCredentials: false,
      hasGoogleAdsCredentials: false,
      hasShopifyWebhookSecret: false,
    });
    mockEventLogCreate.mockResolvedValue({ id: "event_log_123" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses proxy client headers and synthesized fbc in EventLog, queue, and session context", async () => {
    const payload = {
      eventName: "AddToCart",
      eventId: "evt_123",
      timestamp: Date.now(),
      url: "https://www.mizoke.com/products/test",
      referrer: "",
      fbp: "fb.1.1700000000000.1234567890",
      fbc: null,
      fbclid: "CLICK123",
      consent: { analyticsAllowed: true, marketingAllowed: true },
      userData: { email: "buyer@example.com" },
      customData: { value: 29.99, currency: "EUR" },
    };

    const response = await postIngest(
      makeRequest(payload, {
        "X-TL-API-Key": "tl_test",
        "x-tl-client-ip": "203.0.113.8",
        "x-tl-client-ua": "RealBrowser/1.0",
        "x-forwarded-for": "10.0.0.1",
        "user-agent": "ProxyRuntime/1.0",
      })
    );

    expect(response.status).toBe(200);
    const expectedFbc = "fb.1.1779364800000.CLICK123";

    expect(mockStoreSessionContext).toHaveBeenCalledWith(
      "ws_123",
      "buyer@example.com",
      expect.objectContaining({
        fbc: expectedFbc,
        clientIp: "203.0.113.8",
        userAgent: "RealBrowser/1.0",
      })
    );
    expect(mockEventLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fbc: expectedFbc,
          customerIp: "203.0.113.8",
          userAgent: "RealBrowser/1.0",
        }),
      })
    );
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "send-meta-event",
      expect.objectContaining({
        event: expect.objectContaining({
          fbc: expectedFbc,
          clientIp: "203.0.113.8",
          userAgent: "RealBrowser/1.0",
          fbclid: "CLICK123",
        }),
      })
    );
  });
});
