import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { cleanDatabase, cleanRedis, disconnectAll } from "./helpers/db";
import { createUser, createWorkspace, makeIngestPayload } from "./helpers/factories";
import { makeRequest } from "./helpers/request";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { decryptEventRetryEnvelope } from "@/lib/event-retry-envelope";
import { getOrderCount } from "@/lib/billing";
import { queryLogicalCommerce, queryLogicalCampaigns } from "@/lib/logical-event-analytics";
import { storeSessionContextForIdentifiers, lookupSessionContextByIdentifiers, clearSessionContextForIdentifiers } from "@/lib/session-enrichment";

const queue = vi.hoisted(() => ({ add: vi.fn().mockResolvedValue({ id: "job" }), getJob: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/queue", () => ({ getEventQueue: () => queue, getTiktokQueue: () => queue, getOpenAIQueue: () => queue }));
vi.mock("@/lib/currency", () => ({ getExchangeRate: vi.fn().mockResolvedValue(1) }));
import { POST } from "@/app/api/events/ingest/route";
import { POST as shopifyWebhook } from "@/app/api/webhooks/shopify/route";

describe("standard Shopify ChatGPT Ads pipeline", () => {
  beforeEach(async () => { await cleanDatabase(); await cleanRedis(); queue.add.mockClear(); });
  afterAll(disconnectAll);

  async function store() {
    const user = await createUser();
    const initial = await createWorkspace(user.id, { productMode: "SHOPIFY_META_TIKTOK_V1", installType: "SHOPIFY_CUSTOM_PIXEL", consentMode: "STRICT" });
    const key = encrypt("test-capi-key");
    const workspace = await db.workspace.update({ where: { id: initial.id }, data: {
      enableOpenAI: true, openaiPixelId: "ChatGPT-Pixel", openaiApiKeyEncrypted: key.encrypted, openaiApiKeyIv: key.iv, openaiApiKeyTag: key.tag,
      enableTikTok: true, tiktokPixelId: "TikTok-Pixel", tiktokAccessTokenEncrypted: key.encrypted, tiktokAccessTokenIv: key.iv, tiktokAccessTokenTag: key.tag,
    } });
    return { user, workspace };
  }
  function request(apiKey: string, eventName: string, eventId: string, overrides = {}) {
    return makeRequest("/api/events/ingest", { method: "POST", headers: { "X-TL-API-Key": apiKey }, body: {
      ...makeIngestPayload(), eventName, eventId, timestamp: Date.now(), url: "https://shop.example/products/item",
      trackclearSessionId: "opaque-session", consent: { analyticsAllowed: true, marketingAllowed: true, saleOfDataAllowed: true },
      oppref: "Opaque/AbC+", opprefCapturedAt: Date.now() - 1000, ...overrides,
    } });
  }
  it("fans all five events to three durable destinations and bills each Purchase only once", async () => {
    const { user, workspace } = await store();
    for (const eventName of ["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase"]) {
      const response = await POST(request(workspace.apiKey, eventName, `event-${eventName}`, {
        customData: { value: "39.01", currency: "EUR", ...(eventName === "Purchase" ? { orderId: "123" } : {}) },
      }));
      expect(response.status).toBe(200);
      expect((await response.json()).destinations.sort()).toEqual(["META", "OPENAI", "TIKTOK"]);
    }
    expect(await db.eventLog.count()).toBe(15);
    const openai = await db.eventLog.findFirstOrThrow({ where: { destination: "OPENAI", eventName: "Purchase" } });
    expect(openai.deliveryTargetId).toBe("ChatGPT-Pixel");
    expect(openai.occurredAt).toBeInstanceOf(Date);
    const envelope = decryptEventRetryEnvelope(openai);
    expect(envelope?.event).toMatchObject({ openaiPixelId: "ChatGPT-Pixel", oppref: "Opaque/AbC+", consent: { marketingAllowed: true } });
    expect(JSON.stringify(openai.payload)).not.toContain("Opaque/AbC+");
    await POST(request(workspace.apiKey, "Purchase", "different-browser-id", { customData: { orderId: "123", value: 39.01, currency: "EUR" } }));
    expect(await db.eventLog.count({ where: { eventName: "Purchase" } })).toBe(3);
    expect(await getOrderCount(user.id)).toBe(1);
  });
  it("keeps advertising identifiers out of analytics-only records", async () => {
    const { workspace } = await store();
    const response = await POST(request(workspace.apiKey, "AddToCart", "denied", {
      consent: { analyticsAllowed: true, marketingAllowed: false, saleOfDataAllowed: false },
    }));
    expect(response.status).toBe(200);
    const rows = await db.eventLog.findMany();
    expect(rows).toHaveLength(1); expect(rows[0].destination).toBe("INTERNAL");
    expect(JSON.stringify(rows)).not.toContain("Opaque/AbC+"); expect(queue.add).not.toHaveBeenCalled();
  });
  it("captures a signed Purchase and reconciles its browser fallback before three-platform delivery", async () => {
    const { user, workspace } = await store();
    const secret = "integration-webhook-secret";
    const encrypted = encrypt(secret);
    await db.workspace.update({ where: { id: workspace.id }, data: {
      shopifyDomain: "test.myshopify.com", shopifyWebhookSecretEncrypted: encrypted.encrypted,
      shopifyWebhookSecretIv: encrypted.iv, shopifyWebhookSecretTag: encrypted.tag,
    } });
    const time = Date.now();
    await POST(request(workspace.apiKey, "Purchase", "browser-order", { customData: {
      orderId: "123", orderName: "1001", checkoutToken: "checkout-123", value: "39.01", currency: "EUR",
    } }));
    const body = { id: 123, name: "#1001", checkout_token: "checkout-123", cart_token: "cart-123",
      processed_at: new Date(time).toISOString(), total_price: "39.01", currency: "EUR", email: "buyer@example.com",
      landing_site: "/products/item", line_items: [{ variant_id: 22, product_id: 11, quantity: 1, price: "39.01" }],
      note_attributes: Object.entries({ _trackclear_session_id: "opaque-session", _trackclear_oppref: " Opaque/+ ",
        _trackclear_oppref_captured_at: String(time - 500), _tc_consent_marketing: "true",
        _tc_consent_analytics: "true", _tc_consent_sale_of_data: "true", _tc_consent_timestamp: String(time),
      }).map(([name, value]) => ({ name, value })),
    };
    const headers = { "x-shopify-hmac-sha256": createHmac("sha256", secret).update(JSON.stringify(body)).digest("base64"),
      "x-shopify-topic": "orders/paid", "x-shopify-shop-domain": "test.myshopify.com", "x-shopify-webhook-id": "delivery-123" };
    expect((await shopifyWebhook(makeRequest("/api/webhooks/shopify", { method: "POST", headers, body }))).status).toBe(200);
    expect(await db.shopifyWebhookInbox.findFirst()).toMatchObject({ status: "PENDING" });
    const replay = await shopifyWebhook(makeRequest("/api/webhooks/shopify", { method: "POST", body,
      headers: { ...headers, "x-trackclear-inbox-replay": "1", "x-trackclear-inbox-workspace": workspace.id } }));
    expect(await replay.json()).toMatchObject({ ok: true, deferred: false });
    expect(await db.shopifyWebhookInbox.findFirst()).toMatchObject({ status: "PROCESSED", payloadEncrypted: null });
    const purchases = await db.eventLog.findMany({ where: { eventName: "Purchase", status: { not: "SUPERSEDED" } } });
    expect(purchases).toHaveLength(3);
    const openai = purchases.find(row => row.destination === "OPENAI")!;
    expect(openai).toMatchObject({ source: "webhook", deliveryTargetId: "ChatGPT-Pixel", occurredAt: new Date(time) });
    expect(decryptEventRetryEnvelope(openai)?.event).toMatchObject({ oppref: " Opaque/+ ",
      opprefCapturedAt: time - 500, timestamp: time, userData: { email: "buyer@example.com" } });
    expect(await getOrderCount(user.id)).toBe(1);
  });
  it("preserves independent click age and consent tombstones through aliases", async () => {
    const { workspace } = await store();
    const now = Date.now();
    await storeSessionContextForIdentifiers(workspace.id, { trackclearSessionId: "session", cartToken: "cart" }, {
      oppref: "click", opprefCapturedAt: now - 10000, observedAt: now - 1000,
      consent: { marketingAllowed: true, saleOfDataAllowed: true },
    });
    expect(await lookupSessionContextByIdentifiers(workspace.id, { cartToken: "cart" })).toMatchObject({ oppref: "click", opprefCapturedAt: now - 10000 });
    await clearSessionContextForIdentifiers(workspace.id, { trackclearSessionId: "session" }, { marketing: true, observedAt: now });
    const denied = await lookupSessionContextByIdentifiers(workspace.id, { cartToken: "cart" });
    expect(denied?.oppref).toBeUndefined(); expect(denied?.marketingClearedAt).toBe(now);
  });
  it("counts commerce once across destination changes and uses only Purchases for campaign revenue", async () => {
    const { workspace } = await store();
    const now = new Date(); const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const yesterday = new Date(today.getTime() - 86400000);
    await db.eventLog.createMany({ data: [
      { eventId: "old", eventName: "PageView", destination: "META", value: null },
      { eventId: "new", eventName: "PageView", destination: "OPENAI", value: null },
      { eventId: "cart", eventName: "AddToCart", destination: "META", value: 10 },
      { eventId: "cart", eventName: "AddToCart", destination: "OPENAI", value: 10 },
      { eventId: "browser-order", eventName: "Purchase", destination: "META", orderId: "123", value: 10 },
      { eventId: "webhook-order", eventName: "Purchase", destination: "OPENAI", orderId: "123", source: "webhook", value: 12 },
      { eventId: "webhook-order", eventName: "Purchase", destination: "TIKTOK", orderId: "123", source: "webhook", value: 12 },
    ].map(row => ({ ...row, workspaceId: workspace.id, currency: "EUR", status: "SENT", utmSource: "chatgpt", utmCampaign: "campaign" })) as never });
    const commerce = await queryLogicalCommerce(workspace.id, today, yesterday, new Date(Date.now() + 1000), "EUR", ["META", "TIKTOK", "OPENAI"]);
    expect(commerce.eventBreakdown.PageView.today).toBe(2);
    expect(commerce.eventBreakdown.AddToCart.today).toBe(1);
    expect(commerce.revenue.ordersToday).toBe(1); expect(commerce.revenue.purchaseValue.today).toBe(12);
    expect(await queryLogicalCampaigns(workspace.id, "EUR", ["META", "TIKTOK", "OPENAI"])).toEqual([
      { utmSource: "chatgpt", utmCampaign: "campaign", events: 4, revenue: 12 },
    ]);
  });
});
