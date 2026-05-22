import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockWorkspaceFindMany = vi.fn();
const mockEventLogFindFirst = vi.fn();
const mockEventLogCreate = vi.fn();
const mockDeadLetterCreate = vi.fn();
const mockQueueAdd = vi.fn();
const mockCheckOrderLimits = vi.fn();
const mockLookupSessionContext = vi.fn();
const mockRedisEval = vi.fn();
const mockRedisSet = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    workspace: {
      findMany: (...args: unknown[]) => mockWorkspaceFindMany(...args),
    },
    eventLog: {
      findFirst: (...args: unknown[]) => mockEventLogFindFirst(...args),
      create: (...args: unknown[]) => mockEventLogCreate(...args),
    },
    webhookDeadLetter: {
      create: (...args: unknown[]) => mockDeadLetterCreate(...args),
    },
  },
}));

vi.mock("@/lib/shopify-webhook", () => ({
  verifyShopifyWebhook: vi.fn(() => true),
}));

vi.mock("@/lib/encryption", () => ({
  decrypt: vi.fn(() => "webhook-secret"),
}));

vi.mock("@/lib/queue", () => {
  const queue = () => ({ add: (...args: unknown[]) => mockQueueAdd(...args) });
  return {
    getEventQueue: queue,
    getTiktokQueue: queue,
    getGA4Queue: queue,
    getKlaviyoQueue: queue,
    getRedditQueue: queue,
    getPinterestQueue: queue,
    getGoogleAdsQueue: queue,
  };
});

vi.mock("@/lib/billing", () => ({
  checkOrderLimits: (...args: unknown[]) => mockCheckOrderLimits(...args),
  decrementOrderCount: vi.fn(),
}));

vi.mock("@/lib/session-enrichment", () => ({
  lookupSessionContextByIdentifiers: (...args: unknown[]) => mockLookupSessionContext(...args),
}));

vi.mock("@/lib/redis", () => ({
  getSharedRedis: () => ({
    eval: (...args: unknown[]) => mockRedisEval(...args),
    set: (...args: unknown[]) => mockRedisSet(...args),
  }),
}));

import { POST } from "@/app/api/webhooks/shopify/route";

const baseWorkspace = {
  id: "ws_v1",
  userId: "user_123",
  productMode: "SHOPIFY_META_TIKTOK_V1",
  installType: "SHOPIFY_CUSTOM_PIXEL",
  shopifyWebhookSecretEncrypted: "encrypted",
  shopifyWebhookSecretIv: "iv",
  shopifyWebhookSecretTag: "tag",
  enableMeta: true,
  metaPixelId: "123456789",
  metaAccessTokenEncrypted: "meta-token",
  enableReddit: false,
  redditAccessTokenEncrypted: null,
  enablePinterest: false,
  pinterestConversionTokenEncrypted: null,
  enableTikTok: true,
  tiktokPixelId: "C123",
  tiktokAccessTokenEncrypted: "tiktok-token",
  enableGA4: true,
  ga4MeasurementId: "G-ABC123",
  ga4ApiSecretEncrypted: "ga4-token",
  enableKlaviyo: false,
  klaviyoApiKeyEncrypted: null,
  enableGoogleAds: false,
  googleAdsConversionId: null,
  enablePurchase: true,
  consentMode: "LAX",
};

function makeShopifyRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/webhooks/shopify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-shopify-hmac-sha256": "valid-hmac",
      "x-shopify-topic": "orders/paid",
      "x-shopify-shop-domain": "mizoke.myshopify.com",
    },
    body: JSON.stringify(body),
  });
}

function makeOrder() {
  return {
    id: 1001,
    name: "#1001",
    total_price: "42.50",
    currency: "USD",
    email: "buyer@example.com",
    source_name: "web",
    landing_site: "/products/sign?fbclid=CLICK123&utm_source=meta",
    note_attributes: [
      { name: "_trackclear_session_id", value: "tc-session-123" },
      { name: "_fbp", value: "fb.1.1700000000000.1234567890" },
      { name: "_tc_consent_marketing", value: "true" },
    ],
    client_details: {
      browser_ip: "203.0.113.10",
      user_agent: "ShopifyBrowser/1.0",
    },
    line_items: [
      {
        variant_id: 111,
        product_id: 222,
        quantity: 2,
        price: "21.25",
      },
    ],
  };
}

describe("Shopify webhook workspace mode allowlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkspaceFindMany.mockResolvedValue([baseWorkspace]);
    mockEventLogFindFirst.mockResolvedValue(null);
    let eventLogId = 0;
    mockEventLogCreate.mockImplementation(async () => ({
      id: `event_log_${++eventLogId}`,
    }));
    mockCheckOrderLimits.mockResolvedValue({ allowed: true });
    mockLookupSessionContext.mockResolvedValue(null);
    mockRedisEval.mockResolvedValue(1);
    mockRedisSet.mockResolvedValue("OK");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("only sends Meta and TikTok for Shopify V1 workspaces", async () => {
    const response = await POST(makeShopifyRequest(makeOrder()));

    expect(response.status).toBe(200);
    expect(mockEventLogCreate).toHaveBeenCalledTimes(2);
    expect(mockEventLogCreate.mock.calls.map((call) => call[0].data.destination)).toEqual([
      "META",
      "TIKTOK",
    ]);
    expect(mockEventLogCreate.mock.calls[0][0].data.eventId).toBe(
      "shopify-purchase:ws_v1:1001"
    );
    expect(mockQueueAdd.mock.calls[0][1].event.eventId).toBe(
      "shopify-purchase:ws_v1:1001"
    );
    expect(mockQueueAdd.mock.calls.map((call) => call[0])).toEqual([
      "send-meta-event",
      "send-tiktok-event",
    ]);
    expect(mockLookupSessionContext).toHaveBeenCalledWith(
      "ws_v1",
      expect.objectContaining({
        email: "buyer@example.com",
        trackclearSessionId: "tc-session-123",
        orderId: "1001",
        orderName: "#1001",
      })
    );
    expect(mockEventLogCreate.mock.calls[0][0].data.payload).toMatchObject({
      attributionSource: "cart_attributes",
      attributionSources: expect.arrayContaining(["cart_attributes"]),
      trackclearSessionIdPresent: true,
      consent: expect.objectContaining({ marketing: true }),
    });
  });

  it("keeps a headless legacy workspace unaffected through LEGACY_WORKSPACE_IDS", async () => {
    vi.stubEnv("LEGACY_WORKSPACE_IDS", "ws_v1");

    const response = await POST(makeShopifyRequest(makeOrder()));

    expect(response.status).toBe(200);
    expect(mockEventLogCreate.mock.calls.map((call) => call[0].data.destination)).toContain("GA4");
  });
});
