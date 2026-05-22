import { describe, it, expect } from "vitest";
import { shouldSendEvent, shouldSendToDestination } from "../../src/lib/consent";

describe("shouldSendEvent (deprecated) - STRICT mode", () => {
  it("STRICT + analyticsAllowed=true -> allow", () => {
    expect(shouldSendEvent("STRICT", { analytics: true })).toBe(true);
  });

  it("STRICT + analyticsAllowed=false -> block", () => {
    expect(shouldSendEvent("STRICT", { analytics: false })).toBe(false);
  });

  it("STRICT + analyticsAllowed=undefined -> block", () => {
    expect(shouldSendEvent("STRICT", { analytics: undefined })).toBe(false);
  });

  it("STRICT + empty consent object -> block", () => {
    expect(shouldSendEvent("STRICT", {})).toBe(false);
  });

  it("STRICT + customerConsent=undefined -> block", () => {
    expect(shouldSendEvent("STRICT", undefined)).toBe(false);
  });
});

describe("shouldSendEvent (deprecated) - LAX mode", () => {
  it("LAX + analyticsAllowed=true -> allow", () => {
    expect(shouldSendEvent("LAX", { analytics: true })).toBe(true);
  });

  it("LAX + analyticsAllowed=false -> block", () => {
    expect(shouldSendEvent("LAX", { analytics: false })).toBe(false);
  });

  it("LAX + analyticsAllowed=undefined -> allow (opt-out model)", () => {
    expect(shouldSendEvent("LAX", { analytics: undefined })).toBe(true);
  });

  it("LAX + empty consent object -> allow (opt-out model)", () => {
    expect(shouldSendEvent("LAX", {})).toBe(true);
  });

  it("LAX + customerConsent=undefined -> allow (opt-out model)", () => {
    expect(shouldSendEvent("LAX", undefined)).toBe(true);
  });
});

describe("shouldSendToDestination - STRICT mode - Marketing destinations", () => {
  it("STRICT + marketing=true -> allow META", () => {
    expect(shouldSendToDestination("STRICT", { marketing: true }, "META")).toBe(true);
  });

  it("STRICT + marketing=false -> block META", () => {
    expect(shouldSendToDestination("STRICT", { marketing: false }, "META")).toBe(false);
  });

  it("STRICT + marketing=undefined -> block META", () => {
    expect(shouldSendToDestination("STRICT", {}, "META")).toBe(false);
  });

  it("STRICT + marketing=true -> allow GOOGLE_ADS", () => {
    expect(shouldSendToDestination("STRICT", { marketing: true }, "GOOGLE_ADS")).toBe(true);
  });

  it("STRICT + marketing=false -> block GOOGLE_ADS", () => {
    expect(shouldSendToDestination("STRICT", { marketing: false }, "GOOGLE_ADS")).toBe(false);
  });

  it("STRICT + marketing=true -> allow TIKTOK", () => {
    expect(shouldSendToDestination("STRICT", { marketing: true }, "TIKTOK")).toBe(true);
  });

  it("STRICT + marketing=true -> allow KLAVIYO", () => {
    expect(shouldSendToDestination("STRICT", { marketing: true }, "KLAVIYO")).toBe(true);
  });
});

describe("shouldSendToDestination - STRICT mode - Analytics destinations", () => {
  it("STRICT + analytics=true -> allow GA4", () => {
    expect(shouldSendToDestination("STRICT", { analytics: true }, "GA4")).toBe(true);
  });

  it("STRICT + analytics=false -> block GA4", () => {
    expect(shouldSendToDestination("STRICT", { analytics: false }, "GA4")).toBe(false);
  });

  it("STRICT + analytics=undefined -> block GA4", () => {
    expect(shouldSendToDestination("STRICT", {}, "GA4")).toBe(false);
  });
});

describe("shouldSendToDestination - STRICT mode - Cross-field isolation", () => {
  it("STRICT + analytics=true, marketing=false -> block META, allow GA4", () => {
    const consent = { analytics: true, marketing: false };
    expect(shouldSendToDestination("STRICT", consent, "META")).toBe(false);
    expect(shouldSendToDestination("STRICT", consent, "GA4")).toBe(true);
  });

  it("STRICT + analytics=false, marketing=true -> allow META, block GA4", () => {
    const consent = { analytics: false, marketing: true };
    expect(shouldSendToDestination("STRICT", consent, "META")).toBe(true);
    expect(shouldSendToDestination("STRICT", consent, "GA4")).toBe(false);
  });
});

describe("shouldSendToDestination - LAX mode - Marketing destinations", () => {
  it("LAX + marketing=false -> block META", () => {
    expect(shouldSendToDestination("LAX", { marketing: false }, "META")).toBe(false);
  });

  it("LAX + marketing=undefined -> allow META (backward compat)", () => {
    expect(shouldSendToDestination("LAX", {}, "META")).toBe(true);
  });

  it("LAX + consent=undefined -> allow META", () => {
    expect(shouldSendToDestination("LAX", undefined, "META")).toBe(true);
  });
});

describe("shouldSendToDestination - LAX mode - Analytics destinations", () => {
  it("LAX + analytics=false -> block GA4", () => {
    expect(shouldSendToDestination("LAX", { analytics: false }, "GA4")).toBe(false);
  });

  it("LAX + analytics=undefined -> allow GA4", () => {
    expect(shouldSendToDestination("LAX", {}, "GA4")).toBe(true);
  });
});

describe("shouldSendToDestination - LAX mode - Cross-field isolation", () => {
  it("LAX + marketing=false, analytics=true -> block META, allow GA4", () => {
    const consent = { analytics: true, marketing: false };
    expect(shouldSendToDestination("LAX", consent, "META")).toBe(false);
    expect(shouldSendToDestination("LAX", consent, "GA4")).toBe(true);
  });
});

describe("shouldSendToDestination - Unknown destination", () => {
  it("Unknown destination defaults to marketing category", () => {
    expect(shouldSendToDestination("STRICT", { marketing: true }, "UNKNOWN")).toBe(true);
    expect(shouldSendToDestination("STRICT", { marketing: false }, "UNKNOWN")).toBe(false);
    expect(shouldSendToDestination("STRICT", {}, "UNKNOWN")).toBe(false);
  });
});
