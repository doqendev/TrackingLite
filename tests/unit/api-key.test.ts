import { describe, it, expect } from "vitest";
import { generateApiKey, isValidApiKeyFormat } from "../../src/lib/api-key";

describe("generateApiKey", () => {
  it("generated key starts with 'tl_' prefix", () => {
    const key = generateApiKey();
    expect(key.startsWith("tl_")).toBe(true);
  });

  it("generated key has sufficient length (> 30 chars)", () => {
    const key = generateApiKey();
    expect(key.length).toBeGreaterThan(30);
  });

  it("generated key has exact expected length (tl_ + 64 hex chars = 67)", () => {
    // randomBytes(32).toString("hex") = 64 chars, plus "tl_" prefix = 67
    const key = generateApiKey();
    expect(key.length).toBe(67);
  });

  it("two generated keys are different (random)", () => {
    const key1 = generateApiKey();
    const key2 = generateApiKey();
    expect(key1).not.toBe(key2);
  });

  it("key body (after prefix) is alphanumeric hex", () => {
    const key = generateApiKey();
    const body = key.slice("tl_".length);
    expect(body).toMatch(/^[a-f0-9]+$/);
  });

  it("generates many unique keys without collision", () => {
    const keys = new Set(Array.from({ length: 100 }, () => generateApiKey()));
    expect(keys.size).toBe(100);
  });
});

describe("isValidApiKeyFormat", () => {
  it("returns true for a properly generated key", () => {
    const key = generateApiKey();
    expect(isValidApiKeyFormat(key)).toBe(true);
  });

  it("returns false for key missing 'tl_' prefix", () => {
    expect(isValidApiKeyFormat("xx_" + "a".repeat(64))).toBe(false);
  });

  it("returns false for key that is too short", () => {
    expect(isValidApiKeyFormat("tl_abc123")).toBe(false);
  });

  it("returns false for key that is too long", () => {
    expect(isValidApiKeyFormat("tl_" + "a".repeat(65))).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isValidApiKeyFormat("")).toBe(false);
  });

  it("returns true only for exact correct length with correct prefix", () => {
    const validBody = "a".repeat(64);
    expect(isValidApiKeyFormat("tl_" + validBody)).toBe(true);
  });
});
