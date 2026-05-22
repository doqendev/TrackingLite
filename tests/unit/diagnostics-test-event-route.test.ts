import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.fn();
const mockWorkspaceFindFirst = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    workspace: {
      findFirst: (...args: unknown[]) => mockWorkspaceFindFirst(...args),
    },
  },
}));

import { POST } from "@/app/api/workspaces/[id]/diagnostics/test-event/route";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/workspaces/ws_123/diagnostics/test-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("diagnostics test-event route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user_123" } });
    mockWorkspaceFindFirst.mockResolvedValue({
      id: "ws_123",
      apiKey: "tl_test",
      domain: "dirava.com",
      shopifyDomain: "dirava.myshopify.com",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, destinations: ["META", "TIKTOK"] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
  });

  it("sends a safe AddToCart diagnostic event through ingest", async () => {
    const response = await POST(makeRequest({ eventName: "AddToCart" }), {
      params: Promise.resolve({ id: "ws_123" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.destinations).toEqual(["META", "TIKTOK"]);

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe("http://localhost/api/events/ingest");
    expect(init).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-TL-API-Key": "tl_test",
        }),
      })
    );
    const payload = JSON.parse(String(init?.body));
    expect(payload.eventName).toBe("AddToCart");
    expect(payload.eventId).toMatch(/^diagnostic:AddToCart:/);
    expect(payload.url).toBe("https://dirava.com/trackclear-diagnostics");
    expect(payload.customData).toEqual(
      expect.objectContaining({
        source: "trackclear_diagnostics",
        diagnostic: true,
        contentIds: ["trackclear_diagnostic_product"],
      })
    );
  });

  it("allows InitiateCheckout but rejects Purchase diagnostic events", async () => {
    const checkoutResponse = await POST(makeRequest({ eventName: "InitiateCheckout" }), {
      params: Promise.resolve({ id: "ws_123" }),
    });
    expect(checkoutResponse.status).toBe(200);

    const purchaseResponse = await POST(makeRequest({ eventName: "Purchase" }), {
      params: Promise.resolve({ id: "ws_123" }),
    });
    const body = await purchaseResponse.json();

    expect(purchaseResponse.status).toBe(422);
    expect(body.error).toContain("Only AddToCart and InitiateCheckout");
  });
});
