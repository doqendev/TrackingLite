import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockHset = vi.fn();
const mockExpire = vi.fn();
const mockHgetall = vi.fn();

vi.mock("@/lib/redis", () => ({
  getSharedRedis: () => ({
    hset: (...args: unknown[]) => mockHset(...args),
    expire: (...args: unknown[]) => mockExpire(...args),
    hgetall: (...args: unknown[]) => mockHgetall(...args),
  }),
}));

import {
  lookupSessionContextByIdentifiers,
  storeSessionContextForIdentifiers,
} from "@/lib/session-enrichment";

describe("session-enrichment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-22T12:00:00.000Z"));
    mockHset.mockResolvedValue(1);
    mockExpire.mockResolvedValue(1);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores context under session, checkout, cart, order, and email identifiers", async () => {
    storeSessionContextForIdentifiers(
      "ws_123",
      {
        email: "buyer@example.com",
        trackclearSessionId: "tc-session-123",
        checkoutToken: "checkout-token-123",
        cartToken: "cart-token-123",
        orderId: "1001",
      },
      {
        fbp: "fb.1.1700000000000.1234567890",
        gbraid: "GBRAID123",
        consent: { analyticsAllowed: true, marketingAllowed: false },
      }
    );

    await Promise.resolve();

    expect(mockHset).toHaveBeenCalledTimes(5);
    expect(mockHset.mock.calls.map((call) => String(call[0]))).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^sess:ws_123:trackclearSessionId:/),
        expect.stringMatching(/^sess:ws_123:checkoutToken:/),
        expect.stringMatching(/^sess:ws_123:cartToken:/),
        expect.stringMatching(/^sess:ws_123:orderId:/),
        expect.stringMatching(/^sess:ws_123:[a-f0-9]{64}$/),
      ])
    );
    expect(mockHset.mock.calls[0][1]).toMatchObject({
      fbp: "fb.1.1700000000000.1234567890",
      gbraid: "GBRAID123",
      "consent:analytics": "true",
      "consent:marketing": "false",
    });
  });

  it("looks up context by TrackClear session ID and keeps fresh fields", async () => {
    const now = Date.now();
    mockHgetall.mockResolvedValueOnce({
      fbp: "fb.1.1700000000000.1234567890",
      "ts:fbp": String(now),
      gbraid: "GBRAID123",
      "ts:gbraid": String(now),
      "consent:analytics": "true",
      "ts:consent:analytics": String(now),
    });

    const context = await lookupSessionContextByIdentifiers("ws_123", {
      trackclearSessionId: "tc-session-123",
    });

    expect(context).toMatchObject({
      fbp: "fb.1.1700000000000.1234567890",
      gbraid: "GBRAID123",
      consent: { analytics: true },
      fieldsEnriched: expect.arrayContaining(["fbp", "gbraid", "consent:analytics"]),
    });
  });
});
