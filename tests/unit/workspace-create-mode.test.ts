import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.fn();
const mockSubscriptionFindUnique = vi.fn();
const mockWorkspaceCount = vi.fn();
const mockWorkspaceFindFirst = vi.fn();
const mockWorkspaceCreate = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    subscription: {
      findUnique: (...args: unknown[]) => mockSubscriptionFindUnique(...args),
    },
    workspace: {
      count: (...args: unknown[]) => mockWorkspaceCount(...args),
      findFirst: (...args: unknown[]) => mockWorkspaceFindFirst(...args),
      create: (...args: unknown[]) => mockWorkspaceCreate(...args),
    },
  },
}));

vi.mock("@/lib/api-key", () => ({
  generateApiKey: () => "tl_test_api_key",
}));

vi.mock("@/lib/encryption", () => ({
  encrypt: vi.fn(() => ({ encrypted: "encrypted", iv: "iv", tag: "tag" })),
}));

vi.mock("@/lib/shopify-domain-resolver", () => ({
  resolveShopifyDomain: vi.fn().mockResolvedValue({
    shopifyDomain: "new-store.myshopify.com",
  }),
}));

import { POST } from "@/app/api/workspaces/route";

function makeCreateRequest() {
  return new NextRequest("http://localhost/api/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "New Shopify Store",
      domain: "new-store.myshopify.com",
    }),
  });
}

describe("workspace create product mode defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user_123" } });
    mockSubscriptionFindUnique.mockResolvedValue({ plan: "FREE" });
    mockWorkspaceCount.mockResolvedValue(0);
    mockWorkspaceFindFirst.mockResolvedValue(null);
    mockWorkspaceCreate.mockImplementation(async (args) => ({
      id: "ws_new",
      ...args.data,
    }));
  });

  it("creates normal Shopify workspaces as Meta/TikTok V1 custom-pixel workspaces", async () => {
    const response = await POST(makeCreateRequest());
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.productMode).toBe("SHOPIFY_META_TIKTOK_V1");
    expect(data.installType).toBe("SHOPIFY_CUSTOM_PIXEL");
    expect(mockWorkspaceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productMode: "SHOPIFY_META_TIKTOK_V1",
          installType: "SHOPIFY_CUSTOM_PIXEL",
        }),
      })
    );
  });
});
