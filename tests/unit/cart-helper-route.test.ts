import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockFindFirst = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    workspace: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));

let getCartHelper: typeof import("@/app/api/cart-helper/[workspaceId]/route").GET;
let optionsCartHelper: typeof import("@/app/api/cart-helper/[workspaceId]/route").OPTIONS;

describe("GET /api/cart-helper/[workspaceId]", () => {
  beforeAll(async () => {
    const route = await import("@/app/api/cart-helper/[workspaceId]/route");
    getCartHelper = route.GET;
    optionsCartHelper = route.OPTIONS;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serves the storefront cart attribution helper for an active workspace", async () => {
    mockFindFirst.mockResolvedValue({ id: "ws_123", consentMode: "STRICT" });

    const response = await getCartHelper(new Request("http://localhost/api/cart-helper/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    const js = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/javascript");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(js).toContain('W="ws_123"');
    expect(js).toContain("_trackclear_session_id");
    expect(js).toContain("/cart/update.js");
    expect(js).toContain("/cart.js");
    expect(js).toContain("_fbclid");
    expect(js).toContain("_ttclid");
    expect(js).toContain("_gbraid");
    expect(js).toContain("_wbraid");
    expect(js).toContain("_utm_source");
    expect(js).toContain("_utm_campaign");
    expect(js).toContain("_landing_page");
    expect(js).toContain("_tc_consent_analytics");
    expect(js).toContain("_tc_consent_marketing");
    expect(js).toContain("_tc_consent_sale_of_data");
    expect(js).toContain('M="STRICT"');
  });

  it("returns 404 for missing workspaces", async () => {
    mockFindFirst.mockResolvedValue(null);

    const response = await getCartHelper(new Request("http://localhost/api/cart-helper/ws_missing"), {
      params: Promise.resolve({ workspaceId: "ws_missing" }),
    });

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("workspace not found");
  });

  it("supports CORS preflight", async () => {
    const response = await optionsCartHelper();

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });
});
