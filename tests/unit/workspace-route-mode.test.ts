import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.fn();
const mockWorkspaceFindFirst = vi.fn();
const mockWorkspaceFindUnique = vi.fn();
const mockWorkspaceUpdate = vi.fn();
const mockResolveShopifyDomain = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    workspace: {
      findFirst: (...args: unknown[]) => mockWorkspaceFindFirst(...args),
      findUnique: (...args: unknown[]) => mockWorkspaceFindUnique(...args),
      update: (...args: unknown[]) => mockWorkspaceUpdate(...args),
    },
  },
}));

vi.mock("@/lib/api-key-cache", () => ({
  invalidateApiKeyCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/workspace-cache", () => ({
  invalidateWorkspaceCache: vi.fn(),
}));

vi.mock("@/lib/shopify-domain-resolver", () => ({
  resolveShopifyDomain: (...args: unknown[]) => mockResolveShopifyDomain(...args),
}));

vi.mock("@/lib/encryption", () => ({
  encrypt: vi.fn(() => ({ encrypted: "encrypted", iv: "iv", tag: "tag" })),
}));

import { PATCH } from "@/app/api/workspaces/[id]/route";

function makePatchRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/workspaces/ws_v1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeUpdatedWorkspace(overrides: Record<string, unknown> = {}) {
  return {
    id: "ws_v1",
    name: "V1 Store",
    domain: "store.myshopify.com",
    platform: "SHOPIFY",
    productMode: "SHOPIFY_META_TIKTOK_V1",
    installType: "SHOPIFY_CUSTOM_PIXEL",
    catalogIdMode: "VARIANT_NUMERIC_ID",
    catalogIdPrefix: null,
    catalogIdSuffix: null,
    catalogIdTemplate: null,
    customIngestDomain: null,
    customIngestDomainVerifiedAt: null,
    customIngestDomainLastCheckedAt: null,
    customIngestDomainLastError: null,
    metaPixelId: null,
    metaAccessTokenEncrypted: null,
    metaTestEventCode: null,
    enableMeta: true,
    metaBrowserTrackingEnabled: false,
    consentMode: "LAX",
    enablePageView: true,
    enableViewContent: true,
    enableAddToCart: true,
    enableInitiateCheckout: true,
    enablePurchase: true,
    isActive: true,
    eventsForwardedCount: 0,
    tiktokPixelId: null,
    tiktokAccessTokenEncrypted: null,
    enableTikTok: false,
    tiktokBrowserTrackingEnabled: false,
    ga4MeasurementId: null,
    ga4ApiSecretEncrypted: null,
    enableGA4: false,
    klaviyoApiKeyEncrypted: null,
    enableKlaviyo: false,
    redditAccountId: null,
    redditAccessTokenEncrypted: null,
    enableReddit: false,
    pinterestAdAccountId: null,
    pinterestConversionTokenEncrypted: null,
    enablePinterest: false,
    googleAdsConversionId: null,
    googleAdsLabelPurchase: null,
    googleAdsLabelAddToCart: null,
    googleAdsLabelInitiateCheckout: null,
    googleAdsLabelViewContent: null,
    enableGoogleAds: false,
    shopifyDomain: "store.myshopify.com",
    shopifyWebhookSecretEncrypted: null,
    shopifyWebhookVerifiedAt: null,
    shopifyWebhookLastReceivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("workspace mode route guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user_123" } });
    mockWorkspaceFindFirst.mockResolvedValue({
      id: "ws_v1",
      userId: "user_123",
      apiKey: "tl_test",
      isActive: true,
      productMode: "SHOPIFY_META_TIKTOK_V1",
      installType: "SHOPIFY_CUSTOM_PIXEL",
      catalogIdMode: "VARIANT_NUMERIC_ID",
      catalogIdPrefix: null,
      catalogIdSuffix: null,
      catalogIdTemplate: null,
      customIngestDomain: null,
      customIngestDomainVerifiedAt: null,
      customIngestDomainLastCheckedAt: null,
      customIngestDomainLastError: null,
      metaPixelId: null,
      enableMeta: true,
      metaBrowserTrackingEnabled: false,
      tiktokPixelId: null,
      enableTikTok: false,
      tiktokBrowserTrackingEnabled: false,
      shopifyDomain: "store.myshopify.com",
    });
    mockWorkspaceFindUnique.mockResolvedValue({ shopifyDomain: "store.myshopify.com" });
    mockResolveShopifyDomain.mockResolvedValue({ shopifyDomain: "store.myshopify.com" });
  });

  it("does not allow public PATCH to switch a normal workspace to legacy", async () => {
    const response = await PATCH(
      makePatchRequest({
        productMode: "LEGACY_ALL_DESTINATIONS",
        installType: "HEADLESS_CUSTOM",
      }),
      { params: Promise.resolve({ id: "ws_v1" }) }
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("product mode");
    expect(mockWorkspaceUpdate).not.toHaveBeenCalled();
  });

  it("allows public PATCH to update catalog ID matching settings", async () => {
    mockWorkspaceUpdate.mockResolvedValue(makeUpdatedWorkspace({
      catalogIdMode: "SKU",
      catalogIdPrefix: "sku:",
      catalogIdSuffix: ":us",
    }));

    const response = await PATCH(
      makePatchRequest({
        catalogIdMode: "SKU",
        catalogIdPrefix: "sku:",
        catalogIdSuffix: ":us",
      }),
      { params: Promise.resolve({ id: "ws_v1" }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.catalogIdMode).toBe("SKU");
    expect(mockWorkspaceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          catalogIdMode: "SKU",
          catalogIdPrefix: "sku:",
          catalogIdSuffix: ":us",
        }),
      })
    );
  });

  it("normalizes custom ingest domains and clears verification when changed", async () => {
    mockWorkspaceFindFirst.mockResolvedValue({
      id: "ws_v1",
      userId: "user_123",
      apiKey: "tl_test",
      isActive: true,
      productMode: "SHOPIFY_META_TIKTOK_V1",
      installType: "SHOPIFY_CUSTOM_PIXEL",
      catalogIdMode: "VARIANT_NUMERIC_ID",
      catalogIdPrefix: null,
      catalogIdSuffix: null,
      catalogIdTemplate: null,
      customIngestDomain: "old.dirava.com",
      customIngestDomainVerifiedAt: new Date("2026-05-22T10:00:00Z"),
      customIngestDomainLastCheckedAt: new Date("2026-05-22T10:00:00Z"),
      customIngestDomainLastError: null,
    });
    mockWorkspaceUpdate.mockResolvedValue(makeUpdatedWorkspace({
      customIngestDomain: "t.dirava.com",
      customIngestDomainVerifiedAt: null,
      customIngestDomainLastCheckedAt: null,
      customIngestDomainLastError: null,
    }));

    const response = await PATCH(
      makePatchRequest({
        customIngestDomain: "https://T.Dirava.COM/path?fbclid=ignored",
      }),
      { params: Promise.resolve({ id: "ws_v1" }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.customIngestDomain).toBe("t.dirava.com");
    expect(mockWorkspaceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customIngestDomain: "t.dirava.com",
          customIngestDomainVerifiedAt: null,
          customIngestDomainLastCheckedAt: null,
          customIngestDomainLastError: null,
        }),
      })
    );
  });

  it("rejects invalid custom ingest domains", async () => {
    const response = await PATCH(
      makePatchRequest({
        customIngestDomain: "localhost",
      }),
      { params: Promise.resolve({ id: "ws_v1" }) }
    );
    const data = await response.json();

    expect(response.status).toBe(422);
    expect(data.error).toContain("public hostname");
    expect(mockWorkspaceUpdate).not.toHaveBeenCalled();
  });

  it("requires a template before enabling custom catalog ID mode", async () => {
    const response = await PATCH(
      makePatchRequest({
        catalogIdMode: "CUSTOM",
        catalogIdTemplate: "",
      }),
      { params: Promise.resolve({ id: "ws_v1" }) }
    );
    const data = await response.json();

    expect(response.status).toBe(422);
    expect(data.error).toContain("requires a template");
    expect(mockWorkspaceUpdate).not.toHaveBeenCalled();
  });

  it("requires an enabled Meta integration and Pixel ID before TrackClear owns browser events", async () => {
    const response = await PATCH(
      makePatchRequest({ metaBrowserTrackingEnabled: true }),
      { params: Promise.resolve({ id: "ws_v1" }) }
    );
    const data = await response.json();

    expect(response.status).toBe(422);
    expect(data.error).toContain("requires an enabled Meta integration and Pixel ID");
    expect(mockWorkspaceUpdate).not.toHaveBeenCalled();
  });

  it("persists explicit TrackClear ownership of Meta browser events", async () => {
    mockWorkspaceFindFirst.mockResolvedValue({
      ...makeUpdatedWorkspace({
        userId: "user_123",
        apiKey: "tl_test",
        metaPixelId: "1234567890",
        metaBrowserTrackingEnabled: false,
      }),
    });
    mockWorkspaceUpdate.mockResolvedValue(
      makeUpdatedWorkspace({
        metaPixelId: "1234567890",
        metaBrowserTrackingEnabled: true,
      })
    );

    const response = await PATCH(
      makePatchRequest({ metaBrowserTrackingEnabled: true }),
      { params: Promise.resolve({ id: "ws_v1" }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.metaBrowserTrackingEnabled).toBe(true);
    expect(mockWorkspaceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ metaBrowserTrackingEnabled: true }),
      })
    );
  });

  it("automatically releases Meta browser ownership when Meta is disabled", async () => {
    mockWorkspaceFindFirst.mockResolvedValue({
      ...makeUpdatedWorkspace({
        userId: "user_123",
        apiKey: "tl_test",
        metaPixelId: "1234567890",
        metaBrowserTrackingEnabled: true,
      }),
    });
    mockWorkspaceUpdate.mockResolvedValue(
      makeUpdatedWorkspace({
        metaPixelId: "1234567890",
        enableMeta: false,
        metaBrowserTrackingEnabled: false,
      })
    );

    const response = await PATCH(
      makePatchRequest({ enableMeta: false }),
      { params: Promise.resolve({ id: "ws_v1" }) }
    );

    expect(response.status).toBe(200);
    expect(mockWorkspaceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          enableMeta: false,
          metaBrowserTrackingEnabled: false,
        }),
      })
    );
  });

  it("requires an enabled TikTok integration and Pixel ID before TrackClear owns browser events", async () => {
    const response = await PATCH(
      makePatchRequest({ tiktokBrowserTrackingEnabled: true }),
      { params: Promise.resolve({ id: "ws_v1" }) }
    );
    const data = await response.json();

    expect(response.status).toBe(422);
    expect(data.error).toContain("requires an enabled TikTok integration and Pixel ID");
    expect(mockWorkspaceUpdate).not.toHaveBeenCalled();
  });

  it("persists and safely releases explicit TrackClear ownership of TikTok browser events", async () => {
    mockWorkspaceFindFirst.mockResolvedValue({
      ...makeUpdatedWorkspace({
        userId: "user_123",
        apiKey: "tl_test",
        tiktokPixelId: "C123",
        enableTikTok: true,
        tiktokBrowserTrackingEnabled: false,
      }),
    });
    mockWorkspaceUpdate
      .mockResolvedValueOnce(
        makeUpdatedWorkspace({
          tiktokPixelId: "C123",
          enableTikTok: true,
          tiktokBrowserTrackingEnabled: true,
        })
      )
      .mockResolvedValueOnce(
        makeUpdatedWorkspace({
          tiktokPixelId: "C123",
          enableTikTok: false,
          tiktokBrowserTrackingEnabled: false,
        })
      );

    const enabled = await PATCH(
      makePatchRequest({ tiktokBrowserTrackingEnabled: true }),
      { params: Promise.resolve({ id: "ws_v1" }) }
    );
    expect(enabled.status).toBe(200);

    mockWorkspaceFindFirst.mockResolvedValue({
      ...makeUpdatedWorkspace({
        userId: "user_123",
        apiKey: "tl_test",
        tiktokPixelId: "C123",
        enableTikTok: true,
        tiktokBrowserTrackingEnabled: true,
      }),
    });
    const disabled = await PATCH(
      makePatchRequest({ enableTikTok: false }),
      { params: Promise.resolve({ id: "ws_v1" }) }
    );

    expect(disabled.status).toBe(200);
    expect(mockWorkspaceUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          enableTikTok: false,
          tiktokBrowserTrackingEnabled: false,
        }),
      })
    );
  });

  it("clears webhook verification when the signing secret changes", async () => {
    mockWorkspaceUpdate.mockResolvedValue(
      makeUpdatedWorkspace({
        shopifyWebhookSecretEncrypted: "encrypted",
        shopifyWebhookVerifiedAt: null,
        shopifyWebhookLastReceivedAt: null,
      })
    );

    const response = await PATCH(
      makePatchRequest({ shopifyWebhookSecret: "replacement-secret" }),
      { params: Promise.resolve({ id: "ws_v1" }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hasShopifyWebhookSecret).toBe(true);
    expect(data.isShopifyWebhookVerified).toBe(false);
    expect(mockWorkspaceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shopifyWebhookSecretEncrypted: "encrypted",
          shopifyWebhookVerifiedAt: null,
          shopifyWebhookLastReceivedAt: null,
        }),
      })
    );
  });

  it("clears webhook verification when the resolved Shopify domain changes", async () => {
    mockWorkspaceFindFirst
      .mockResolvedValueOnce({
        id: "ws_v1",
        userId: "user_123",
        apiKey: "tl_test",
        isActive: true,
        productMode: "SHOPIFY_META_TIKTOK_V1",
        installType: "SHOPIFY_CUSTOM_PIXEL",
        catalogIdMode: "VARIANT_NUMERIC_ID",
        catalogIdTemplate: null,
        customIngestDomain: null,
        shopifyDomain: "store.myshopify.com",
      })
      .mockResolvedValueOnce(null);
    mockResolveShopifyDomain.mockResolvedValueOnce({
      shopifyDomain: "replacement-store.myshopify.com",
    });
    mockWorkspaceUpdate.mockResolvedValue(
      makeUpdatedWorkspace({
        domain: "replacement-store.com",
        shopifyDomain: "replacement-store.myshopify.com",
        shopifyWebhookSecretEncrypted: "encrypted",
        shopifyWebhookVerifiedAt: null,
        shopifyWebhookLastReceivedAt: null,
      })
    );

    const response = await PATCH(
      makePatchRequest({ domain: "replacement-store.com" }),
      { params: Promise.resolve({ id: "ws_v1" }) }
    );

    expect(response.status).toBe(200);
    expect(mockWorkspaceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          domain: "replacement-store.com",
          shopifyDomain: "replacement-store.myshopify.com",
          shopifyWebhookVerifiedAt: null,
          shopifyWebhookLastReceivedAt: null,
        }),
      })
    );
  });
});
