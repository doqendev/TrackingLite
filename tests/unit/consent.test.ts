import { describe, it, expect } from "vitest";
import { shouldSendEvent } from "../../src/lib/consent";

describe("shouldSendEvent - STRICT mode", () => {
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

describe("shouldSendEvent - LAX mode", () => {
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
