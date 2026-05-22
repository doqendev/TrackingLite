import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.fn();
const mockWorkspaceFindFirst = vi.fn();
const mockWorkspaceUpdate = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    workspace: {
      findFirst: (...args: unknown[]) => mockWorkspaceFindFirst(...args),
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
  resolveShopifyDomain: vi.fn(),
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
    });
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
    mockWorkspaceUpdate.mockResolvedValue({
      id: "ws_v1",
      name: "V1 Store",
      domain: "store.myshopify.com",
      platform: "SHOPIFY",
      productMode: "SHOPIFY_META_TIKTOK_V1",
      installType: "SHOPIFY_CUSTOM_PIXEL",
      catalogIdMode: "SKU",
      catalogIdPrefix: "sku:",
      catalogIdSuffix: ":us",
      catalogIdTemplate: null,
      metaPixelId: null,
      metaAccessTokenEncrypted: null,
      metaTestEventCode: null,
      enableMeta: true,
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
      createdAt: new Date(),
      updatedAt: new Date(),
    });

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
});
