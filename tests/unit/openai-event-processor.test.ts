import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import type { DestinationEventJob } from "@/lib/queue";

const mocks = vi.hoisted(() => ({ workspace: vi.fn(), row: vi.fn(), latest: vi.fn(),
  claim: vi.fn(), complete: vi.fn(), fail: vi.fn(), accepted: vi.fn(), superseded: vi.fn(), send: vi.fn(),
  closed: vi.fn(), success: vi.fn(), failure: vi.fn() }));
vi.mock("ioredis", () => ({ default: class { on() {} } }));
vi.mock("bullmq", () => ({ Worker: class { on() {} }, UnrecoverableError: class extends Error {} }));
vi.mock("@/lib/db", () => ({ db: { workspace: { findUnique: mocks.workspace }, eventLog: { findUnique: mocks.row } } }));
vi.mock("@/lib/session-enrichment", () => ({ lookupSessionContextByIdentifiers: mocks.latest }));
vi.mock("@/lib/encryption", () => ({ decrypt: () => "decrypted-key" }));
vi.mock("@/lib/event-delivery-guard", () => ({ claimEventDelivery: mocks.claim, completeEventDeliveryClaim: mocks.complete,
  failEventDeliveryClaim: mocks.fail, markEventDeliveryAccepted: mocks.accepted, isEventDeliverySuperseded: mocks.superseded }));
vi.mock("@/lib/circuit-breaker", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/circuit-breaker")>(),
  isCircuitClosed: mocks.closed, recordSuccess: mocks.success, recordFailure: mocks.failure }));
vi.mock("@/lib/destinations/openai", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/destinations/openai")>(), sendToOpenAI: mocks.send }));
import { OpenAIApiError } from "@/lib/destinations/openai";
import { processOpenAIEvent } from "@/workers/openai-event-processor";

const now = Date.now();
const event: DestinationEventJob["event"] = { eventName: "Purchase", eventId: "canonical", timestamp: now,
  url: "https://shop.example/checkout", referrer: "", clientIp: "203.0.113.1", userAgent: "test",
  userData: {}, customData: { value: "1.23", currency: "EUR" }, openaiPixelId: "Pixel-ABC",
  consent: { marketingAllowed: true, saleOfDataAllowed: true }, trackclearSessionId: "session" };
function job() { return { data: { workspaceId: "store", eventLogId: "row", destination: "OPENAI", event },
  attemptsMade: 0, opts: { attempts: 3 } } as Job<DestinationEventJob>; }
const workspace = () => ({ id: "store", productMode: "SHOPIFY_META_TIKTOK_V1", installType: "SHOPIFY_CUSTOM_PIXEL",
  isActive: true, enableOpenAI: true, enablePurchase: true, openaiPixelId: "Pixel-ABC", consentMode: "STRICT",
  openaiApiKeyEncrypted: "encrypted", openaiApiKeyIv: "iv", openaiApiKeyTag: "tag" });
const row = () => ({ workspaceId: "store", destination: "OPENAI", occurredAt: new Date(now), deliveryTargetId: "Pixel-ABC",
  orderId: "123", orderName: "123", checkoutToken: "checkout", cartToken: "cart" });

describe("ChatGPT Ads final delivery checks", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.workspace.mockResolvedValue(workspace()); mocks.row.mockResolvedValue(row());
    mocks.latest.mockResolvedValue(null); mocks.closed.mockResolvedValue(true);
    mocks.claim.mockResolvedValue({ action: "send", claim: { token: "claim" }, event: { ...event } });
    mocks.send.mockResolvedValue({ accepted: true }); mocks.success.mockResolvedValue(undefined);
    mocks.failure.mockResolvedValue(undefined); mocks.fail.mockResolvedValue(undefined);
  });
  it("uses the canonical encrypted event and original occurrence time after claiming", async () => {
    const queued = job(); queued.data.event = { ...event, eventId: "obsolete", timestamp: now + 100000 };
    await processOpenAIEvent(queued);
    expect(mocks.send).toHaveBeenCalledWith("Pixel-ABC", "decrypted-key", expect.objectContaining({ id: "canonical", timestamp_ms: now }));
    expect(mocks.accepted).toHaveBeenCalledBefore(mocks.complete);
    expect(mocks.latest).toHaveBeenCalledWith("store", expect.objectContaining({ cartToken: "cart" }), { failClosed: true });
  });
  it.each([
    { enableOpenAI: false }, { isActive: false }, { enablePurchase: false }, { openaiPixelId: "different" },
    { openaiApiKeyEncrypted: null }, { installType: "HEADLESS_CUSTOM" },
  ])("blocks current workspace policy %j", async override => {
    mocks.workspace.mockResolvedValue({ ...workspace(), ...override });
    await expect(processOpenAIEvent(job())).rejects.toThrow();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.fail).toHaveBeenCalledWith(expect.objectContaining({ status: "FAILED", nextRetryAt: null }));
  });
  it.each([{ marketing: false }, { saleOfData: false }])("blocks a later consent denial %j", async consent => {
    mocks.latest.mockResolvedValue({ consent });
    await expect(processOpenAIEvent(job())).rejects.toThrow("consent");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("fails closed and retries when consent storage is unavailable", async () => {
    mocks.latest.mockRejectedValue(new Error("Redis unavailable"));
    await expect(processOpenAIEvent(job())).rejects.toThrow();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.fail).toHaveBeenCalledWith(expect.objectContaining({ status: "RETRYING", outcome: "DEFINITELY_NOT_DELIVERED" }));
  });
  it("cannot revive expired identity from retained queue data", async () => {
    mocks.claim.mockResolvedValue({ action: "send", claim: { token: "claim" }, event: null });
    await expect(processOpenAIEvent(job())).rejects.toThrow("expired"); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not refresh old event timestamps on replay", async () => {
    mocks.row.mockResolvedValue({ ...row(), occurredAt: new Date(now - 8 * 86400000) });
    await expect(processOpenAIEvent(job())).rejects.toThrow("window"); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("respects canonical ownership", async () => {
    mocks.claim.mockResolvedValue({ action: "skip" }); await processOpenAIEvent(job()); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("keeps network timeouts ambiguous so a duplicate cannot claim ownership", async () => {
    mocks.send.mockRejectedValue(new Error("fetch failed"));
    await expect(processOpenAIEvent(job())).rejects.toThrow();
    expect(mocks.fail).toHaveBeenCalledWith(expect.objectContaining({ outcome: "DELIVERY_AMBIGUOUS", status: "RETRYING" }));
  });
  it("stops invalid credentials and schedules rate limits for durable recovery", async () => {
    mocks.send.mockRejectedValueOnce(new OpenAIApiError("Invalid key", 401));
    await expect(processOpenAIEvent(job())).rejects.toThrow();
    expect(mocks.fail).toHaveBeenLastCalledWith(expect.objectContaining({ status: "FAILED", nextRetryAt: null }));
    mocks.send.mockRejectedValueOnce(new OpenAIApiError("Rate limited", 429, 3600000));
    await expect(processOpenAIEvent(job())).rejects.toThrow();
    expect(mocks.fail.mock.lastCall?.[0].nextRetryAt.getTime()).toBeGreaterThanOrEqual(now + 3600000);
  });
  it("never reports an accepted delivery as failed if database settlement fails", async () => {
    mocks.complete.mockRejectedValue(new Error("DB unavailable"));
    await expect(processOpenAIEvent(job())).rejects.toThrow();
    expect(mocks.fail).not.toHaveBeenCalled();
  });
});
