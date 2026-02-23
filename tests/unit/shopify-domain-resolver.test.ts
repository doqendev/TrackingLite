import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  normalizeDomainInput,
  resolveShopifyDomain,
} from "../../src/lib/shopify-domain-resolver";

describe("normalizeDomainInput", () => {
  it("strips https:// protocol", () => {
    expect(normalizeDomainInput("https://mystore.com")).toBe("mystore.com");
  });

  it("strips http:// protocol", () => {
    expect(normalizeDomainInput("http://mystore.com")).toBe("mystore.com");
  });

  it("strips trailing slashes", () => {
    expect(normalizeDomainInput("mystore.com/")).toBe("mystore.com");
  });

  it("strips paths after the domain", () => {
    expect(normalizeDomainInput("mystore.com/collections/all")).toBe(
      "mystore.com"
    );
  });

  it("strips port numbers", () => {
    expect(normalizeDomainInput("mystore.com:8080")).toBe("mystore.com");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeDomainInput("  mystore.com  ")).toBe("mystore.com");
  });

  it("lowercases the result", () => {
    expect(normalizeDomainInput("MyStore.COM")).toBe("mystore.com");
  });

  it("handles combined protocol, path, and whitespace", () => {
    expect(
      normalizeDomainInput("  https://MyStore.COM/some/path?query=1  ")
    ).toBe("mystore.com");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeDomainInput("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normalizeDomainInput("   ")).toBe("");
  });

  it("strips port from input that also has a protocol", () => {
    expect(normalizeDomainInput("https://mystore.com:443")).toBe("mystore.com");
  });

  it("handles already-clean bare domain without modification", () => {
    expect(normalizeDomainInput("mystore.myshopify.com")).toBe(
      "mystore.myshopify.com"
    );
  });
});

describe("resolveShopifyDomain", () => {
  beforeEach(() => {
    vi.spyOn(global, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns directly for a *.myshopify.com input without calling fetch", async () => {
    const result = await resolveShopifyDomain("mystore.myshopify.com");

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result).toEqual({
      shopifyDomain: "mystore.myshopify.com",
      displayDomain: "mystore.myshopify.com",
    });
  });

  it("normalizes myshopify.com input with protocol before returning directly", async () => {
    const result = await resolveShopifyDomain(
      "https://mystore.myshopify.com/admin"
    );

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result).toEqual({
      shopifyDomain: "mystore.myshopify.com",
      displayDomain: "mystore.myshopify.com",
    });
  });

  it("resolves a custom domain via /meta.json and returns shopify + display domains", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ myshopify_domain: "test-store.myshopify.com" }),
    } as Response);

    const result = await resolveShopifyDomain("www.customshop.com");

    expect(global.fetch).toHaveBeenCalledWith(
      "https://www.customshop.com/meta.json",
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: "application/json" }),
      })
    );
    expect(result).toEqual({
      shopifyDomain: "test-store.myshopify.com",
      displayDomain: "www.customshop.com",
    });
  });

  it("normalizes myshopify_domain from meta.json to lowercase", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ myshopify_domain: "TEST-STORE.myshopify.com" }),
    } as Response);

    const result = await resolveShopifyDomain("www.customshop.com");

    expect(result).toEqual({
      shopifyDomain: "test-store.myshopify.com",
      displayDomain: "www.customshop.com",
    });
  });

  it("returns null when fetch response is not ok (404)", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as Response);

    const result = await resolveShopifyDomain("www.not-a-shopify-store.com");

    expect(result).toBeNull();
  });

  it("returns null on timeout (AbortError)", async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(
      Object.assign(new Error("The operation was aborted"), {
        name: "AbortError",
      })
    );

    const result = await resolveShopifyDomain("www.slow-store.com");

    expect(result).toBeNull();
  });

  it("returns null when fetch throws a generic network error", async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(
      new Error("network failure")
    );

    const result = await resolveShopifyDomain("www.offline-store.com");

    expect(result).toBeNull();
  });

  it("returns null when response body is invalid JSON", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    } as unknown as Response);

    const result = await resolveShopifyDomain("www.bad-json-store.com");

    expect(result).toBeNull();
  });

  it("returns null when myshopify_domain field is missing from JSON", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ name: "Some Store", platform: "shopify" }),
    } as Response);

    const result = await resolveShopifyDomain("www.no-field-store.com");

    expect(result).toBeNull();
  });

  it("returns null when myshopify_domain is an empty string", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ myshopify_domain: "" }),
    } as Response);

    const result = await resolveShopifyDomain("www.empty-field-store.com");

    expect(result).toBeNull();
  });

  it("returns null when myshopify_domain is not a valid myshopify.com domain", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ myshopify_domain: "store.example.com" }),
    } as Response);

    const result = await resolveShopifyDomain("www.weird-store.com");

    expect(result).toBeNull();
  });

  it("returns null when myshopify_domain is a non-string type", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ myshopify_domain: 12345 }),
    } as Response);

    const result = await resolveShopifyDomain("www.typed-wrong-store.com");

    expect(result).toBeNull();
  });

  it("returns null for empty string input", async () => {
    const result = await resolveShopifyDomain("");

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("returns null for whitespace-only input", async () => {
    const result = await resolveShopifyDomain("   ");

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("normalizes input with protocol and path before fetching", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        myshopify_domain: "my-brand.myshopify.com",
      }),
    } as Response);

    const result = await resolveShopifyDomain(
      "https://www.my-brand.com/pages/about"
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://www.my-brand.com/meta.json",
      expect.anything()
    );
    expect(result).toEqual({
      shopifyDomain: "my-brand.myshopify.com",
      displayDomain: "www.my-brand.com",
    });
  });

  it("uses displayDomain equal to the normalized input (not the raw input)", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ myshopify_domain: "branded.myshopify.com" }),
    } as Response);

    const result = await resolveShopifyDomain("HTTPS://BRANDED-STORE.COM/");

    expect(result).toEqual({
      shopifyDomain: "branded.myshopify.com",
      displayDomain: "branded-store.com",
    });
  });
});
