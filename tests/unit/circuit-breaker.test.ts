import { beforeEach, describe, expect, it, vi } from "vitest";

const redisMocks = vi.hoisted(() => ({
  get: vi.fn(),
  del: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
  setex: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  getSharedRedis: () => redisMocks,
}));

import {
  CircuitOpenError,
  isCircuitClosed,
  recordFailure,
  recordSuccess,
  shouldRecordCircuitFailure,
  shouldRetryDeliveryFailure,
} from "@/lib/circuit-breaker";

describe("workspace-scoped circuit breaker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.get.mockResolvedValue(null);
    redisMocks.del.mockResolvedValue(2);
    redisMocks.expire.mockResolvedValue(1);
    redisMocks.setex.mockResolvedValue("OK");
  });

  it("isolates open and success keys by workspace and destination", async () => {
    await expect(isCircuitClosed("META", "ws-a")).resolves.toBe(true);
    await expect(isCircuitClosed("META", "ws-b")).resolves.toBe(true);
    await recordSuccess("META", "ws-a");

    expect(redisMocks.get).toHaveBeenNthCalledWith(1, "cb:open:META:ws-a");
    expect(redisMocks.get).toHaveBeenNthCalledWith(2, "cb:open:META:ws-b");
    expect(redisMocks.del).toHaveBeenCalledWith(
      "cb:fails:META:ws-a",
      "cb:open:META:ws-a"
    );
  });

  it("opens only the failing workspace after five upstream failures", async () => {
    let count = 0;
    redisMocks.incr.mockImplementation(async () => ++count);

    for (let attempt = 0; attempt < 5; attempt++) {
      await recordFailure("META", "ws-a");
    }

    expect(redisMocks.incr).toHaveBeenCalledTimes(5);
    expect(redisMocks.incr).toHaveBeenCalledWith("cb:fails:META:ws-a");
    expect(redisMocks.setex).toHaveBeenCalledTimes(1);
    expect(redisMocks.setex).toHaveBeenCalledWith("cb:open:META:ws-a", 60, "1");
  });
});

describe("circuit failure classification", () => {
  it.each([408, 425, 429, 500, 503])("counts transient HTTP %s", (statusCode) => {
    expect(shouldRecordCircuitFailure({ statusCode })).toBe(true);
  });

  it.each([400, 401, 403, 404, 422])("does not count tenant HTTP %s", (statusCode) => {
    expect(shouldRecordCircuitFailure({ statusCode })).toBe(false);
  });

  it("counts nested network failures but not local configuration failures", () => {
    expect(
      shouldRecordCircuitFailure({ message: "fetch failed", cause: { code: "ECONNRESET" } })
    ).toBe(true);
    expect(shouldRecordCircuitFailure(new Error("Invalid auth tag"))).toBe(false);
    expect(shouldRecordCircuitFailure(new CircuitOpenError("META", "ws-a"))).toBe(false);
  });

  it("retries an open circuit without counting it as another upstream failure", () => {
    const error = new CircuitOpenError("META", "ws-a");
    expect(shouldRecordCircuitFailure(error)).toBe(false);
    expect(shouldRetryDeliveryFailure(error)).toBe(true);
    expect(shouldRetryDeliveryFailure(new Error("Invalid auth tag"))).toBe(false);
  });

  it("retries DB ownership failures without poisoning a destination circuit", () => {
    const error = new Error("Unable to establish durable delivery ownership");
    error.name = "EventDeliveryOwnershipError";

    expect(shouldRecordCircuitFailure(error)).toBe(false);
    expect(shouldRetryDeliveryFailure(error)).toBe(true);
  });
});
