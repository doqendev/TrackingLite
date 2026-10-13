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
vi.mock("@/lib/event-delivery-guard", () => ({ claimEventDelivery: mocks.claim, completeEventDeliveryClaim: mocks.complete,
  failEventDeliveryClaim: mocks.fail, markEventDeliveryAccepted: mocks.accepted, isEventDeliverySuperseded: mocks.superseded }));
vi.mock("@/lib/circuit-breaker", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/circuit-breaker")>(),
  isCircuitClosed: mocks.closed, recordSuccess: mocks.success, recordFailure: mocks.failure }));
vi.mock("@/lib/destinations/google-ads", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/destinations/google-ads")>(), sendToGoogleAds: mocks.send }));
import { GoogleAdsApiError } from "@/lib/destinations/google-ads";
import { GOOGLE_STATUS_FIRST_CHECK_MS } from "@/lib/google-ads-request-status";
import { processGoogleAdsEvent } from "@/workers/google-ads-event-processor";

const now = Date.now();
const target = "1234567890:987654321";
const event: DestinationEventJob["event"] = { eventName: "Purchase", eventId: "canonical", timestamp: now,
  url: "https://shop.example/checkout", referrer: "", clientIp: "203.0.113.1", userAgent: "test",
  userData: { email: "buyer@example.com" }, customData: { value: "39.99", currency: "EUR", order_id: "#5530" },
  gclid: "Cj0-click", googleAdsTargetId: target,
  consent: { marketingAllowed: true, saleOfDataAllowed: true }, trackclearSessionId: "session" };
function job() { return { data: { workspaceId: "store", eventLogId: "row", destination: "GOOGLE_ADS", event },
  attemptsMade: 0, opts: { attempts: 3 } } as Job<DestinationEventJob>; }
const workspace = () => ({ id: "store", productMode: "SHOPIFY_META_TIKTOK_V1", installType: "SHOPIFY_CUSTOM_PIXEL",
  isActive: true, enableGoogleAds: true, enablePurchase: true, consentMode: "STRICT",
  googleAdsCustomerId: "1234567890", googleAdsConversionActionId: "987654321", googleAdsLoginCustomerId: null });
const row = () => ({ workspaceId: "store", destination: "GOOGLE_ADS", occurredAt: new Date(now - 60000), deliveryTargetId: target,
  orderId: "123", orderName: "#5530", checkoutToken: "checkout", cartToken: "cart" });

describe("Google Ads final delivery checks", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.workspace.mockResolvedValue(workspace()); mocks.row.mockResolvedValue(row());
    mocks.latest.mockResolvedValue(null); mocks.closed.mockResolvedValue(true);
    mocks.claim.mockResolvedValue({ action: "send", claim: { eventLogId: "row", token: "claim" }, event: { ...event } });
    mocks.send.mockResolvedValue({ accepted: true, validated: false, status: 200, requestId: "req-1", fieldWarnings: 0 });
    mocks.success.mockResolvedValue(undefined); mocks.failure.mockResolvedValue(undefined); mocks.fail.mockResolvedValue(undefined);
  });
  it("uploads the canonical event at its original time and records Google's request for status checks", async () => {
    const queued = job(); queued.data.event = { ...event, eventId: "obsolete", timestamp: now + 100000 };
    await processGoogleAdsEvent(queued);
    const request = mocks.send.mock.calls[0][0];
    expect(request.destinations[0]).toEqual({ operatingAccount: { accountType: "GOOGLE_ADS", accountId: "1234567890" },
      productDestinationId: "987654321" });
    expect(request.events[0]).toMatchObject({ transactionId: "#5530", eventTimestamp: new Date(now - 60000).toISOString(),
      adIdentifiers: { gclid: "Cj0-click" }, conversionValue: 39.99, currency: "EUR" });
    expect(request.consent).toEqual({ adUserData: "CONSENT_GRANTED", adPersonalization: "CONSENT_GRANTED" });
    const [, receipt, acceptedAt, bookkeeping] = mocks.accepted.mock.calls[0];
    expect(receipt).toMatchObject({ requestId: "req-1" });
    expect(bookkeeping).toEqual({ destinationRequestId: "req-1", destinationRequestStatus: "PROCESSING",
      destinationStatusCheckedAt: null,
      destinationStatusNextCheckAt: new Date(acceptedAt.getTime() + GOOGLE_STATUS_FIRST_CHECK_MS) });
    expect(mocks.accepted).toHaveBeenCalledBefore(mocks.complete);
    expect(mocks.latest).toHaveBeenCalledWith("store", expect.objectContaining({ cartToken: "cart" }), { failClosed: true });
  });
  it("logs in through a manager account when one is configured", async () => {
    mocks.workspace.mockResolvedValue({ ...workspace(), googleAdsLoginCustomerId: "1111111111" });
    await processGoogleAdsEvent(job());
    expect(mocks.send.mock.calls[0][0].destinations[0].loginAccount).toEqual({ accountType: "GOOGLE_ADS", accountId: "1111111111" });
  });
  it.each([
    { enableGoogleAds: false }, { isActive: false }, { enablePurchase: false }, { googleAdsConversionActionId: "111" },
    { googleAdsCustomerId: null }, { installType: "HEADLESS_CUSTOM" },
  ])("blocks current workspace policy %j", async override => {
    mocks.workspace.mockResolvedValue({ ...workspace(), ...override });
    await expect(processGoogleAdsEvent(job())).rejects.toThrow();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.fail).toHaveBeenCalledWith(expect.objectContaining({ status: "FAILED", nextRetryAt: null }));
  });
  it("never sends a row captured for another account or conversion action", async () => {
    mocks.claim.mockResolvedValue({ action: "send", claim: { token: "claim" }, event: { ...event, googleAdsTargetId: "other:1" } });
    await expect(processGoogleAdsEvent(job())).rejects.toThrow("target");
    mocks.claim.mockResolvedValue({ action: "send", claim: { token: "claim" }, event: { ...event } });
    mocks.row.mockResolvedValue({ ...row(), deliveryTargetId: null });
    await expect(processGoogleAdsEvent(job())).rejects.toThrow("target");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("only sends purchases", async () => {
    mocks.claim.mockResolvedValue({ action: "send", claim: { token: "claim" }, event: { ...event, eventName: "AddToCart" } });
    await expect(processGoogleAdsEvent(job())).rejects.toThrow("disabled");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each([{ marketing: false }, { saleOfData: false }])("blocks a later consent denial %j", async consent => {
    mocks.latest.mockResolvedValue({ consent });
    await expect(processGoogleAdsEvent(job())).rejects.toThrow("consent");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("blocks a purchase captured without marketing consent in strict mode", async () => {
    mocks.claim.mockResolvedValue({ action: "send", claim: { token: "claim" }, event: { ...event, consent: {} } });
    await expect(processGoogleAdsEvent(job())).rejects.toThrow("consent");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("fails closed and retries when consent storage is unavailable", async () => {
    mocks.latest.mockRejectedValue(new Error("Redis unavailable"));
    await expect(processGoogleAdsEvent(job())).rejects.toThrow();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.fail).toHaveBeenCalledWith(expect.objectContaining({ status: "RETRYING", outcome: "DEFINITELY_NOT_DELIVERED" }));
  });
  it("cannot revive expired identity from retained queue data", async () => {
    mocks.claim.mockResolvedValue({ action: "send", claim: { token: "claim" }, event: null });
    await expect(processGoogleAdsEvent(job())).rejects.toThrow("expired"); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not refresh old event timestamps on replay", async () => {
    mocks.row.mockResolvedValue({ ...row(), occurredAt: new Date(now - 61 * 86400000) });
    await expect(processGoogleAdsEvent(job())).rejects.toThrow("window"); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("fails a purchase Google could not match to anything", async () => {
    mocks.claim.mockResolvedValue({ action: "send", claim: { token: "claim" },
      event: { ...event, gclid: null, userData: {} } });
    await expect(processGoogleAdsEvent(job())).rejects.toThrow("No Google click ID or customer data");
    expect(mocks.fail).toHaveBeenCalledWith(expect.objectContaining({ status: "FAILED", nextRetryAt: null }));
  });
  it("respects canonical ownership", async () => {
    mocks.claim.mockResolvedValue({ action: "skip" }); await processGoogleAdsEvent(job()); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("keeps network timeouts ambiguous so a duplicate cannot claim ownership", async () => {
    mocks.send.mockRejectedValue(new Error("fetch failed"));
    await expect(processGoogleAdsEvent(job())).rejects.toThrow();
    expect(mocks.fail).toHaveBeenCalledWith(expect.objectContaining({ outcome: "DELIVERY_AMBIGUOUS", status: "RETRYING" }));
  });
  it("stops permission errors and schedules rate limits and missing setup for durable recovery", async () => {
    mocks.send.mockRejectedValueOnce(new GoogleAdsApiError("Google Ads conversion upload rejected (HTTP 403 PERMISSION_DENIED)", 403));
    await expect(processGoogleAdsEvent(job())).rejects.toThrow();
    expect(mocks.fail).toHaveBeenLastCalledWith(expect.objectContaining({ status: "FAILED", nextRetryAt: null }));
    mocks.send.mockRejectedValueOnce(new GoogleAdsApiError("Rate limited", 429, 3600000));
    await expect(processGoogleAdsEvent(job())).rejects.toThrow();
    expect(mocks.fail.mock.lastCall?.[0].nextRetryAt.getTime()).toBeGreaterThanOrEqual(now + 3600000);
    mocks.send.mockRejectedValueOnce(new GoogleAdsApiError("Track Clear's Google service account is not configured", 503));
    await expect(processGoogleAdsEvent(job())).rejects.toThrow();
    expect(mocks.fail).toHaveBeenLastCalledWith(expect.objectContaining({ status: "RETRYING", outcome: "DEFINITELY_NOT_DELIVERED" }));
  });
  it("never reports an accepted upload as failed if database settlement fails", async () => {
    mocks.complete.mockRejectedValue(new Error("DB unavailable"));
    await expect(processGoogleAdsEvent(job())).rejects.toThrow();
    expect(mocks.fail).not.toHaveBeenCalled();
  });
});
