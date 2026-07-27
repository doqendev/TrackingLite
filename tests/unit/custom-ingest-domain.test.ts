import { afterEach, describe, expect, it, vi } from "vitest";
import {
  customIngestVerificationUrl,
  defaultIngestUrl,
  getWorkspaceIngestUrl,
  getWorkspacePixelUrl,
  normalizeCustomIngestDomainInput,
} from "@/lib/custom-ingest-domain";

describe("custom ingest domain helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("normalizes hostnames from bare domains and URLs", () => {
    expect(normalizeCustomIngestDomainInput(" T.Dirava.COM ")).toBe("t.dirava.com");
    expect(normalizeCustomIngestDomainInput("https://T.Dirava.COM/path?x=1")).toBe("t.dirava.com");
    expect(normalizeCustomIngestDomainInput("t.dirava.com/api/events/ingest")).toBe("t.dirava.com");
    expect(normalizeCustomIngestDomainInput("")).toBeNull();
  });

  it("rejects invalid or TrackClear-owned hostnames", () => {
    expect(() => normalizeCustomIngestDomainInput("localhost")).toThrow("public hostname");
    expect(() => normalizeCustomIngestDomainInput("127.0.0.1")).toThrow("public hostname");
    expect(() => normalizeCustomIngestDomainInput("trackclear.io")).toThrow("merchant-owned");
    expect(() => normalizeCustomIngestDomainInput("bad_host.example.com")).toThrow("valid DNS");
  });

  it("uses verified custom domains for generated endpoints only after verification", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.trackclear.test");
    vi.stubEnv("NEXT_PUBLIC_INGEST_URL", "https://api.trackclear.test/api/events/ingest");

    expect(getWorkspaceIngestUrl({ customIngestDomain: "t.dirava.com" })).toBe(
      "https://api.trackclear.test/api/events/ingest"
    );
    expect(getWorkspacePixelUrl({ customIngestDomain: "t.dirava.com" }, "ws_123")).toBe(
      "https://app.trackclear.test/api/pixel/ws_123"
    );

    const verifiedWorkspace = {
      customIngestDomain: "t.dirava.com",
      customIngestDomainVerifiedAt: new Date("2026-05-22T10:00:00Z"),
    };

    expect(getWorkspaceIngestUrl(verifiedWorkspace)).toBe(
      "https://t.dirava.com/api/events/ingest"
    );
    expect(getWorkspacePixelUrl(verifiedWorkspace, "ws_123")).toBe(
      "https://t.dirava.com/api/pixel/ws_123"
    );
  });

  it("falls back to the live TrackClear ingest endpoint when the environment is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_INGEST_URL", "");

    expect(defaultIngestUrl()).toBe("https://www.trackclear.io/api/events/ingest");
  });

  it("builds the public verification check URL", () => {
    expect(customIngestVerificationUrl("t.dirava.com", "ws_123")).toBe(
      "https://t.dirava.com/api/custom-ingest-domain/check?workspaceId=ws_123"
    );
  });
});
