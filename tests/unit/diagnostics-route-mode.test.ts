import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.fn();
const mockWorkspaceFindFirst = vi.fn();
const mockEventLogGroupBy = vi.fn();
const mockEventLogCount = vi.fn();
const mockEventLogFindMany = vi.fn();
const mockEventLogFindFirst = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    workspace: {
      findFirst: (...args: unknown[]) => mockWorkspaceFindFirst(...args),
    },
    eventLog: {
      groupBy: (...args: unknown[]) => mockEventLogGroupBy(...args),
      count: (...args: unknown[]) => mockEventLogCount(...args),
      findMany: (...args: unknown[]) => mockEventLogFindMany(...args),
      findFirst: (...args: unknown[]) => mockEventLogFindFirst(...args),
    },
  },
}));

import { GET } from "@/app/api/diagnostics/route";

describe("diagnostics route workspace mode filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user_123" } });
    mockWorkspaceFindFirst.mockResolvedValue({
      id: "ws_v1",
      userId: "user_123",
      name: "Dirava",
      isActive: true,
      productMode: "SHOPIFY_META_TIKTOK_V1",
      installType: "SHOPIFY_CUSTOM_PIXEL",
      enableMeta: true,
      enableTikTok: true,
      enableGA4: true,
      enableKlaviyo: true,
      enableReddit: true,
      enablePinterest: true,
      enableGoogleAds: true,
      metaPixelId: "123",
      metaAccessTokenEncrypted: "encrypted",
      tiktokPixelId: "C123",
      tiktokAccessTokenEncrypted: "encrypted",
      ga4MeasurementId: "G-123",
      ga4ApiSecretEncrypted: "encrypted",
      klaviyoApiKeyEncrypted: "encrypted",
      redditAccountId: "reddit",
      redditAccessTokenEncrypted: "encrypted",
      pinterestAdAccountId: "pinterest",
      pinterestConversionTokenEncrypted: "encrypted",
      googleAdsConversionId: "AW-123",
    });
    mockEventLogGroupBy.mockResolvedValue([]);
    mockEventLogCount.mockResolvedValue(0);
    mockEventLogFindMany.mockResolvedValue([]);
    mockEventLogFindFirst.mockResolvedValue(null);
  });

  it("returns and queries only destinations allowed by the workspace mode", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/diagnostics?workspaceId=ws_v1")
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.workspace.allowedDestinations).toEqual(["META", "TIKTOK"]);
    expect(data.destinationHealth.map((row: { destination: string }) => row.destination)).toEqual([
      "META",
      "TIKTOK",
    ]);

    for (const [args] of mockEventLogGroupBy.mock.calls) {
      expect(args.where.destination).toEqual({ in: ["META", "TIKTOK"] });
    }
    for (const [args] of mockEventLogCount.mock.calls) {
      expect(args.where.destination).toEqual({ in: ["META", "TIKTOK"] });
    }
    for (const [args] of mockEventLogFindMany.mock.calls) {
      expect(args.where.destination).toEqual({ in: ["META", "TIKTOK"] });
    }
  });
});
