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

    expect(data.snippet).toContain('s.src="https://app.trackclear.test/api/pixel/ws_123"');
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

    expect(data.snippet).toContain('s.src="https://t.dirava.com/api/pixel/ws_123"');
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

