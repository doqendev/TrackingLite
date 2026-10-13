import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), updateMany: vi.fn(), retrieve: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { eventLog: { findMany: mocks.findMany, updateMany: mocks.updateMany } } }));
vi.mock("@/lib/destinations/google-ads", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/destinations/google-ads")>(), retrieveGoogleAdsRequestStatus: mocks.retrieve }));
import { GoogleAdsApiError } from "@/lib/destinations/google-ads";
import {
  nextGoogleStatusCheckAt, pollGoogleAdsRequestStatuses, GOOGLE_STATUS_FIRST_CHECK_MS, GOOGLE_STATUS_MAX_INTERVAL_MS,
} from "@/lib/google-ads-request-status";

const now = new Date("2026-10-14T12:00:00Z");
const minutes = (count: number) => count * 60 * 1000;
const dueRow = (overrides: Record<string, unknown> = {}) => ({
  id: "row", destinationRequestId: "req-1", destinationStatusCheckedAt: null,
  destinationStatusNextCheckAt: new Date(now.getTime() - 1000), lastAttemptAt: new Date(now.getTime() - minutes(31)),
  createdAt: new Date(now.getTime() - minutes(32)), ...overrides,
});
const update = () => mocks.updateMany.mock.calls[0][0];

describe("Google Ads request status polling", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });
  it("backs off by 1.3x from 30 minutes up to one hour", () => {
    expect(nextGoogleStatusCheckAt(null, null, now).getTime() - now.getTime()).toBe(minutes(39));
    const checked = new Date(now.getTime() - minutes(39));
    expect(nextGoogleStatusCheckAt(checked, now, now).getTime() - now.getTime()).toBe(Math.round(minutes(39) * 1.3));
    const longAgo = new Date(now.getTime() - minutes(59));
    expect(nextGoogleStatusCheckAt(longAgo, now, now).getTime() - now.getTime()).toBe(GOOGLE_STATUS_MAX_INTERVAL_MS);
  });
  it("only asks for due Google rows that are still processing", async () => {
    mocks.findMany.mockResolvedValue([]);
    await pollGoogleAdsRequestStatuses(() => now);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { destination: "GOOGLE_ADS", destinationRequestStatus: "PROCESSING", destinationStatusNextCheckAt: { lte: now } },
      orderBy: { destinationStatusNextCheckAt: "asc" },
    }));
  });
  it.each(["SUCCESS", "PARTIAL_SUCCESS", "FAILED"] as const)("settles %s with safe counts only", async (status) => {
    mocks.findMany.mockResolvedValue([dueRow()]);
    mocks.retrieve.mockResolvedValue({ status, recordCount: 1, errors: status === "SUCCESS" ? [] : [{ reason: "INVALID_GCLID", recordCount: 1 }], warnings: [] });
    await expect(pollGoogleAdsRequestStatuses(() => now)).resolves.toMatchObject({ [status]: 1 });
    expect(update()).toEqual({
      where: { id: "row", destination: "GOOGLE_ADS", destinationRequestStatus: "PROCESSING" },
      data: { destinationRequestStatus: status, destinationStatusCheckedAt: now, destinationStatusNextCheckAt: null,
        destinationStatusDetail: { googleStatus: status, recordCount: 1, warnings: [],
          errors: status === "SUCCESS" ? [] : [{ reason: "INVALID_GCLID", recordCount: 1 }] } },
    });
  });
  it("keeps checking while Google is still processing", async () => {
    mocks.findMany.mockResolvedValue([dueRow()]);
    mocks.retrieve.mockResolvedValue({ status: "PROCESSING", recordCount: null, errors: [], warnings: [] });
    await pollGoogleAdsRequestStatuses(() => now);
    expect(update().data.destinationRequestStatus).toBe("PROCESSING");
    expect(update().data.destinationStatusNextCheckAt.getTime()).toBeGreaterThan(now.getTime() + GOOGLE_STATUS_FIRST_CHECK_MS);
  });
  it("keeps checking after a failed status call and records only the safe message", async () => {
    mocks.findMany.mockResolvedValue([dueRow()]);
    mocks.retrieve.mockRejectedValue(new GoogleAdsApiError("Google Ads status check rejected (HTTP 503)", 503));
    await pollGoogleAdsRequestStatuses(() => now);
    expect(update().data).toMatchObject({ destinationRequestStatus: "PROCESSING",
      destinationStatusDetail: { lastError: "Google Ads status check rejected (HTTP 503)" } });
    mocks.updateMany.mockClear();
    mocks.retrieve.mockRejectedValue(new Error("socket hang up with buyer@example.com"));
    await pollGoogleAdsRequestStatuses(() => now);
    expect(update().data.destinationStatusDetail).toEqual({ lastError: "Google Ads status check unavailable" });
  });
  it("stops after 24 hours without a final answer", async () => {
    mocks.findMany.mockResolvedValue([dueRow({ lastAttemptAt: new Date(now.getTime() - minutes(24 * 60)) })]);
    mocks.retrieve.mockResolvedValue({ status: "PROCESSING", recordCount: null, errors: [], warnings: [] });
    await expect(pollGoogleAdsRequestStatuses(() => now)).resolves.toMatchObject({ TIMED_OUT: 1 });
    expect(update().data).toMatchObject({ destinationRequestStatus: "TIMED_OUT", destinationStatusNextCheckAt: null });
  });
  it("keeps going when one row cannot be saved", async () => {
    mocks.findMany.mockResolvedValue([dueRow({ id: "a" }), dueRow({ id: "b" })]);
    mocks.retrieve.mockResolvedValue({ status: "SUCCESS", recordCount: 1, errors: [], warnings: [] });
    mocks.updateMany.mockRejectedValueOnce(new Error("DB unavailable")).mockResolvedValueOnce({ count: 1 });
    await expect(pollGoogleAdsRequestStatuses(() => now)).resolves.toMatchObject({ SUCCESS: 1 });
    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
  });
});
