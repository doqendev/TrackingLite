import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { encrypt, decrypt } from "../../src/lib/encryption";

// AES-256 requires a 32-byte (256-bit) key — 64 hex characters
const TEST_KEY = "0".repeat(64);

beforeAll(() => {
  process.env.ENCRYPTION_KEY = TEST_KEY;
});

afterAll(() => {
  delete process.env.ENCRYPTION_KEY;
});

describe("encrypt / decrypt", () => {
  it("round-trip: encrypt then decrypt returns original plaintext", () => {
    const plaintext = "hello world";
    const { encrypted, iv, tag } = encrypt(plaintext);
    const result = decrypt(encrypted, iv, tag);
    expect(result).toBe(plaintext);
  });

  it("different plaintexts produce different ciphertexts", () => {
    const { encrypted: a } = encrypt("foo");
    const { encrypted: b } = encrypt("bar");
    expect(a).not.toBe(b);
  });

  it("same plaintext produces different ciphertexts each time (random IV)", () => {
    const { encrypted: a, iv: ivA } = encrypt("same text");
    const { encrypted: b, iv: ivB } = encrypt("same text");
    // IVs should differ (extremely high probability with random 16 bytes)
    expect(ivA).not.toBe(ivB);
    expect(a).not.toBe(b);
  });

  it("decrypting with wrong key fails", () => {
    const { encrypted, iv, tag } = encrypt("secret");
    const wrongKey = "f".repeat(64);
    process.env.ENCRYPTION_KEY = wrongKey;
    expect(() => decrypt(encrypted, iv, tag)).toThrow();
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  it("decrypting with corrupted ciphertext fails", () => {
    const { iv, tag } = encrypt("secret");
    const corrupted = "deadbeef".repeat(4);
    expect(() => decrypt(corrupted, iv, tag)).toThrow();
  });

  it("decrypting with corrupted tag fails", () => {
    const { encrypted, iv } = encrypt("secret");
    const badTag = "00".repeat(16);
    expect(() => decrypt(encrypted, iv, badTag)).toThrow();
  });

  it("decrypting with corrupted IV fails or returns wrong plaintext", () => {
    const { encrypted, tag } = encrypt("secret");
    const badIv = "ff".repeat(16);
    // GCM auth tag will catch the tampered IV
    expect(() => decrypt(encrypted, badIv, tag)).toThrow();
  });

  it("handles empty string input", () => {
    const { encrypted, iv, tag } = encrypt("");
    const result = decrypt(encrypted, iv, tag);
    expect(result).toBe("");
  });

  it("handles long string input", () => {
    const long = "a".repeat(10_000);
    const { encrypted, iv, tag } = encrypt(long);
    const result = decrypt(encrypted, iv, tag);
    expect(result).toBe(long);
  });

  it("handles unicode / multi-byte characters", () => {
    const text = "héllo wörld 🌍";
    const { encrypted, iv, tag } = encrypt(text);
    expect(decrypt(encrypted, iv, tag)).toBe(text);
  });

  it("output contains encrypted hex, iv hex, and tag hex fields", () => {
    const { encrypted, iv, tag } = encrypt("test");
    // All three fields must be non-empty hex strings
    expect(encrypted).toMatch(/^[a-f0-9]*$/);
    expect(iv).toMatch(/^[a-f0-9]{32}$/);   // 16 bytes = 32 hex chars
    expect(tag).toMatch(/^[a-f0-9]{32}$/);  // GCM auth tag 16 bytes = 32 hex chars
  });

  it("throws when ENCRYPTION_KEY is missing", () => {
    const saved = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt("test")).toThrow("ENCRYPTION_KEY");
    process.env.ENCRYPTION_KEY = saved;
  });
});
