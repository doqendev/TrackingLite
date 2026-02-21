import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { verifyShopifyWebhook } from "../../src/lib/shopify-webhook";

describe("verifyShopifyWebhook", () => {
  const secret = "test-webhook-secret-123";

  function generateHmac(body: string, key: string): string {
    return crypto.createHmac("sha256", key).update(body).digest("base64");
  }

  it("should return true for valid HMAC", () => {
    const body = '{"id":123,"total_price":"99.99"}';
    const hmac = generateHmac(body, secret);
    expect(verifyShopifyWebhook(Buffer.from(body), hmac, secret)).toBe(true);
  });

  it("should return false for invalid HMAC", () => {
    const body = '{"id":123,"total_price":"99.99"}';
    expect(verifyShopifyWebhook(Buffer.from(body), "invalid-hmac", secret)).toBe(false);
  });

  it("should return false when body is tampered", () => {
    const body = '{"id":123,"total_price":"99.99"}';
    const hmac = generateHmac(body, secret);
    const tampered = '{"id":123,"total_price":"0.01"}';
    expect(verifyShopifyWebhook(Buffer.from(tampered), hmac, secret)).toBe(false);
  });

  it("should return false for wrong secret", () => {
    const body = '{"id":123}';
    const hmac = generateHmac(body, secret);
    expect(verifyShopifyWebhook(Buffer.from(body), hmac, "wrong-secret")).toBe(false);
  });

  it("should return false for empty HMAC", () => {
    const body = '{"id":123}';
    expect(verifyShopifyWebhook(Buffer.from(body), "", secret)).toBe(false);
  });

  it("should handle empty body", () => {
    const body = "";
    const hmac = generateHmac(body, secret);
    expect(verifyShopifyWebhook(Buffer.from(body), hmac, secret)).toBe(true);
  });
});
