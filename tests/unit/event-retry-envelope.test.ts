import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearedEventRetryEnvelope,
  decryptEventRetryEnvelope,
  encryptEventRetryEnvelope,
  type EventRetryEnvelope,
} from "@/lib/event-retry-envelope";

const TEST_KEY = "0".repeat(64);

const envelope: EventRetryEnvelope = {
  version: 1,
  event: {
    eventName: "Purchase",
    eventId: "shopify-purchase:ws_1:1001",
    timestamp: 1_700_000_000_000,
    url: "https://example.com/checkouts/1",
    referrer: "",
    fbp: "fb.1.1700000000000.123",
    fbc: "fb.1.1700000000000.CLICK",
    ttclid: "TT-CLICK",
    ttp: "tt.1.1700000000000.abc",
    userData: { email: "buyer@example.com" },
    customData: { value: 99, currency: "EUR" },
    clientIp: "203.0.113.10",
    userAgent: "Browser/1.0",
  },
};

describe("event retry envelope", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it("round-trips full matching data only while the envelope is fresh", () => {
    const createdAt = new Date("2026-07-27T12:00:00.000Z");
    const stored = encryptEventRetryEnvelope(envelope, createdAt);

    expect(stored.retryPayloadEncrypted).not.toContain("buyer@example.com");
    expect(decryptEventRetryEnvelope(stored, new Date("2026-07-28T12:00:00.000Z"))).toEqual(envelope);
    expect(decryptEventRetryEnvelope(stored, new Date("2026-07-31T12:00:00.000Z"))).toBeNull();
  });

  it("fails closed for corrupt ciphertext", () => {
    const stored = encryptEventRetryEnvelope(envelope);
    expect(
      decryptEventRetryEnvelope({ ...stored, retryPayloadEncrypted: `${stored.retryPayloadEncrypted}00` })
    ).toBeNull();
  });

  it("provides a complete clearing update", () => {
    expect(clearedEventRetryEnvelope()).toEqual({
      retryPayloadEncrypted: null,
      retryPayloadIv: null,
      retryPayloadTag: null,
      retryPayloadExpiresAt: null,
    });
  });
});
