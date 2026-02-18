import { describe, it, expect } from "vitest";
import { normalizePhoneToE164 } from "../../src/lib/phone-normalizer";

describe("normalizePhoneToE164", () => {
  it("normalizes US number with countryCode US", () => {
    expect(normalizePhoneToE164("(555) 123-4567", "US")).toBe("15551234567");
  });

  it("normalizes UK number with countryCode GB", () => {
    expect(normalizePhoneToE164("07911 123456", "GB")).toBe("447911123456");
  });

  it("normalizes German number with countryCode DE", () => {
    expect(normalizePhoneToE164("0171 1234567", "DE")).toBe("491711234567");
  });

  it("normalizes French number with countryCode FR", () => {
    expect(normalizePhoneToE164("06 12 34 56 78", "FR")).toBe("33612345678");
  });

  it("normalizes Australian number with countryCode AU", () => {
    expect(normalizePhoneToE164("0412 345 678", "AU")).toBe("61412345678");
  });

  it("returns already-E164 number unchanged (strips + prefix)", () => {
    // The function strips the + and returns raw digits
    expect(normalizePhoneToE164("+1234567890", "US")).toBe("1234567890");
  });

  it("returns undefined for null input", () => {
    expect(normalizePhoneToE164(null, "US")).toBeUndefined();
  });

  it("returns undefined for undefined input", () => {
    expect(normalizePhoneToE164(undefined, "US")).toBeUndefined();
  });

  it("returns undefined for number that is too short after normalization", () => {
    expect(normalizePhoneToE164("123", "US")).toBeUndefined();
  });

  it("returns undefined for number that is too long after normalization", () => {
    // 16 digits after prefix would exceed 15-digit E.164 limit
    expect(normalizePhoneToE164("12345678901234567", "US")).toBeUndefined();
  });

  it("strips spaces, dashes, and parentheses", () => {
    expect(normalizePhoneToE164("(555) 123-4567", "US")).toBe("15551234567");
  });

  it("applies US fallback for 10-digit number with no country code", () => {
    expect(normalizePhoneToE164("5551234567", null)).toBe("15551234567");
  });

  it("handles no country code provided with 10-digit number (best effort US)", () => {
    expect(normalizePhoneToE164("5551234567", undefined)).toBe("15551234567");
  });

  it("returns result for already-E164 with + prefix regardless of countryCode", () => {
    expect(normalizePhoneToE164("+447911123456", "US")).toBe("447911123456");
  });

  it("strips leading zero when country code is provided", () => {
    // DE: 0171 -> strip 0 -> 171, prepend 49 -> 49171...
    expect(normalizePhoneToE164("01711234567", "DE")).toBe("491711234567");
  });

  it("normalizes Canadian number with countryCode CA (shares +1 with US)", () => {
    expect(normalizePhoneToE164("6135550100", "CA")).toBe("16135550100");
  });
});
