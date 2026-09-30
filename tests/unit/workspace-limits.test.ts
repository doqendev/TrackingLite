import { afterEach, describe, expect, it, vi } from "vitest";
import { workspaceLimit } from "@/lib/workspace-limits";
describe("owned-store allowance", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("applies an explicit account-level allowance across new stores", () => {
    vi.stubEnv("UNLIMITED_WORKSPACE_USER_IDS", "owner, another-owner");
    expect(workspaceLimit("owner", "FREE")).toBe(Infinity);
    expect(workspaceLimit("another-owner", "STARTER")).toBe(Infinity);
    expect(workspaceLimit("someone-else", "FREE")).toBe(1);
  });
  it("preserves commercial plan limits and keeps order exemptions separate", () => {
    vi.stubEnv("UNLIMITED_WORKSPACE_USER_IDS", ""); vi.stubEnv("UNLIMITED_ORDER_USER_IDS", "owner");
    expect(workspaceLimit("owner", "FREE")).toBe(1);
    expect(workspaceLimit("owner", "GROWTH")).toBe(5);
  });
});
