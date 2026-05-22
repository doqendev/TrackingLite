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
    });

    const response = await getPixel(new Request("http://localhost/api/pixel/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    const js = await response.text();

    expect(js).toContain("var H=false;");
    expect(js).toContain('W="ws_123"');
    expect(js).toContain("\\d{7,20}");
    expect(js).toContain('"shopify-purchase:"+W+":"+id');
    expect(js).toContain("contentIds:ci(v.id)");
    expect(js).toContain('if(!H&&typeof fbq==="function")fbq("track","Purchase"');
  });

  it("suppresses browser fbq Purchase when Shopify webhook is configured", async () => {
    mockFindFirst.mockResolvedValue({
      apiKey: "tl_test",
      metaPixelId: "123456",
      shopifyWebhookSecretEncrypted: "encrypted-secret",
    });

    const response = await getPixel(new Request("http://localhost/api/pixel/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    const js = await response.text();

    expect(js).toContain("var H=true;");
    expect(js).toContain('W="ws_123"');
    expect(js).toContain("\\d{7,20}");
    expect(js).toContain('"shopify-purchase:"+W+":"+id');
    expect(js).toContain('if(!H&&typeof fbq==="function")fbq("track","Purchase"');
  });

  it("applies the same Purchase fbq guard to the legacy /api/s script", async () => {
    mockFindFirst.mockResolvedValue({
      apiKey: "tl_test",
      metaPixelId: "123456",
      shopifyWebhookSecretEncrypted: "encrypted-secret",
    });

    const response = await getLegacyScript(new Request("http://localhost/api/s/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    const js = await response.text();

    expect(js).toContain("var H=true;");
    expect(js).toContain('W="ws_123"');
    expect(js).toContain("\\d{7,20}");
    expect(js).toContain('"shopify-purchase:"+W+":"+id');
    expect(js).toContain('if(!H&&typeof fbq==="function")fbq("track","Purchase"');
  });
});
