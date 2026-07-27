import { describe, it, expect } from "vitest";
import { extractCustomData } from "../../src/lib/extract-custom-data";

describe("extractCustomData", () => {
  describe("null / undefined / empty input", () => {
    it("returns all nulls when input is null", () => {
      expect(extractCustomData(null)).toEqual({
        value: null,
        currency: null,
        numItems: null,
        orderId: null,
      });
    });

    it("returns all nulls when input is undefined", () => {
      expect(extractCustomData(undefined)).toEqual({
        value: null,
        currency: null,
        numItems: null,
        orderId: null,
      });
    });

    it("returns all nulls when input is an empty object", () => {
      expect(extractCustomData({})).toEqual({
        value: null,
        currency: null,
        numItems: null,
        orderId: null,
      });
    });
  });

  describe("camelCase keys", () => {
    it("extracts value from camelCase key", () => {
      const result = extractCustomData({ value: 29.99 });
      expect(result.value).toBe(29.99);
    });

    it("extracts currency from camelCase key", () => {
      const result = extractCustomData({ currency: "USD" });
      expect(result.currency).toBe("USD");
    });

    it("extracts numItems from camelCase key", () => {
      const result = extractCustomData({ numItems: 3 });
      expect(result.numItems).toBe(3);
    });

    it("extracts orderId from camelCase key", () => {
      const result = extractCustomData({ orderId: "ORDER-123" });
      expect(result.orderId).toBe("ORDER-123");
    });
  });

  describe("snake_case keys", () => {
    it("extracts numItems from snake_case num_items key", () => {
      const result = extractCustomData({ num_items: 5 });
      expect(result.numItems).toBe(5);
    });

    it("extracts orderId from snake_case order_id key", () => {
      const result = extractCustomData({ order_id: "ORDER-456" });
      expect(result.orderId).toBe("ORDER-456");
    });

    it("extracts value from value key (same in both cases)", () => {
      const result = extractCustomData({ value: 49.99 });
      expect(result.value).toBe(49.99);
    });

    it("extracts currency from currency key (same in both cases)", () => {
      const result = extractCustomData({ currency: "EUR" });
      expect(result.currency).toBe("EUR");
    });
  });

  describe("camelCase takes priority over snake_case", () => {
    it("prefers numItems over num_items when both are present", () => {
      const result = extractCustomData({ numItems: 10, num_items: 99 });
      expect(result.numItems).toBe(10);
    });

    it("prefers orderId over order_id when both are present", () => {
      const result = extractCustomData({ orderId: "CAMEL-ORDER", order_id: "SNAKE-ORDER" });
      expect(result.orderId).toBe("CAMEL-ORDER");
    });
  });

  describe("type coercion", () => {
    it("coerces string value '29.99' to number 29.99", () => {
      const result = extractCustomData({ value: "29.99" });
      expect(result.value).toBe(29.99);
    });

    it("coerces string numItems '3' to number 3", () => {
      const result = extractCustomData({ numItems: "3" });
      expect(result.numItems).toBe(3);
    });

    it("rejects a non-string currency instead of coercing it", () => {
      const result = extractCustomData({ currency: 123 as unknown as string });
      expect(result.currency).toBeNull();
    });

    it("coerces numeric orderId to string", () => {
      const result = extractCustomData({ orderId: 9876 as unknown as string });
      expect(result.orderId).toBe("9876");
    });

    it("does not coerce booleans, arrays, objects, or blank strings", () => {
      expect(extractCustomData({ value: true }).value).toBeNull();
      expect(extractCustomData({ value: [] }).value).toBeNull();
      expect(extractCustomData({ numItems: false }).numItems).toBeNull();
      expect(extractCustomData({ currency: ["USD"] }).currency).toBeNull();
      expect(extractCustomData({ orderId: { id: 1 } }).orderId).toBeNull();
      expect(extractCustomData({ value: "   " }).value).toBeNull();
    });

    it("normalizes valid currency strings to uppercase", () => {
      expect(extractCustomData({ currency: " eur " }).currency).toBe("EUR");
    });
  });

  describe("zero value preservation", () => {
    it("preserves value of 0 as 0 rather than null", () => {
      const result = extractCustomData({ value: 0 });
      expect(result.value).toBe(0);
      expect(result.value).not.toBeNull();
    });

    it("preserves numItems of 0 as 0 rather than null", () => {
      const result = extractCustomData({ numItems: 0 });
      expect(result.numItems).toBe(0);
      expect(result.numItems).not.toBeNull();
    });
  });

  describe("full Purchase event customData", () => {
    it("extracts all fields from a complete Purchase payload (camelCase)", () => {
      const customData = {
        value: 79.98,
        currency: "USD",
        numItems: 2,
        orderId: "SHOP-20001",
        contentIds: ["SKU-A", "SKU-B"],
        contentType: "product",
      };
      expect(extractCustomData(customData)).toEqual({
        value: 79.98,
        currency: "USD",
        numItems: 2,
        orderId: "SHOP-20001",
      });
    });

    it("extracts all fields from a complete Purchase payload (snake_case)", () => {
      const customData = {
        value: 49.99,
        currency: "GBP",
        num_items: 1,
        order_id: "SHOP-30001",
      };
      expect(extractCustomData(customData)).toEqual({
        value: 49.99,
        currency: "GBP",
        numItems: 1,
        orderId: "SHOP-30001",
      });
    });
  });

  describe("partial data", () => {
    it("returns null for missing fields when only value is provided", () => {
      const result = extractCustomData({ value: 15.0 });
      expect(result).toEqual({
        value: 15.0,
        currency: null,
        numItems: null,
        orderId: null,
      });
    });

    it("returns null for missing fields when only currency is provided", () => {
      const result = extractCustomData({ currency: "CAD" });
      expect(result).toEqual({
        value: null,
        currency: "CAD",
        numItems: null,
        orderId: null,
      });
    });

    it("returns null for missing fields when only orderId is provided", () => {
      const result = extractCustomData({ orderId: "X-999" });
      expect(result).toEqual({
        value: null,
        currency: null,
        numItems: null,
        orderId: "X-999",
      });
    });

    it("handles unrelated keys alongside valid ones", () => {
      const result = extractCustomData({
        value: 9.99,
        contentIds: ["ABC"],
        contentType: "product",
        contentCategory: "shoes",
      });
      expect(result).toEqual({
        value: 9.99,
        currency: null,
        numItems: null,
        orderId: null,
      });
    });
  });

  describe("NaN handling", () => {
    it("returns null for value that cannot be parsed as a number", () => {
      const result = extractCustomData({ value: "not-a-number" });
      expect(result.value).toBeNull();
    });

    it("returns null for numItems that cannot be parsed as a number", () => {
      const result = extractCustomData({ numItems: "abc" });
      expect(result.numItems).toBeNull();
    });
  });
});
