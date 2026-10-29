import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, generateKeyPairSync } from "node:crypto";
import {
  buildGoogleAdsIngestRequest, googleAdIdentifiers, googleAdsDeliveryTargetId, googleAdsTargetForWorkspace,
  googleAdsUploadNotBefore, googleUserIdentifiers, normalizeEmailForGoogle, normalizeGoogleAdsConversionActionId,
  normalizeGoogleAdsCustomerId, normalizePhoneForGoogle, normalizeToGoogleAdsEvent, retrieveGoogleAdsRequestStatus,
  sendToGoogleAds, toGoogleConversionValue, GOOGLE_CLICK_TTL_MS, GoogleAdsApiError,
} from "@/lib/destinations/google-ads";
import { resetGoogleDataManagerAuthCache } from "@/lib/google-data-manager-auth";
import type { DestinationEventJob } from "@/lib/queue";

const now = Date.UTC(2026, 9, 14, 12, 0, 0);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const event = (overrides: Partial<DestinationEventJob["event"]> = {}): DestinationEventJob["event"] => ({
  eventName: "Purchase", eventId: "shopify-purchase:store:123", timestamp: now,
  url: "https://shop.example/thank-you", referrer: "", clientIp: "203.0.113.1", userAgent: "test",
  userData: { email: "Buyer@Example.com" }, customData: { currency: "EUR", value: "39.99", order_id: "#5530" },
  ...overrides,
});

describe("Google Ads identifiers", () => {
  it.each([["123-456-7890", "1234567890"], [" 1234567890 ", "1234567890"], ["123456789", null], ["12345678901", null],
    ["abc-def-ghij", null], [1234567890, null]])("normalizes customer ID %j", (input, expected) => {
    expect(normalizeGoogleAdsCustomerId(input)).toBe(expected);
  });
  it.each([["987654321", "987654321"], ["0123", null], ["12a", null], ["9223372036854775807", "9223372036854775807"],
    ["9223372036854775808", null], ["", null]])("normalizes conversion action ID %j", (input, expected) => {
    expect(normalizeGoogleAdsConversionActionId(input)).toBe(expected);
  });
  it("targets one account and conversion action", () => {
    expect(googleAdsDeliveryTargetId("1234567890", "987")).toBe("1234567890:987");
    expect(googleAdsTargetForWorkspace({ googleAdsCustomerId: "123-456-7890", googleAdsConversionActionId: "987" }))
      .toBe("1234567890:987");
    expect(googleAdsTargetForWorkspace({ googleAdsCustomerId: "1234567890", googleAdsConversionActionId: null })).toBeNull();
  });
});

describe("Google Ads customer data formatting", () => {
  it.each([
    [" Jane.Doe+shop@GMAIL.com ", "janedoe@gmail.com"],
    ["j.a.n.e@googlemail.com", "jane@googlemail.com"],
    ["Jane.Doe+shop@example.com", "jane.doe+shop@example.com"],
    ["not-an-email", null], ["@example.com", null], ["+@gmail.com", null],
  ])("applies Google's email rule to %j", (input, expected) => {
    expect(normalizeEmailForGoogle(input)).toBe(expected);
  });
  it("formats phones as E.164 with the plus, using the order country only for national numbers", () => {
    expect(normalizePhoneForGoogle("+1 (415) 555-2671", null)).toBe("+14155552671");
    expect(normalizePhoneForGoogle("020 7946 0958", "GB")).toBe("+442079460958");
    expect(normalizePhoneForGoogle("0044 20 7946 0958", "PT")).toBe("+442079460958");
    expect(normalizePhoneForGoogle("4155552671", null)).toBeNull();
    expect(normalizePhoneForGoogle("call me", "US")).toBeNull();
  });
  it("hashes email, phone and names but keeps country and postal code plain", () => {
    const identifiers = googleUserIdentifiers({ email: "A@B.com", phone: "912 345 678", countryCode: "pt",
      firstName: " Maria  José ", lastName: "Silva", zip: "1000-001" });
    expect(identifiers).toEqual([
      { emailAddress: hash("a@b.com") },
      { phoneNumber: hash("+351912345678") },
      { address: { givenName: hash("maria josé"), familyName: hash("silva"), regionCode: "PT", postalCode: "1000-001" } },
    ]);
  });
  it("sends an address only when all four fields are present", () => {
    expect(googleUserIdentifiers({ firstName: "Ann", lastName: "Lee", countryCode: "US" })).toEqual([]);
    expect(googleUserIdentifiers({ firstName: "Ann", countryCode: "US", zip: "10001" })).toEqual([]);
  });
});

describe("Google Ads purchase event", () => {
  it.each([["39.99", "EUR", 39.99], ["4200", "JPY", 4200], [12.5, "USD", 12.5], ["1.2345", "KWD", 1.2345]])(
    "keeps the value %j %s in currency units", (value, currency, expected) => {
      expect(toGoogleConversionValue(value, currency)).toBe(expected);
    });
  it.each([["1", "ZZZ"], ["NaN", "EUR"], ["-1", "EUR"], [null, "EUR"]])("rejects invalid money %j %s", (value, currency) => {
    expect(() => toGoogleConversionValue(value, currency)).toThrow(GoogleAdsApiError);
  });
  it("builds a purchase with the order as transaction ID and the original time", () => {
    const result = normalizeToGoogleAdsEvent(event({ gclid: "Cj0KCQ-abc_123", timestamp: now - 3600000 }), now);
    expect(result).toEqual({
      transactionId: "#5530",
      eventTimestamp: new Date(now - 3600000).toISOString(),
      eventSource: "WEB",
      conversionValue: 39.99,
      currency: "EUR",
      adIdentifiers: { gclid: "Cj0KCQ-abc_123" },
      userData: { userIdentifiers: [{ emailAddress: hash("buyer@example.com") }] },
    });
  });
  it("prefers gclid, then gbraid, then wbraid, and drops clicks older than 90 days", () => {
    expect(googleAdIdentifiers({ gclid: "g", gbraid: "b", wbraid: "w" }, now)).toEqual({ gclid: "g" });
    expect(googleAdIdentifiers({ gbraid: "b", wbraid: "w" }, now)).toEqual({ gbraid: "b" });
    expect(googleAdIdentifiers({ wbraid: "w" }, now)).toEqual({ wbraid: "w" });
    expect(googleAdIdentifiers({ gclid: "g", googleClickCapturedAt: now - GOOGLE_CLICK_TTL_MS + 1000 }, now)).toEqual({ gclid: "g" });
    expect(googleAdIdentifiers({ gclid: "g", googleClickCapturedAt: now - GOOGLE_CLICK_TTL_MS }, now)).toBeUndefined();
    expect(googleAdIdentifiers({ gclid: "bad value<script>" }, now)).toBeUndefined();
  });
  it("uploads no earlier than six hours after the purchase, when Google accepts its click", () => {
    const purchase = new Date("2026-10-29T10:00:00.000Z");
    expect(googleAdsUploadNotBefore(purchase).toISOString()).toBe("2026-10-29T16:15:00.000Z");
  });
  it("still sends a customer-matched purchase without a click, but not an anonymous one", () => {
    expect(normalizeToGoogleAdsEvent(event(), now)).not.toHaveProperty("adIdentifiers");
    expect(() => normalizeToGoogleAdsEvent(event({ userData: {} }), now)).toThrow("No Google click ID or customer data");
  });
  it("falls back to the event ID when the order ID is unusable", () => {
    expect(normalizeToGoogleAdsEvent(event({ customData: { value: "1", currency: "EUR", order_id: "x".repeat(65) } }), now)
      .transactionId).toBe("shopify-purchase:store:123");
  });
  it("rejects non-purchases and events outside the delivery window", () => {
    for (const override of [{ eventName: "AddToCart" }, { eventName: "PageView" }, { timestamp: now - 61 * 86400000 },
      { timestamp: now + 600001 }, { timestamp: now + 0.5 }]) {
      expect(() => normalizeToGoogleAdsEvent(event(override), now)).toThrow(GoogleAdsApiError);
    }
  });
});

describe("Google Ads ingest request", () => {
  const normalized = () => normalizeToGoogleAdsEvent(event({ gclid: "g" }), now);
  it("targets the operating account and conversion action with hashed hex encoding", () => {
    const request = buildGoogleAdsIngestRequest({ customerId: "1234567890", conversionActionId: "987" }, normalized(),
      { marketingAllowed: true, saleOfDataAllowed: true });
    expect(request).toEqual({
      destinations: [{ operatingAccount: { accountType: "GOOGLE_ADS", accountId: "1234567890" }, productDestinationId: "987" }],
      encoding: "HEX",
      consent: { adUserData: "CONSENT_GRANTED", adPersonalization: "CONSENT_GRANTED" },
      validateOnly: false,
      events: [normalized()],
    });
  });
  it("adds a manager login account only when it differs from the operating account", () => {
    const viaManager = buildGoogleAdsIngestRequest({ customerId: "1234567890", conversionActionId: "987",
      loginCustomerId: "1111111111" }, normalized(), undefined);
    expect(viaManager.destinations[0].loginAccount).toEqual({ accountType: "GOOGLE_ADS", accountId: "1111111111" });
    const direct = buildGoogleAdsIngestRequest({ customerId: "1234567890", conversionActionId: "987",
      loginCustomerId: "1234567890" }, normalized(), undefined);
    expect(direct.destinations[0]).not.toHaveProperty("loginAccount");
  });
  it("maps consent: unknown is omitted, a sale-of-data opt-out denies personalization", () => {
    expect(buildGoogleAdsIngestRequest({ customerId: "1234567890", conversionActionId: "987" }, normalized(), {}))
      .not.toHaveProperty("consent");
    expect(buildGoogleAdsIngestRequest({ customerId: "1234567890", conversionActionId: "987" }, normalized(),
      { marketingAllowed: true, saleOfDataAllowed: false }).consent)
      .toEqual({ adUserData: "CONSENT_GRANTED", adPersonalization: "CONSENT_DENIED" });
  });
});

describe("Google Data Manager API calls", () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const key = JSON.stringify({ type: "service_account", client_email: "trackclear@project.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), private_key_id: "kid",
    token_uri: "https://oauth2.googleapis.com/token" });
  const tokenResponse = () => new Response(JSON.stringify({ access_token: "token-1", expires_in: 3600 }), { status: 200 });
  const request = () => buildGoogleAdsIngestRequest({ customerId: "1234567890", conversionActionId: "987" },
    normalizeToGoogleAdsEvent(event({ gclid: "g" }), now), { marketingAllowed: true });

  beforeEach(() => {
    resetGoogleDataManagerAuthCache();
    vi.stubEnv("GOOGLE_DATA_MANAGER_SERVICE_ACCOUNT_KEY", key);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("uploads with a service-account bearer token and returns the request ID", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ requestId: "req-1", fieldWarnings: [{}] }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await expect(sendToGoogleAds(request())).resolves.toEqual({
      accepted: true, validated: false, status: 200, requestId: "req-1", fieldWarnings: 1 });
    const [url, init] = fetch.mock.calls[1];
    expect(url).toBe("https://datamanager.googleapis.com/v1/events:ingest");
    expect(init.headers.Authorization).toBe("Bearer token-1");
    expect(JSON.parse(init.body)).toEqual(request());
  });
  it("reuses the token across uploads", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(tokenResponse())
      .mockImplementation(async () => new Response(JSON.stringify({ requestId: "req" }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await sendToGoogleAds(request());
    await sendToGoogleAds(request());
    expect(fetch.mock.calls.filter(([url]) => String(url).includes("oauth2"))).toHaveLength(1);
  });
  it("validates without recording", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response("{}", { status: 200 })));
    await expect(sendToGoogleAds({ ...request(), validateOnly: true }))
      .resolves.toMatchObject({ accepted: false, validated: true, requestId: null });
  });
  it("treats an accepted upload without a request ID as retryable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response("{}", { status: 200 })));
    await expect(sendToGoogleAds(request())).rejects.toMatchObject({ statusCode: 502 });
  });
  it("keeps only the status and Google's reason code from errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(new Response(
      JSON.stringify({ error: { status: "PERMISSION_DENIED", message: "buyer@example.com cannot" } }), { status: 403 })));
    const error = await sendToGoogleAds(request()).catch((caught) => caught);
    expect(error).toBeInstanceOf(GoogleAdsApiError);
    expect(error.statusCode).toBe(403);
    expect(error.message).toBe("Google Ads conversion upload rejected (HTTP 403 PERMISSION_DENIED)");
    expect(error.message).not.toContain("buyer");
  });
  it("honors Retry-After on rate limits", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "retry-after": "120" } })));
    await expect(sendToGoogleAds(request())).rejects.toMatchObject({ statusCode: 429, retryAfterMs: 120000 });
  });
  it("fails as retryable when the deployment has no service account", async () => {
    vi.stubEnv("GOOGLE_DATA_MANAGER_SERVICE_ACCOUNT_KEY", "");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(sendToGoogleAds(request())).rejects.toMatchObject({ statusCode: 503 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("reads processing status as enum reasons and counts only", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(new Response(JSON.stringify({
      requestStatusPerDestination: [{
        requestStatus: "PARTIAL_SUCCESS",
        eventsIngestionStatus: { recordCount: "3" },
        errorInfo: { errorCounts: [{ recordCount: "1", reason: "INVALID_GCLID" }, { reason: "lower case <b>", recordCount: "9" }] },
        warningInfo: { warningCounts: [{ recordCount: "2", reason: "EXPIRED_EVENT" }] },
      }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await expect(retrieveGoogleAdsRequestStatus("req/1")).resolves.toEqual({
      status: "PARTIAL_SUCCESS", recordCount: 3,
      errors: [{ reason: "INVALID_GCLID", recordCount: 1 }],
      warnings: [{ reason: "EXPIRED_EVENT", recordCount: 2 }],
    });
    expect(fetch.mock.calls[1][0]).toBe("https://datamanager.googleapis.com/v1/requestStatus:retrieve?requestId=req%2F1");
  });
  it("reports an unknown status as UNKNOWN", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ requestStatusPerDestination: [{ requestStatus: "REQUEST_STATUS_UNKNOWN" }] }), { status: 200 })));
    await expect(retrieveGoogleAdsRequestStatus("req")).resolves.toMatchObject({ status: "UNKNOWN", recordCount: null });
  });
});
