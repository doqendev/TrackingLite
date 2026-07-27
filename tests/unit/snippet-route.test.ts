import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
const mockFindFirst = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    workspace: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));

let getSnippet: typeof import("@/app/api/snippet/[workspaceId]/route").GET;

describe("GET /api/snippet/[workspaceId]", () => {
  beforeAll(async () => {
    const route = await import("@/app/api/snippet/[workspaceId]/route");
    getSnippet = route.GET;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.trackclear.test");
    mockAuth.mockResolvedValue({ user: { id: "user_123" } });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the default app host when a custom domain is not verified", async () => {
    mockFindFirst.mockResolvedValue({
      customIngestDomain: "t.dirava.com",
      customIngestDomainVerifiedAt: null,
    });

    const response = await getSnippet(new Request("http://localhost/api/snippet/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    const data = await response.json();

    expect(data.snippet).toContain(
      's.src="https://app.trackclear.test/api/pixel/ws_123?loader=bridge-v1"'
    );
    expect(data.snippet).toContain("__tcCustomerPrivacy");
    expect(data.snippet).toContain("api.customerPrivacy");
    expect(data.snippet).toContain("visitorConsentCollected");
    expect(data.snippet).toContain("__tcPrivacyStatus");
  });

  it("uses the verified custom domain as the pixel loader host", async () => {
    mockFindFirst.mockResolvedValue({
      customIngestDomain: "t.dirava.com",
      customIngestDomainVerifiedAt: new Date("2026-05-22T10:00:00Z"),
    });

    const response = await getSnippet(new Request("http://localhost/api/snippet/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    const data = await response.json();

    expect(data.snippet).toContain(
      's.src="https://t.dirava.com/api/pixel/ws_123?loader=bridge-v1"'
    );
  });

  it("subscribes synchronously and replays early Shopify events exactly once", async () => {
    mockFindFirst.mockResolvedValue({
      customIngestDomain: null,
      customIngestDomainVerifiedAt: null,
    });
    const response = await getSnippet(new Request("http://localhost/api/snippet/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    const data = await response.json();

    for (const eventName of [
      "page_viewed",
      "product_viewed",
      "product_added_to_cart",
      "checkout_started",
      "checkout_contact_info_submitted",
      "checkout_address_info_submitted",
      "checkout_completed",
    ]) {
      expect(data.snippet).toContain(`analytics.subscribe("${eventName}"`);
    }
    expect(data.snippet).not.toContain("analytics.subscribe(name");

    const subscriptions = new Map<string, (event: unknown) => void>();
    const analytics = {
      subscribe: vi.fn((name: string, callback: (event: unknown) => void) => {
        subscriptions.set(name, callback);
        return Promise.resolve();
      }),
    };
    const appendChild = vi.fn();
    const windowMock: Record<string, any> = {};
    const documentMock = {
      createElement: vi.fn(() => ({})),
      head: { appendChild },
    };

    new Function(
      "analytics",
      "browser",
      "init",
      "api",
      "customerPrivacy",
      "window",
      "document",
      data.snippet
    )(
      analytics,
      {},
      { customerPrivacy: {} },
      { customerPrivacy: null },
      null,
      windowMock,
      documentMock
    );

    expect(analytics.subscribe).toHaveBeenCalledTimes(7);
    expect(analytics.subscribe.mock.invocationCallOrder.at(-1)).toBeLessThan(
      appendChild.mock.invocationCallOrder[0]
    );

    subscriptions.get("page_viewed")?.({ id: "shopify-page-1" });
    subscriptions.get("checkout_started")?.({ id: "shopify-checkout-1" });
    subscriptions.get("page_viewed")?.({ id: "shopify-page-2" });

    const delivered: string[] = [];
    await windowMock.__tcAnalytics.subscribe("page_viewed", (event: { id: string }) => {
      delivered.push(event.id);
    });
    await windowMock.__tcAnalytics.subscribe("checkout_started", (event: { id: string }) => {
      delivered.push(event.id);
    });
    expect(delivered).toEqual([]);

    windowMock.__tcAnalytics.activate();
    expect(delivered).toEqual([
      "shopify-page-1",
      "shopify-checkout-1",
      "shopify-page-2",
    ]);

    subscriptions.get("page_viewed")?.({ id: "shopify-page-3" });
    windowMock.__tcAnalytics.activate();
    expect(delivered).toEqual([
      "shopify-page-1",
      "shopify-checkout-1",
      "shopify-page-2",
      "shopify-page-3",
    ]);
  });

  it("bounds the pre-activation event bridge while retaining FIFO order", async () => {
    mockFindFirst.mockResolvedValue({
      customIngestDomain: null,
      customIngestDomainVerifiedAt: null,
    });
    const response = await getSnippet(new Request("http://localhost/api/snippet/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    const data = await response.json();
    const subscriptions = new Map<string, (event: { id: string }) => void>();
    const analytics = {
      subscribe: (name: string, callback: (event: { id: string }) => void) => {
        subscriptions.set(name, callback);
        return Promise.resolve();
      },
    };
    const windowMock: Record<string, any> = {};

    new Function(
      "analytics",
      "browser",
      "init",
      "api",
      "customerPrivacy",
      "window",
      "document",
      data.snippet
    )(
      analytics,
      {},
      { customerPrivacy: {} },
      { customerPrivacy: null },
      null,
      windowMock,
      { createElement: () => ({}), head: { appendChild: () => {} } }
    );

    for (let index = 0; index < 105; index++) {
      subscriptions.get("page_viewed")?.({ id: `page-${index}` });
    }
    const delivered: string[] = [];
    await windowMock.__tcAnalytics.subscribe("page_viewed", (event: { id: string }) => {
      delivered.push(event.id);
    });
    windowMock.__tcAnalytics.activate();

    expect(delivered).toHaveLength(100);
    expect(delivered[0]).toBe("page-5");
    expect(delivered.at(-1)).toBe("page-104");
  });

  it("requires an authenticated owner", async () => {
    mockAuth.mockResolvedValue(null);

    const response = await getSnippet(new Request("http://localhost/api/snippet/ws_123"), {
      params: Promise.resolve({ workspaceId: "ws_123" }),
    });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
    expect(mockFindFirst).not.toHaveBeenCalled();
  });
});
