import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockHgetall = vi.fn();
const mockEval = vi.fn();

vi.mock("@/lib/redis", () => ({
  getSharedRedis: () => {
    return {
      eval: (...args: unknown[]) => mockEval(...args),
      hgetall: (...args: unknown[]) => mockHgetall(...args),
    };
  },
}));

import {
  clearSessionContextForIdentifiers,
  lookupSessionContextByIdentifiers,
  storeSessionContextForIdentifiers,
} from "@/lib/session-enrichment";

describe("session-enrichment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-22T12:00:00.000Z"));
    mockEval.mockResolvedValue(1);
    mockHgetall.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores context under session, checkout, cart, order, and email identifiers", async () => {
    await storeSessionContextForIdentifiers(
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
        ttp: "ttp-cookie-123",
        gbraid: "GBRAID123",
        attributionTimestamp: Date.now() - 60_000,
        attributionSource: "meta",
        observedAt: Date.now(),
        consent: { analyticsAllowed: true, marketingAllowed: true },
      }
    );

    expect(mockEval).toHaveBeenCalledTimes(5);
    expect(mockEval.mock.calls.map((call) => String(call[2]))).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^sess:ws_123:trackclearSessionId:/),
        expect.stringMatching(/^sess:ws_123:checkoutToken:/),
        expect.stringMatching(/^sess:ws_123:cartToken:/),
        expect.stringMatching(/^sess:ws_123:orderId:/),
        expect.stringMatching(/^sess:ws_123:[a-f0-9]{64}$/),
      ])
    );
    const stored = JSON.parse(String(mockEval.mock.calls[0][3]));
    expect(stored).toMatchObject({
      fbp: { value: "fb.1.1700000000000.1234567890", timestamp: Date.now() },
      ttp: { value: "ttp-cookie-123", timestamp: Date.now() },
      gbraid: { value: "GBRAID123", timestamp: Date.now() - 60_000 },
      attributionTimestamp: {
        value: String(Date.now() - 60_000),
        timestamp: Date.now() - 60_000,
      },
      attributionSource: { value: "meta", timestamp: Date.now() - 60_000 },
      "consent:analytics": { value: "true", timestamp: Date.now() },
      "consent:marketing": { value: "true", timestamp: Date.now() },
    });
    expect(mockEval.mock.calls[0][4]).toBe(String(30 * 24 * 60 * 60));
    const aliases = JSON.parse(String(mockEval.mock.calls[0][5]));
    expect(aliases).toHaveLength(5);
    expect(String(mockEval.mock.calls[0][0])).toContain('"alias:" .. alias');
    expect(String(mockEval.mock.calls[0][0])).toContain("table.sort(aliasEntries");
    expect(mockEval.mock.calls[0][7]).toBe("24");
  });

  it("does not refresh click attribution when a later event repeats an old touch", async () => {
    const oldTouch = Date.now() - 10 * 24 * 60 * 60 * 1000;

    await storeSessionContextForIdentifiers(
      "ws_123",
      { trackclearSessionId: "tc-session-123" },
      {
        ttclid: "old-click",
        utmCampaign: "old-campaign",
        attributionTimestamp: oldTouch,
        attributionSource: "tiktok",
        observedAt: Date.now(),
      }
    );

    const stored = JSON.parse(String(mockEval.mock.calls[0][3]));
    expect(stored.ttclid.timestamp).toBe(oldTouch);
    expect(stored.utmCampaign.timestamp).toBe(oldTouch);
    expect(stored.attributionTimestamp.timestamp).toBe(oldTouch);
    expect(String(mockEval.mock.calls[0][0])).toContain("incoming >= existing");
  });

  it("writes ordered consent tombstones so stale denials cannot erase newer fields", async () => {
    const denialAt = Date.now() - 60_000;

    await clearSessionContextForIdentifiers(
      "ws_123",
      { trackclearSessionId: "tc-session-123", email: "buyer@example.com" },
      { marketing: true, shared: true, observedAt: denialAt }
    );

    expect(mockEval).toHaveBeenCalledTimes(1);
    expect(mockEval.mock.calls[0][1]).toBe(2);
    const categories = JSON.parse(String(mockEval.mock.calls[0][4]));
    expect(categories).toEqual(expect.arrayContaining([
      expect.objectContaining({
        tombstone: "cleared:marketing",
        timestamp: denialAt,
        consentField: "consent:marketing",
      }),
      expect.objectContaining({ tombstone: "cleared:shared", timestamp: denialAt }),
    ]));
    expect(String(mockEval.mock.calls[0][0])).toContain("fieldTimestamp <= incoming");
    expect(String(mockEval.mock.calls[0][0])).toContain('category.consentField, "false"');
  });

  it("fails closed when any linked consent-revocation write fails", async () => {
    mockEval.mockRejectedValueOnce(new Error("redis unavailable"));

    await expect(
      clearSessionContextForIdentifiers(
        "ws_123",
        { trackclearSessionId: "tc-session-123", email: "buyer@example.com" },
        { marketing: true, analytics: true, shared: true, observedAt: Date.now() }
      )
    ).rejects.toThrow("redis unavailable");
    expect(mockEval).toHaveBeenCalledTimes(1);
  });

  it("keeps ordinary non-revocation enrichment best-effort during Redis failure", async () => {
    mockEval.mockRejectedValueOnce(new Error("redis unavailable"));

    await expect(
      storeSessionContextForIdentifiers(
        "ws_123",
        { trackclearSessionId: "tc-session-123" },
        { fbp: "fb.1.1700000000000.1234567890", observedAt: Date.now() }
      )
    ).resolves.toBeUndefined();
  });

  it("propagates denial tombstones to a previously linked email key without receiving PII again", async () => {
    await storeSessionContextForIdentifiers(
      "ws_123",
      {
        trackclearSessionId: "tc-session-123",
        email: "buyer@example.com",
      },
      {
        fbp: "fb.1.1700000000000.1234567890",
        observedAt: Date.now() - 60_000,
      }
    );
    const storedKeys = mockEval.mock.calls.map((call) => String(call[2]));
    const sessionKey = storedKeys.find((key) => key.includes(":trackclearSessionId:"));
    const emailKey = storedKeys.find((key) => /^sess:ws_123:[a-f0-9]{64}$/.test(key));
    expect(sessionKey).toBeDefined();
    expect(emailKey).toBeDefined();

    mockEval.mockClear();
    mockHgetall.mockImplementation(async (key: string) =>
      key === sessionKey ? { [`alias:${emailKey}`]: "1" } : {}
    );

    await clearSessionContextForIdentifiers(
      "ws_123",
      { trackclearSessionId: "tc-session-123" },
      { marketing: true, observedAt: Date.now() }
    );

    expect(mockEval).toHaveBeenCalledTimes(1);
    expect(mockEval.mock.calls[0].slice(2, 4).map(String)).toEqual(
      expect.arrayContaining([sessionKey, emailKey])
    );
  });

  it("follows a linked tombstone when webhook lookup has only the older email alias", async () => {
    const now = Date.now();
    const emailKey = "sess:ws_123:" + "a".repeat(64);
    const sessionKey = "sess:ws_123:trackclearSessionId:" + "b".repeat(64);
    mockHgetall.mockImplementation(async (key: string) => {
      if (key === sessionKey) {
        return {
          "cleared:marketing": String(now),
          "ts:cleared:marketing": String(now),
        };
      }
      return {
        fbp: "fb.1.1700000000000.1234567890",
        "ts:fbp": String(now - 60_000),
        [`alias:${sessionKey}`]: "1",
      };
    });

    // Replace the actual hashed email key with the same linked data returned by
    // the mock; only the linked session key is special-cased above.
    const context = await lookupSessionContextByIdentifiers("ws_123", {
      email: "buyer@example.com",
    });

    expect(context).toBeNull();
    expect(mockHgetall).toHaveBeenCalledWith(sessionKey);
    expect(emailKey).not.toBe(sessionKey);
  });

  it("does not resurrect an older identifier through a second session key after denial", async () => {
    const now = Date.now();
    mockHgetall
      .mockResolvedValueOnce({
        fbp: "fb.1.1700000000000.1234567890",
        "ts:fbp": String(now - 60_000),
      })
      .mockResolvedValueOnce({
        "cleared:marketing": String(now),
        "ts:cleared:marketing": String(now),
      });

    const context = await lookupSessionContextByIdentifiers("ws_123", {
      trackclearSessionId: "tc-session-123",
      email: "buyer@example.com",
    });

    expect(context).toBeNull();
  });

  it("looks up context by TrackClear session ID and keeps fresh fields", async () => {
    const now = Date.now();
    mockHgetall.mockResolvedValueOnce({
      fbp: "fb.1.1700000000000.1234567890",
      "ts:fbp": String(now),
      gbraid: "GBRAID123",
      "ts:gbraid": String(now),
      ttp: "ttp-cookie-123",
      "ts:ttp": String(now),
      attributionTimestamp: String(now - 60_000),
      "ts:attributionTimestamp": String(now - 60_000),
      attributionSource: "tiktok",
      "ts:attributionSource": String(now - 60_000),
      "consent:analytics": "true",
      "ts:consent:analytics": String(now),
    });

    const context = await lookupSessionContextByIdentifiers("ws_123", {
      trackclearSessionId: "tc-session-123",
    });

    expect(context).toMatchObject({
      fbp: "fb.1.1700000000000.1234567890",
      gbraid: "GBRAID123",
      ttp: "ttp-cookie-123",
      attributionTimestamp: now - 60_000,
      attributionSource: "tiktok",
      consent: { analytics: true },
      fieldsEnriched: expect.arrayContaining(["fbp", "gbraid", "ttp", "consent:analytics"]),
    });
  });

  it("keeps an explicit denial authoritative for the full 30-day context window", async () => {
    const now = Date.now();
    const denialAt = now - 29 * 24 * 60 * 60 * 1000;
    mockHgetall.mockResolvedValueOnce({
      "consent:marketing": "false",
      "ts:consent:marketing": String(denialAt),
    });

    const context = await lookupSessionContextByIdentifiers("ws_123", {
      trackclearSessionId: "tc-session-123",
    });

    expect(context).toMatchObject({
      consent: { marketing: false },
      consentTimestamps: { marketing: denialAt },
    });
  });

  it("expires attribution metadata from the actual touch time instead of receipt time", async () => {
    const now = Date.now();
    const staleTouch = now - 31 * 24 * 60 * 60 * 1000;
    mockHgetall.mockResolvedValueOnce({
      attributionTimestamp: String(staleTouch),
      "ts:attributionTimestamp": String(staleTouch),
      attributionSource: "meta",
      "ts:attributionSource": String(staleTouch),
      fbp: "fb.1.1700000000000.1234567890",
      "ts:fbp": String(now),
    });

    const context = await lookupSessionContextByIdentifiers("ws_123", {
      trackclearSessionId: "tc-session-123",
    });

    expect(context?.fbp).toBe("fb.1.1700000000000.1234567890");
    expect(context?.attributionTimestamp).toBeUndefined();
    expect(context?.attributionSource).toBeUndefined();
  });

  it("keeps delayed-checkout click IDs while expiring stale IP and consent", async () => {
    const now = Date.now();
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;
    const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;
    mockHgetall.mockResolvedValueOnce({
      fbc: "fb.1.1700000000000.click-123",
      "ts:fbc": String(tenDaysAgo),
      ttp: "ttp-cookie-123",
      "ts:ttp": String(tenDaysAgo),
      clientIp: "203.0.113.10",
      "ts:clientIp": String(tenDaysAgo),
      "consent:marketing": "true",
      "ts:consent:marketing": String(twoDaysAgo),
    });

    const context = await lookupSessionContextByIdentifiers("ws_123", {
      trackclearSessionId: "tc-session-123",
    });

    expect(context).toMatchObject({
      fbc: "fb.1.1700000000000.click-123",
      ttp: "ttp-cookie-123",
    });
    expect(context?.clientIp).toBeUndefined();
    expect(context?.consent).toBeUndefined();
  });
});
