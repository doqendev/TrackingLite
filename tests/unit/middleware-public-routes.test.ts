import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetToken = vi.fn();
const mutableProcessEnvironment = process.env as Record<
  string,
  string | undefined
>;

vi.mock("next-auth/jwt", () => ({
  getToken: (...args: unknown[]) => mockGetToken(...args),
}));

let middleware: typeof import("@/middleware").default;
let originalVercelMarker: string | undefined;
let originalVercelEnvironment: string | undefined;
let originalVercelCommit: string | undefined;
let originalApprovedCommit: string | undefined;
let originalNodeEnvironment: string | undefined;
const railwayEnvironmentNames = [
  "RAILWAY_PROJECT_ID",
  "RAILWAY_SERVICE_ID",
  "RAILWAY_ENVIRONMENT_ID",
  "RAILWAY_GIT_COMMIT_SHA",
  "TRACKCLEAR_PRODUCTION_RAILWAY_ENVIRONMENT_ID",
] as const;
let originalRailwayEnvironment = new Map<string, string | undefined>();

describe("middleware public routes", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    originalVercelMarker = process.env.VERCEL;
    originalVercelEnvironment = process.env.VERCEL_ENV;
    originalVercelCommit = process.env.VERCEL_GIT_COMMIT_SHA;
    originalApprovedCommit = process.env.TRACKCLEAR_PRODUCTION_RELEASE_SHA;
    originalNodeEnvironment = process.env.NODE_ENV;
    originalRailwayEnvironment = new Map(
      railwayEnvironmentNames.map((name) => [name, process.env[name]])
    );
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.TRACKCLEAR_PRODUCTION_RELEASE_SHA;
    for (const name of railwayEnvironmentNames) delete process.env[name];
    const mod = await import("@/middleware");
    middleware = mod.default;
  });

  afterEach(() => {
    if (originalVercelMarker === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercelMarker;
    if (originalVercelEnvironment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalVercelEnvironment;
    if (originalVercelCommit === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
    else process.env.VERCEL_GIT_COMMIT_SHA = originalVercelCommit;
    if (originalApprovedCommit === undefined) {
      delete process.env.TRACKCLEAR_PRODUCTION_RELEASE_SHA;
    } else {
      process.env.TRACKCLEAR_PRODUCTION_RELEASE_SHA = originalApprovedCommit;
    }
    if (originalNodeEnvironment === undefined) {
      delete mutableProcessEnvironment.NODE_ENV;
    } else {
      mutableProcessEnvironment.NODE_ENV = originalNodeEnvironment;
    }
    for (const name of railwayEnvironmentNames) {
      const original = originalRailwayEnvironment.get(name);
      if (original === undefined) delete process.env[name];
      else process.env[name] = original;
    }
  });

  it("allows the Shopify cart attribution helper to load without auth", async () => {
    const response = await middleware(
      new NextRequest("https://www.trackclear.io/api/cart-helper/ws_123")
    );

    expect(mockGetToken).not.toHaveBeenCalled();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("fails every matched Vercel production route closed without exact commit metadata", async () => {
    const providerCommit = "a".repeat(40);
    const approvedCommit = "b".repeat(40);
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_GIT_COMMIT_SHA = providerCommit;
    process.env.TRACKCLEAR_PRODUCTION_RELEASE_SHA = approvedCommit;

    const response = await middleware(
      new NextRequest("https://www.trackclear.io/api/events/ingest")
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("retry-after")).toBe("60");
    const body = await response.text();
    expect(body).toContain("Service temporarily unavailable");
    expect(body).not.toContain(providerCommit);
    expect(body).not.toContain(approvedCommit);
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it("fails Vercel production closed when provider commit metadata is missing", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.TRACKCLEAR_PRODUCTION_RELEASE_SHA = "d".repeat(40);
    delete process.env.VERCEL_GIT_COMMIT_SHA;

    const response = await middleware(
      new NextRequest("https://www.trackclear.io/api/webhooks/shopify")
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Service temporarily unavailable",
    });
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it.each([undefined, "unknown"])(
    "fails a Vercel runtime closed for missing or unknown environment metadata (%s)",
    async (vercelEnvironment) => {
      process.env.VERCEL = "1";
      if (vercelEnvironment === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = vercelEnvironment;

      const response = await middleware(
        new NextRequest("https://www.trackclear.io/api/health")
      );

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: "Service temporarily unavailable",
      });
      expect(mockGetToken).not.toHaveBeenCalled();
    }
  );

  it("fails a production-mode runtime closed when every Vercel marker is absent", async () => {
    mutableProcessEnvironment.NODE_ENV = "production";

    const response = await middleware(
      new NextRequest("https://www.trackclear.io/api/events/ingest")
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Service temporarily unavailable",
    });
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it("allows matched production routes only for the exact full provider commit", async () => {
    const commit = "c".repeat(40);
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_GIT_COMMIT_SHA = commit;
    process.env.TRACKCLEAR_PRODUCTION_RELEASE_SHA = commit;

    const response = await middleware(
      new NextRequest("https://www.trackclear.io/api/health")
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(mockGetToken).not.toHaveBeenCalled();

    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    process.env.RAILWAY_PROJECT_ID = "project";
    process.env.RAILWAY_SERVICE_ID = "web-service";
    process.env.RAILWAY_ENVIRONMENT_ID = "production-environment";
    process.env.TRACKCLEAR_PRODUCTION_RAILWAY_ENVIRONMENT_ID =
      "production-environment";
    process.env.RAILWAY_GIT_COMMIT_SHA = commit;

    const railwayResponse = await middleware(
      new NextRequest("https://www.trackclear.io/api/health")
    );

    expect(railwayResponse.headers.get("x-middleware-next")).toBe("1");
    expect(mockGetToken).not.toHaveBeenCalled();
  });
});
