import { describe, expect, it } from "vitest";
import {
  getClientIpFromHeaders,
  getClientUserAgentFromHeaders,
  resolveFbc,
  synthesizeFbcFromFbclid,
} from "@/lib/tracking-context";

describe("tracking-context", () => {
  it("synthesizes fbc from fbclid using Meta's expected shape", () => {
    expect(synthesizeFbcFromFbclid("TEST123", 1700000000000)).toBe(
      "fb.1.1700000000000.TEST123"
    );
  });

  it("preserves an existing fbc instead of replacing it", () => {
    expect(resolveFbc("fb.1.1700000000000.EXISTING", "NEW", 1700000000001)).toBe(
      "fb.1.1700000000000.EXISTING"
    );
  });

  it("falls back to fbclid when fbc is missing", () => {
    expect(resolveFbc(null, "CLICK", 1700000000000)).toBe(
      "fb.1.1700000000000.CLICK"
    );
  });

  it("prefers trusted TrackClear client IP header over proxy headers", () => {
    const headers = new Headers({
      "x-tl-client-ip": "203.0.113.10",
      "x-forwarded-for": "10.0.0.1, 10.0.0.2",
    });

    expect(getClientIpFromHeaders(headers)).toBe("203.0.113.10");
  });

  it("falls back to x-forwarded-for first hop when client IP header is absent", () => {
    const headers = new Headers({
      "x-forwarded-for": "198.51.100.7, 10.0.0.2",
    });

    expect(getClientIpFromHeaders(headers)).toBe("198.51.100.7");
  });

  it("prefers trusted TrackClear client UA header over proxy user-agent", () => {
    const headers = new Headers({
      "x-tl-client-ua": "RealBrowser/1.0",
      "user-agent": "ProxyRuntime/1.0",
    });

    expect(getClientUserAgentFromHeaders(headers)).toBe("RealBrowser/1.0");
  });
});
