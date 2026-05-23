import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetToken = vi.fn();

vi.mock("next-auth/jwt", () => ({
  getToken: (...args: unknown[]) => mockGetToken(...args),
}));

let middleware: typeof import("@/middleware").default;

describe("middleware public routes", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/middleware");
    middleware = mod.default;
  });

  it("allows the Shopify cart attribution helper to load without auth", async () => {
    const response = await middleware(
      new NextRequest("https://www.trackclear.io/api/cart-helper/ws_123")
    );

    expect(mockGetToken).not.toHaveBeenCalled();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
