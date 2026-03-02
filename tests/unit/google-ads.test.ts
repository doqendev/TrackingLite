import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  normalizeEmailForGoogle,
  normalizeToGoogleAdsParams,
  sendToGoogleAds,
  GoogleAdsApiError,
} from "@/lib/destinations/google-ads";

// ---------------------------------------------------------------------------
// normalizeEmailForGoogle
// ---------------------------------------------------------------------------
describe("normalizeEmailForGoogle", () => {
  it("returns undefined for null/undefined/empty", () => {
    expect(normalizeEmailForGoogle(null)).toBeUndefined();
    expect(normalizeEmailForGoogle(undefined)).toBeUndefined();
    expect(normalizeEmailForGoogle("")).toBeUndefined();
    expect(normalizeEmailForGoogle("   ")).toBeUndefined();
  });

  it("lowercases and trims", () => {
    expect(normalizeEmailForGoogle("  Alice@Example.COM  ")).toBe(
      "alice@example.com"
    );
  });

  it("strips dots from Gmail local part", () => {
    expect(normalizeEmailForGoogle("john.doe@gmail.com")).toBe(
      "johndoe@gmail.com"
    );
  });

  it("strips +suffix from Gmail local part", () => {
    expect(normalizeEmailForGoogle("user+promo@gmail.com")).toBe(
      "user@gmail.com"
    );
  });

  it("strips dots AND +suffix from Gmail", () => {
    expect(normalizeEmailForGoogle("j.o.h.n+news@gmail.com")).toBe(
      "john@gmail.com"
    );
  });

  it("strips dots from googlemail.com", () => {
    expect(normalizeEmailForGoogle("a.b.c@googlemail.com")).toBe(
      "abc@googlemail.com"
    );
  });

  it("does NOT strip dots from non-Gmail domains", () => {
    expect(normalizeEmailForGoogle("first.last@outlook.com")).toBe(
      "first.last@outlook.com"
    );
  });

  it("does NOT strip +suffix from non-Gmail domains", () => {
    expect(normalizeEmailForGoogle("user+tag@yahoo.com")).toBe(
      "user+tag@yahoo.com"
    );
  });

  it("handles email without @ sign", () => {
    expect(normalizeEmailForGoogle("notanemail")).toBe("notanemail");
  });
});

// ---------------------------------------------------------------------------
// normalizeToGoogleAdsParams
// ---------------------------------------------------------------------------
const BASE_EVENT_DATA = {
  eventId: "evt-001",
  timestamp: 1700000000000,
  url: "https://shop.example.com/product/123",
  referrer: "https://google.com",
  userData: {
    email: "buyer@gmail.com",
    phone: "+15551234567",
    firstName: "John",
    lastName: "Doe",
    countryCode: "US",
  } as Record<string, unknown>,
  customData: {
    value: 49.99,
    currency: "USD",
    orderId: "ORD-1001",
  } as Record<string, unknown>,
  clientIp: "1.2.3.4",
  userAgent: "Mozilla/5.0",
  gclid: "test-gclid-abc",
};

const BASE_CONFIG = {
  googleAdsConversionId: "1234567890",
  googleAdsLabelPurchase: "PurchaseLabel",
  googleAdsLabelAddToCart: "CartLabel",
  googleAdsLabelInitiateCheckout: "CheckoutLabel",
  googleAdsLabelViewContent: "ViewLabel",
};

describe("normalizeToGoogleAdsParams", () => {
  it("returns null for unsupported event (PageView)", () => {
    const result = normalizeToGoogleAdsParams("PageView", BASE_EVENT_DATA, BASE_CONFIG);
    expect(result).toBeNull();
  });

  it("returns null for unsupported event (Refund)", () => {
    const result = normalizeToGoogleAdsParams("Refund", BASE_EVENT_DATA, BASE_CONFIG);
    expect(result).toBeNull();
  });

  it("returns null when label is not configured for the event", () => {
    const config = { ...BASE_CONFIG, googleAdsLabelPurchase: null };
    const result = normalizeToGoogleAdsParams("Purchase", BASE_EVENT_DATA, config);
    expect(result).toBeNull();
  });

  it("returns null when label is empty string", () => {
    const config = { ...BASE_CONFIG, googleAdsLabelAddToCart: "" };
    const result = normalizeToGoogleAdsParams("AddToCart", BASE_EVENT_DATA, config);
    expect(result).toBeNull();
  });

  it("builds correct params for Purchase", () => {
    const result = normalizeToGoogleAdsParams("Purchase", BASE_EVENT_DATA, BASE_CONFIG);

    expect(result).not.toBeNull();
    expect(result!.conversionId).toBe("1234567890");
    expect(result!.label).toBe("PurchaseLabel");
    expect(result!.value).toBe(49.99);
    expect(result!.currencyCode).toBe("USD");
    expect(result!.orderId).toBe("ORD-1001");
    expect(result!.gclid).toBe("test-gclid-abc");
  });

  it("builds correct params for AddToCart", () => {
    const result = normalizeToGoogleAdsParams("AddToCart", BASE_EVENT_DATA, BASE_CONFIG);
    expect(result).not.toBeNull();
    expect(result!.label).toBe("CartLabel");
  });

  it("builds correct params for InitiateCheckout", () => {
    const result = normalizeToGoogleAdsParams("InitiateCheckout", BASE_EVENT_DATA, BASE_CONFIG);
    expect(result).not.toBeNull();
    expect(result!.label).toBe("CheckoutLabel");
  });

  it("builds correct params for ViewContent", () => {
    const result = normalizeToGoogleAdsParams("ViewContent", BASE_EVENT_DATA, BASE_CONFIG);
    expect(result).not.toBeNull();
    expect(result!.label).toBe("ViewLabel");
  });

  it("includes Enhanced Conversions em param with hashed PII", () => {
    const result = normalizeToGoogleAdsParams("Purchase", BASE_EVENT_DATA, BASE_CONFIG);
    expect(result).not.toBeNull();
    expect(result!.em).toBeDefined();
    expect(result!.em).toContain("tv.1~");
    expect(result!.em).toContain("em.");
    expect(result!.em).toContain("ph.");
    expect(result!.em).toContain("fn.");
    expect(result!.em).toContain("ln.");
  });

  it("omits em param when no userData provided", () => {
    const eventData = { ...BASE_EVENT_DATA, userData: {} };
    const result = normalizeToGoogleAdsParams("Purchase", eventData, BASE_CONFIG);
    expect(result).not.toBeNull();
    expect(result!.em).toBeUndefined();
  });

  it("omits gclid when not provided", () => {
    const eventData = { ...BASE_EVENT_DATA, gclid: undefined };
    const result = normalizeToGoogleAdsParams("Purchase", eventData, BASE_CONFIG);
    expect(result).not.toBeNull();
    expect(result!.gclid).toBeUndefined();
  });

  it("omits value and currencyCode when customData is empty", () => {
    const eventData = { ...BASE_EVENT_DATA, customData: {} };
    const result = normalizeToGoogleAdsParams("Purchase", eventData, BASE_CONFIG);
    expect(result).not.toBeNull();
    expect(result!.value).toBeUndefined();
    expect(result!.currencyCode).toBeUndefined();
    expect(result!.orderId).toBeUndefined();
  });

  it("handles snake_case order_id in customData", () => {
    const eventData = {
      ...BASE_EVENT_DATA,
      customData: { value: 10, currency: "EUR", order_id: "SNK-001" },
    };
    const result = normalizeToGoogleAdsParams("Purchase", eventData, BASE_CONFIG);
    expect(result).not.toBeNull();
    expect(result!.orderId).toBe("SNK-001");
  });

  it("coerces string value to number", () => {
    const eventData = {
      ...BASE_EVENT_DATA,
      customData: { value: "29.99", currency: "GBP" },
    };
    const result = normalizeToGoogleAdsParams("Purchase", eventData, BASE_CONFIG);
    expect(result).not.toBeNull();
    expect(result!.value).toBe(29.99);
  });

  it("normalizes Gmail email before hashing (dots + plus stripped)", () => {
    const eventData = {
      ...BASE_EVENT_DATA,
      userData: { email: "j.doe+shop@gmail.com" },
    };
    const result = normalizeToGoogleAdsParams("Purchase", eventData, BASE_CONFIG);
    expect(result).not.toBeNull();
    // The em param should contain a hash of "jdoe@gmail.com" (dots and +suffix removed)
    expect(result!.em).toBeDefined();
    expect(result!.em).toContain("em.");
  });
});

// ---------------------------------------------------------------------------
// sendToGoogleAds
// ---------------------------------------------------------------------------
describe("sendToGoogleAds", () => {
  beforeEach(() => {
    vi.spyOn(global, "fetch").mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        redirected: false,
        text: vi.fn().mockResolvedValue(""),
      } as unknown as Response)
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("constructs the correct URL with conversion ID", async () => {
    await sendToGoogleAds({
      conversionId: "AW-123456",
      label: "abcDEF",
    });

    const [calledUrl] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(calledUrl).toContain("googleadservices.com/pagead/conversion/AW-123456/");
    expect(calledUrl).toContain("label=abcDEF");
    expect(calledUrl).toContain("guid=ON");
    expect(calledUrl).toContain("script=0");
  });

  it("includes value and currency_code when provided", async () => {
    await sendToGoogleAds({
      conversionId: "AW-123",
      label: "lbl",
      value: 99.50,
      currencyCode: "EUR",
    });

    const [calledUrl] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(calledUrl).toContain("value=99.5");
    expect(calledUrl).toContain("currency_code=EUR");
  });

  it("includes oid and gclid when provided", async () => {
    await sendToGoogleAds({
      conversionId: "AW-123",
      label: "lbl",
      orderId: "ORD-555",
      gclid: "gclid-xyz",
    });

    const [calledUrl] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(calledUrl).toContain("oid=ORD-555");
    expect(calledUrl).toContain("gclid=gclid-xyz");
  });

  it("includes em parameter when provided", async () => {
    await sendToGoogleAds({
      conversionId: "AW-123",
      label: "lbl",
      em: "tv.1~em.abc123",
    });

    const [calledUrl] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(calledUrl).toContain("em=tv.1");
  });

  it("uses GET method", async () => {
    await sendToGoogleAds({ conversionId: "AW-1", label: "x" });

    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options.method).toBe("GET");
  });

  it("returns status and redirected flag on success", async () => {
    const result = await sendToGoogleAds({ conversionId: "AW-1", label: "x" });
    expect(result.status).toBe(200);
    expect(result.redirected).toBe(false);
  });

  it("handles 302 redirect as success", async () => {
    vi.spyOn(global, "fetch").mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        redirected: true,
        text: vi.fn().mockResolvedValue(""),
      } as unknown as Response)
    );

    const result = await sendToGoogleAds({ conversionId: "AW-1", label: "x" });
    expect(result.redirected).toBe(true);
  });

  it("throws GoogleAdsApiError on 4xx", async () => {
    vi.spyOn(global, "fetch").mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        redirected: false,
        text: vi.fn().mockResolvedValue("Bad Request"),
      } as unknown as Response)
    );

    await expect(
      sendToGoogleAds({ conversionId: "AW-1", label: "x" })
    ).rejects.toThrow(GoogleAdsApiError);
  });

  it("throws GoogleAdsApiError on 5xx", async () => {
    vi.spyOn(global, "fetch").mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        redirected: false,
        text: vi.fn().mockResolvedValue("Internal Server Error"),
      } as unknown as Response)
    );

    const err = await sendToGoogleAds({ conversionId: "AW-1", label: "x" }).catch(
      (e) => e
    );
    expect(err).toBeInstanceOf(GoogleAdsApiError);
    expect(err.statusCode).toBe(500);
    expect(err.response).toBe("Internal Server Error");
  });

  it("does not include optional params when not provided", async () => {
    await sendToGoogleAds({ conversionId: "AW-1", label: "x" });

    const [calledUrl] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(calledUrl).not.toContain("value=");
    expect(calledUrl).not.toContain("currency_code=");
    expect(calledUrl).not.toContain("oid=");
    expect(calledUrl).not.toContain("gclid=");
    expect(calledUrl).not.toContain("em=");
  });
});
