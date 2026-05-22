import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.fn();
const mockWorkspaceFindFirst = vi.fn();
const mockWorkspaceUpdate = vi.fn();
const mockInvalidateApiKeyCache = vi.fn();
const mockInvalidateWorkspaceCache = vi.fn();

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
  invalidateApiKeyCache: (...args: unknown[]) => mockInvalidateApiKeyCache(...args),
}));

vi.mock("@/lib/workspace-cache", () => ({
  invalidateWorkspaceCache: (...args: unknown[]) => mockInvalidateWorkspaceCache(...args),
}));

import { POST } from "@/app/api/workspaces/[id]/custom-ingest-domain/verify/route";

function makeRequest() {
  return new NextRequest("http://localhost/api/workspaces/ws_123/custom-ingest-domain/verify", {
    method: "POST",
  });
}

describe("POST /api/workspaces/[id]/custom-ingest-domain/verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user_123" } });
    mockWorkspaceFindFirst.mockResolvedValue({
      id: "ws_123",
      apiKey: "tl_test",
      customIngestDomain: "t.dirava.test",
    });
    mockInvalidateApiKeyCache.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("marks the custom ingest domain verified when the check route responds with the TrackClear marker", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            service: "trackclear-custom-ingest",
            ok: true,
            workspaceId: "ws_123",
          }),
          {
            status: 200,
            headers: { "X-TrackClear-Custom-Ingest": "ok" },
          }
        )
      )
    );
    mockWorkspaceUpdate.mockResolvedValue({
      customIngestDomain: "t.dirava.test",
      customIngestDomainVerifiedAt: new Date("2026-05-22T10:00:00Z"),
      customIngestDomainLastCheckedAt: new Date("2026-05-22T10:00:00Z"),
      customIngestDomainLastError: null,
    });

    const response = await POST(makeRequest(), {
      params: Promise.resolve({ id: "ws_123" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.verified).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "https://t.dirava.test/api/custom-ingest-domain/check?workspaceId=ws_123",
      expect.objectContaining({ cache: "no-store" })
    );
    expect(mockWorkspaceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customIngestDomainVerifiedAt: expect.any(Date),
          customIngestDomainLastCheckedAt: expect.any(Date),
          customIngestDomainLastError: null,
        }),
      })
    );
    expect(mockInvalidateApiKeyCache).toHaveBeenCalledWith("tl_test");
    expect(mockInvalidateWorkspaceCache).toHaveBeenCalledWith("ws_123");
  });

  it("clears verification when the check route does not return the marker", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ service: "other" }), {
          status: 200,
        })
      )
    );
    mockWorkspaceUpdate.mockResolvedValue({
      customIngestDomain: "t.dirava.test",
      customIngestDomainVerifiedAt: null,
      customIngestDomainLastCheckedAt: new Date("2026-05-22T10:00:00Z"),
      customIngestDomainLastError: "Domain is not routing to the TrackClear custom ingest check.",
    });

    const response = await POST(makeRequest(), {
      params: Promise.resolve({ id: "ws_123" }),
    });
    const data = await response.json();

    expect(response.status).toBe(422);
    expect(data.verified).toBe(false);
    expect(data.error).toContain("not routing");
    expect(mockWorkspaceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customIngestDomainVerifiedAt: null,
          customIngestDomainLastError: expect.stringContaining("not routing"),
        }),
      })
    );
  });

  it("requires a saved custom ingest domain before verifying", async () => {
    mockWorkspaceFindFirst.mockResolvedValue({
      id: "ws_123",
      apiKey: "tl_test",
      customIngestDomain: null,
    });

    const response = await POST(makeRequest(), {
      params: Promise.resolve({ id: "ws_123" }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Save a custom ingest domain");
    expect(mockWorkspaceUpdate).not.toHaveBeenCalled();
  });
});
