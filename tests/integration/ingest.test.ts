import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { cleanDatabase, cleanRedis, disconnectAll, getTestRedis } from "./helpers/db";
import {
  createUser,
  createWorkspace,
  makeIngestPayload,
} from "./helpers/factories";
import { makeRequest } from "./helpers/request";

// Mock BullMQ queue (don't connect to real Redis for queue)
const mockQueueAdd = vi.fn().mockResolvedValue({ id: "job-1" });
vi.mock("@/lib/queue", () => ({
  getEventQueue: () => ({ add: mockQueueAdd }),
}));

// Mock Stripe (used by billing.ts for auto-upgrade)
vi.mock("@/lib/stripe", () => ({
  stripe: {
    subscriptions: {
      retrieve: vi.fn().mockResolvedValue({
        items: { data: [{ id: "si_test" }] },
      }),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { POST, OPTIONS } from "@/app/api/events/ingest/route";
import { db } from "@/lib/db";

describe("POST /api/events/ingest", () => {
  let user: any;
  let workspace: any;

  beforeEach(async () => {
    await cleanDatabase();
    await cleanRedis();
    mockQueueAdd.mockClear();

    user = await createUser();
    workspace = await createWorkspace(user.id);
  });

  afterAll(async () => {
    await disconnectAll();
  });

  // 1. Missing API key header
  it("returns 401 when API key is missing", async () => {
    const request = makeRequest("/api/events/ingest", {
      method: "POST",
      body: makeIngestPayload(),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);

    const data = await response.json();
    expect(data.error).toContain("Missing API key");
  });

  // 2. Invalid API key
  it("returns 401 for invalid API key", async () => {
    const request = makeRequest("/api/events/ingest", {
      method: "POST",
      body: makeIngestPayload(),
      headers: { "X-TL-API-Key": "tl_0000000000000000000000000000000000000000000000000000000000000000" },
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  // 3. Inactive workspace
  it("returns 403 for inactive workspace", async () => {
    const inactiveWs = await createWorkspace(user.id, { isActive: false });

    const request = makeRequest("/api/events/ingest", {
      method: "POST",
      body: makeIngestPayload(),
      headers: { "X-TL-API-Key": inactiveWs.apiKey },
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  // 4. No destination credentials configured
  it("returns 422 when destination credentials are not configured", async () => {
    const noMetaWs = await createWorkspace(user.id, {
      metaPixelId: null,
      metaAccessToken: null,
    });

    const request = makeRequest("/api/events/ingest", {
      method: "POST",
      body: makeIngestPayload(),
      headers: { "X-TL-API-Key": noMetaWs.apiKey },
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error).toContain("No destination credentials");
  });

  // 5. Valid PageView (happy path)
  it("processes a valid PageView event", async () => {
    const payload = makeIngestPayload({ eventName: "PageView" });
    const request = makeRequest("/api/events/ingest", {
      method: "POST",
      body: payload,
      headers: { "X-TL-API-Key": workspace.apiKey },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.eventId).toBe(payload.eventId);

    // Verify EventLog created in DB
    const eventLog = await db.eventLog.findFirst({
      where: { eventId: payload.eventId },
    });
    expect(eventLog).toBeTruthy();
    expect(eventLog!.status).toBe("PENDING");
    expect(eventLog!.eventName).toBe("PageView");

    // Verify queue job was added
    expect(mockQueueAdd).toHaveBeenCalledOnce();
  });

  // 6. Valid Purchase — counter increments
  it("increments order counter for Purchase events", async () => {
    const payload = makeIngestPayload({
      eventName: "Purchase",
      customData: { value: 99.99, currency: "USD" },
    });
    const request = makeRequest("/api/events/ingest", {
      method: "POST",
      body: payload,
      headers: { "X-TL-API-Key": workspace.apiKey },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    // Check Redis counter incremented
    const redis = getTestRedis();
    const monthKey = new Date().toISOString().slice(0, 7);
    const count = await redis.get(`orders:${user.id}:${monthKey}`);
    expect(count).toBe("1");
  });

  // 7. Non-Purchase — counter unchanged
  it("does not increment order counter for non-Purchase events", async () => {
    const payload = makeIngestPayload({ eventName: "ViewContent" });
    const request = makeRequest("/api/events/ingest", {
      method: "POST",
      body: payload,
      headers: { "X-TL-API-Key": workspace.apiKey },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const redis = getTestRedis();
    const monthKey = new Date().toISOString().slice(0, 7);
    const count = await redis.get(`orders:${user.id}:${monthKey}`);
    expect(count).toBeNull();
  });

  // 8. Event toggle disabled
  it("skips event when toggle is disabled", async () => {
    const disabledWs = await createWorkspace(user.id, {
      enablePageView: false,
    });
    const payload = makeIngestPayload({ eventName: "PageView" });
    const request = makeRequest("/api/events/ingest", {
      method: "POST",
      body: payload,
      headers: { "X-TL-API-Key": disabledWs.apiKey },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.skipped).toBe(true);
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  // 9. STRICT consent, no consent given
  it("skips event in STRICT mode without consent", async () => {
    const strictWs = await createWorkspace(user.id, {
      consentMode: "STRICT",
    });
    const payload = makeIngestPayload({ consent: {} });
    const request = makeRequest("/api/events/ingest", {
      method: "POST",
      body: payload,
      headers: { "X-TL-API-Key": strictWs.apiKey },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.skipped).toBe(true);
  });

  // 10. STRICT consent, consent given
  it("processes event in STRICT mode with consent", async () => {
    const strictWs = await createWorkspace(user.id, {
      consentMode: "STRICT",
    });
    const payload = makeIngestPayload({
      consent: { analyticsAllowed: true, marketingAllowed: true },
    });
    const request = makeRequest("/api/events/ingest", {
      method: "POST",
      body: payload,
      headers: { "X-TL-API-Key": strictWs.apiKey },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.skipped).toBeUndefined();
    expect(mockQueueAdd).toHaveBeenCalled();
  });

  // 11. Invalid payload (missing eventName)
  it("returns 422 for missing eventName", async () => {
    const request = makeRequest("/api/events/ingest", {
      method: "POST",
      body: { eventId: "test-123", timestamp: Date.now() },
      headers: { "X-TL-API-Key": workspace.apiKey },
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
  });

  // 12. Invalid eventName value
  it("returns 422 for invalid eventName", async () => {
    const payload = makeIngestPayload({ eventName: "InvalidEvent" });
    const request = makeRequest("/api/events/ingest", {
      method: "POST",
      body: payload,
      headers: { "X-TL-API-Key": workspace.apiKey },
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
  });

  // 13. CORS preflight (OPTIONS)
  it("handles OPTIONS preflight with CORS headers", async () => {
    const response = await OPTIONS();

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
      "POST"
    );
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
      "X-TL-API-Key"
    );
  });

  // 14. Purchase at FREE limit (50)
  it("returns 402 when free plan order limit reached", async () => {
    // Set Redis counter to 50 (FREE limit)
    const redis = getTestRedis();
    const monthKey = new Date().toISOString().slice(0, 7);
    await redis.set(`orders:${user.id}:${monthKey}`, "50");

    const payload = makeIngestPayload({
      eventName: "Purchase",
      customData: { value: 50 },
    });
    const request = makeRequest("/api/events/ingest", {
      method: "POST",
      body: payload,
      headers: { "X-TL-API-Key": workspace.apiKey },
    });

    const response = await POST(request);
    expect(response.status).toBe(402);

    const data = await response.json();
    expect(data.error).toContain("limit");
  });

  // 15. Queue job payload shape
  it("sends correct MetaEventJob structure to queue", async () => {
    const payload = makeIngestPayload({
      eventName: "Purchase",
      customData: { value: 99.99, currency: "USD" },
      userData: { email: "test@example.com" },
    });
    const request = makeRequest("/api/events/ingest", {
      method: "POST",
      body: payload,
      headers: {
        "X-TL-API-Key": workspace.apiKey,
        "x-forwarded-for": "1.2.3.4",
        "user-agent": "TestAgent/1.0",
      },
    });

    await POST(request);

    expect(mockQueueAdd).toHaveBeenCalledWith(
      "send-meta-event",
      expect.objectContaining({
        workspaceId: workspace.id,
        eventLogId: expect.any(String),
        requestId: expect.any(String),
        event: expect.objectContaining({
          eventName: "Purchase",
          eventId: payload.eventId,
          clientIp: "1.2.3.4",
          userAgent: "TestAgent/1.0",
        }),
      }),
      { jobId: expect.stringMatching(/^event-/) }
    );

    const queuedJob = mockQueueAdd.mock.calls[0][1];
    expect(queuedJob).not.toHaveProperty("pixelId");
    expect(queuedJob).not.toHaveProperty("accessToken");
  });
});
