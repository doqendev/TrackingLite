import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import { hashPii, hashUserData } from "../../src/lib/hash-pii";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("hashPii", () => {
  it("hashes email correctly (lowercase, trimmed, SHA-256)", () => {
    const result = hashPii("Test@Example.COM");
    expect(result).toBe(sha256("test@example.com"));
  });

  it("hashes phone correctly", () => {
    const phone = "+15551234567";
    const result = hashPii(phone);
    expect(result).toBe(sha256(phone));
  });

  it("returns undefined for null input", () => {
    expect(hashPii(null)).toBeUndefined();
  });

  it("returns undefined for undefined input", () => {
    expect(hashPii(undefined)).toBeUndefined();
  });

  it("returns undefined for empty string input", () => {
    expect(hashPii("")).toBeUndefined();
  });

  it("returns undefined for whitespace-only input", () => {
    expect(hashPii("   ")).toBeUndefined();
  });

  it("handles unicode characters", () => {
    const result = hashPii("héllo@wörld.com");
    expect(result).toBe(sha256("héllo@wörld.com"));
  });

  it("trims whitespace before hashing", () => {
    const result = hashPii("  user@example.com  ");
    expect(result).toBe(sha256("user@example.com"));
  });

  it("lowercases before hashing", () => {
    const upper = hashPii("USER@EXAMPLE.COM");
    const lower = hashPii("user@example.com");
    expect(upper).toBe(lower);
  });

  it("returns a 64-character hex string", () => {
    const result = hashPii("test@example.com");
    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("hashUserData", () => {
  it("creates correct user_data structure with hashed email", () => {
    const result = hashUserData({ email: "user@example.com" });
    expect(result.em).toEqual([sha256("user@example.com")]);
  });

  it("creates correct user_data structure with hashed phone", () => {
    const result = hashUserData({ phone: "+15551234567" });
    // normalizePhoneToE164 strips the "+" prefix, so the hash input is "15551234567"
    expect(result.ph).toEqual([sha256("15551234567")]);
  });

  it("normalizes and hashes phone with country code", () => {
    const result = hashUserData({ phone: "(555) 123-4567", phoneCountryCode: "US" });
    // normalizePhoneToE164 strips formatting and prepends country prefix
    expect(result.ph).toBeDefined();
    expect(result.ph).toHaveLength(1);
  });

  it("hashes firstName into fn field", () => {
    const result = hashUserData({ firstName: "Jane" });
    expect(result.fn).toEqual([sha256("jane")]);
  });

  it("hashes lastName into ln field", () => {
    const result = hashUserData({ lastName: "Doe" });
    expect(result.ln).toEqual([sha256("doe")]);
  });

  it("hashes city into ct field", () => {
    const result = hashUserData({ city: "New York" });
    expect(result.ct).toEqual([sha256("new york")]);
  });

  it("hashes state into st field", () => {
    const result = hashUserData({ state: "NY" });
    expect(result.st).toEqual([sha256("ny")]);
  });

  it("hashes zip into zp field", () => {
    const result = hashUserData({ zip: "10001" });
    expect(result.zp).toEqual([sha256("10001")]);
  });

  it("hashes countryCode into country field", () => {
    const result = hashUserData({ countryCode: "US" });
    expect(result.country).toEqual([sha256("us")]);
  });

  it("hashes customerId (number) into external_id field", () => {
    const result = hashUserData({ customerId: 42 });
    expect(result.external_id).toEqual([sha256("42")]);
  });

  it("hashes customerId (string) into external_id field", () => {
    const result = hashUserData({ customerId: "cust-abc" });
    expect(result.external_id).toEqual([sha256("cust-abc")]);
  });

  it("omits fields that are null or undefined", () => {
    const result = hashUserData({ email: null, phone: undefined });
    expect(result.em).toBeUndefined();
    expect(result.ph).toBeUndefined();
  });

  it("returns empty object when no data provided", () => {
    const result = hashUserData({});
    expect(result).toEqual({});
  });

  it("handles all fields simultaneously", () => {
    const result = hashUserData({
      email: "user@example.com",
      firstName: "Jane",
      lastName: "Doe",
      city: "Austin",
      state: "TX",
      zip: "78701",
      countryCode: "US",
      customerId: 99,
    });
    expect(result.em).toBeDefined();
    expect(result.fn).toBeDefined();
    expect(result.ln).toBeDefined();
    expect(result.ct).toBeDefined();
    expect(result.st).toBeDefined();
    expect(result.zp).toBeDefined();
    expect(result.country).toBeDefined();
    expect(result.external_id).toBeDefined();
  });
});
