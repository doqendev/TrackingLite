import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  workspaceFindFirst: vi.fn(),
  eventFindMany: vi.fn(),
  eventUpdateMany: vi.fn(),
  checkReplayCooldown: vi.fn(),
  queues: {
    META: { getJob: vi.fn(), add: vi.fn() },
    TIKTOK: { getJob: vi.fn(), add: vi.fn() },
    GA4: { getJob: vi.fn(), add: vi.fn() },
    KLAVIYO: { getJob: vi.fn(), add: vi.fn() },
    REDDIT: { getJob: vi.fn(), add: vi.fn() },
    PINTEREST: { getJob: vi.fn(), add: vi.fn() },
    GOOGLE_ADS: { getJob: vi.fn(), add: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: () => mocks.auth() }));
vi.mock("@/lib/db", () => ({
  db: {
    workspace: { findFirst: (...args: unknown[]) => mocks.workspaceFindFirst(...args) },
    eventLog: {
      findMany: (...args: unknown[]) => mocks.eventFindMany(...args),
      updateMany: (...args: unknown[]) => mocks.eventUpdateMany(...args),
    },
  },
}));
vi.mock("@/lib/replay-rate-limit", () => ({
  checkReplayCooldown: (...args: unknown[]) => mocks.checkReplayCooldown(...args),
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));
vi.mock("@/lib/queue", () => ({
  getEventQueue: () => mocks.queues.META,
  getTiktokQueue: () => mocks.queues.TIKTOK,
  getGA4Queue: () => mocks.queues.GA4,
  getKlaviyoQueue: () => mocks.queues.KLAVIYO,
  getRedditQueue: () => mocks.queues.REDDIT,
  getPinterestQueue: () => mocks.queues.PINTEREST,
  getGoogleAdsQueue: () => mocks.queues.GOOGLE_ADS,
}));

import { POST } from "@/app/api/workspaces/[id]/replay/route";

const workspace = {
  id: "ws-1",
  productMode: "SHOPIFY_META_TIKTOK_V1",
  installType: "SHOPIFY_CUSTOM_PIXEL",
  enableMeta: true,
  metaAccessTokenEncrypted: "meta-token",
  enableTikTok: true,
  tiktokAccessTokenEncrypted: "tiktok-token",
  enableGA4: false,
  ga4ApiSecretEncrypted: null,
  enableKlaviyo: false,
  klaviyoApiKeyEncrypted: null,
  enableReddit: false,
  redditAccessTokenEncrypted: null,
  enablePinterest: false,
  pinterestConversionTokenEncrypted: null,
  enableGoogleAds: false,
  googleAdsConversionId: null,
};

const failedEvent = {
  id: "log-1",
  eventName: "Purchase",
  eventId: "purchase-1",
  destination: "TIKTOK",
  payload: { customData: { value: 25, currency: "EUR" } },
  customerIp: "203.0.113.10",
  userAgent: "test-agent",
  fbp: "fbp-1",
  fbc: "fbc-1",
  ttclid: "ttclid-1",
  gclid: "gclid-1",
  rdtCid: "rdt-1",
  epik: "epik-1",
  pageUrl: "https://example.com/checkout",
  value: 25,
  currency: "EUR",
  createdAt: new Date("2026-07-27T10:00:00.000Z"),
  retryCount: 2,
  errorMessage: "TikTok 503: unavailable",
  retryPayloadEncrypted: null,
  retryPayloadIv: null,
  retryPayloadTag: null,
  retryPayloadExpiresAt: null,
};

function request(): NextRequest {
  return new NextRequest("http://localhost/api/workspaces/ws-1/replay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ eventIds: ["log-1"] }),
  });
}

describe("manual event replay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.workspaceFindFirst.mockResolvedValue(workspace);
    mocks.checkReplayCooldown.mockResolvedValue({ allowed: true });
    mocks.eventFindMany.mockResolvedValue([failedEvent]);
    mocks.eventUpdateMany.mockResolvedValue({ count: 1 });
    for (const queue of Object.values(mocks.queues)) {
      queue.getJob.mockResolvedValue(null);
      queue.add.mockResolvedValue({ id: "event-log-1" });
    }
  });

  it("atomically claims and queues one deterministic job with durable click IDs", async () => {
    const response = await POST(request(), { params: Promise.resolve({ id: "ws-1" }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ replayed: 1 });
    expect(mocks.eventUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "log-1",
          status: "FAILED",
          retryCount: 2,
        }),
        data: expect.objectContaining({
          status: "RETRYING",
          retryCount: { increment: 1 },
        }),
      })
    );
    expect(mocks.queues.TIKTOK.add).toHaveBeenCalledWith(
      "send-tiktok-event",
      expect.objectContaining({
        event: expect.objectContaining({
          ttclid: "ttclid-1",
          gclid: "gclid-1",
          rdtCid: "rdt-1",
          epik: "epik-1",
        }),
      }),
      { jobId: "event-log-1" }
    );
  });

  it("does not queue when another replay already won the atomic claim", async () => {
    mocks.eventUpdateMany.mockResolvedValue({ count: 0 });

    const response = await POST(request(), { params: Promise.resolve({ id: "ws-1" }) });

    await expect(response.json()).resolves.toMatchObject({ replayed: 0 });
    expect(mocks.queues.TIKTOK.add).not.toHaveBeenCalled();
  });

  it("honors a destination being disabled after the event failed", async () => {
    mocks.workspaceFindFirst.mockResolvedValue({ ...workspace, enableTikTok: false });

    const response = await POST(request(), { params: Promise.resolve({ id: "ws-1" }) });

    await expect(response.json()).resolves.toMatchObject({ replayed: 0 });
    expect(mocks.eventUpdateMany).not.toHaveBeenCalled();
    expect(mocks.queues.TIKTOK.add).not.toHaveBeenCalled();
  });
});
