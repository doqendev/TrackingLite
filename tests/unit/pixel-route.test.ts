import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockFindFirst = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    workspace: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));

let getPixel: typeof import("@/app/api/pixel/[workspaceId]/route").GET;
let getLegacyScript: typeof import("@/app/api/s/[workspaceId]/route").GET;

describe("GET /api/pixel/[workspaceId]", () => {
  beforeAll(async () => {
    const route = await import("@/app/api/pixel/[workspaceId]/route");
    const legacyRoute = await import("@/app/api/s/[workspaceId]/route");
    getPixel = route.GET;
    getLegacyScript = legacyRoute.GET;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_INGEST_URL = "https://api.trackclear.test/api/events/ingest";
  });

  it("does not suppress browser fbq Purchase when Shopify webhook is not configured", async () => {
    mockFindFirst.mockResolvedValue({
      apiKey: "tl_test",
      metaPixelId: "123456",
      shopifyWebhookSecretEncrypted: null,
      catalogIdMode: "VARIANT_NUMERIC_ID",
      catalogIdPrefix: null,
      catalogIdSuffix: null,
      catalogIdTemplate: null,
    });

    const response = await getPixel(new Request("http://localhost/api/pixel/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    const js = await response.text();

    expect(js).toContain("var H=false;");
    expect(js).toContain('W="ws_123"');
    expect(js).toContain("\\d{7,20}");
    expect(js).toContain("o.name||co.orderName||o.id||o.admin_graphql_api_id");
    expect(js).toContain('"shopify-purchase:"+W+":"+id');
    expect(js).toContain('var CM="VARIANT_NUMERIC_ID"');
    expect(js).toContain("contentIds:ci({variantId:v.id");
    expect(js).toContain("_trackclear_session_id");
    expect(js).toContain("/cart/update.js");
    expect(js).toContain("trackclearSessionId:sid");
    expect(js).toContain("gbraid:cid.gb");
    expect(js).toContain("_tc_consent_marketing");
    expect(js).toContain('if(!H&&typeof fbq==="function")fbq("track","Purchase"');
  });

  it("suppresses browser fbq Purchase when Shopify webhook is configured", async () => {
    mockFindFirst.mockResolvedValue({
      apiKey: "tl_test",
      metaPixelId: "123456",
      shopifyWebhookSecretEncrypted: "encrypted-secret",
      catalogIdMode: "VARIANT_NUMERIC_ID",
      catalogIdPrefix: null,
      catalogIdSuffix: null,
      catalogIdTemplate: null,
    });

    const response = await getPixel(new Request("http://localhost/api/pixel/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    const js = await response.text();

    expect(js).toContain("var H=true;");
    expect(js).toContain('W="ws_123"');
    expect(js).toContain("\\d{7,20}");
    expect(js).toContain("o.name||co.orderName||o.id||o.admin_graphql_api_id");
    expect(js).toContain('"shopify-purchase:"+W+":"+id');
    expect(js).toContain("_trackclear_session_id");
    expect(js).toContain("/cart/update.js");
    expect(js).toContain('if(!H&&typeof fbq==="function")fbq("track","Purchase"');
  });

  it("applies the same Purchase fbq guard to the legacy /api/s script", async () => {
    mockFindFirst.mockResolvedValue({
      apiKey: "tl_test",
      metaPixelId: "123456",
      shopifyWebhookSecretEncrypted: "encrypted-secret",
      catalogIdMode: "VARIANT_NUMERIC_ID",
      catalogIdPrefix: null,
      catalogIdSuffix: null,
      catalogIdTemplate: null,
    });

    const response = await getLegacyScript(new Request("http://localhost/api/s/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    const js = await response.text();

    expect(js).toContain("var H=true;");
    expect(js).toContain('W="ws_123"');
    expect(js).toContain("\\d{7,20}");
    expect(js).toContain("o.name||co.orderName||o.id||o.admin_graphql_api_id");
    expect(js).toContain('"shopify-purchase:"+W+":"+id');
    expect(js).toContain("_trackclear_session_id");
    expect(js).toContain("/cart/update.js");
    expect(js).toContain("trackclearSessionId:sid");
    expect(js).toContain('if(!H&&typeof fbq==="function")fbq("track","Purchase"');
  });

  it("embeds catalog ID settings in generated pixel scripts", async () => {
    mockFindFirst.mockResolvedValue({
      apiKey: "tl_test",
      metaPixelId: "123456",
      shopifyWebhookSecretEncrypted: null,
      catalogIdMode: "SKU",
      catalogIdPrefix: "sku:",
      catalogIdSuffix: ":us",
      catalogIdTemplate: null,
    });

    const pixelResponse = await getPixel(new Request("http://localhost/api/pixel/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    const pixelJs = await pixelResponse.text();

    expect(pixelJs).toContain('var CM="SKU",CP="sku:",CS=":us",CT=""');
    expect(pixelJs).toContain("function fm(o)");
    expect(pixelJs).toContain("contentIds:ci({variantId:v.id");

    const legacyResponse = await getLegacyScript(new Request("http://localhost/api/s/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    const legacyJs = await legacyResponse.text();

    expect(legacyJs).toContain('var CM="SKU",CP="sku:",CS=":us",CT=""');
    expect(legacyJs).toContain("function fm(o)");
    expect(legacyJs).toContain("contentIds:ci({variantId:v.id");
  });

  it("uses a verified custom ingest domain in generated pixel scripts", async () => {
    mockFindFirst.mockResolvedValue({
      apiKey: "tl_test",
      metaPixelId: "123456",
      shopifyWebhookSecretEncrypted: null,
      catalogIdMode: "VARIANT_NUMERIC_ID",
      catalogIdPrefix: null,
      catalogIdSuffix: null,
      catalogIdTemplate: null,
      customIngestDomain: "t.dirava.com",
      customIngestDomainVerifiedAt: new Date("2026-05-22T10:00:00Z"),
    });

    const pixelResponse = await getPixel(new Request("http://localhost/api/pixel/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    const pixelJs = await pixelResponse.text();

    expect(pixelJs).toContain('E="https://t.dirava.com/api/events/ingest"');

    const legacyResponse = await getLegacyScript(new Request("http://localhost/api/s/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    const legacyJs = await legacyResponse.text();

    expect(legacyJs).toContain('E="https://t.dirava.com/api/events/ingest"');
  });
});
