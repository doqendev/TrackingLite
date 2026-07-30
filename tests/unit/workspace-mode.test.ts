import { afterEach, describe, expect, it, vi } from "vitest";
import {
  filterDestinationsForWorkspace,
  getAllowedDestinationsForWorkspace,
  isDestinationAllowedForWorkspace,
  isLegacyWorkspace,
  resolveWorkspaceInstallType,
  resolveWorkspaceProductMode,
} from "@/lib/workspace-mode";

describe("workspace-mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("treats null product mode as legacy custom", () => {
    const workspace = { id: "ws_old", productMode: null, installType: null };

    expect(resolveWorkspaceProductMode(workspace)).toBe("LEGACY_ALL_DESTINATIONS");
    expect(resolveWorkspaceInstallType(workspace)).toBe("HEADLESS_CUSTOM");
    expect(isLegacyWorkspace(workspace)).toBe(true);
    expect(getAllowedDestinationsForWorkspace(workspace)).toEqual([
      "META",
      "TIKTOK",
      "GA4",
      "KLAVIYO",
      "REDDIT",
      "PINTEREST",
      "GOOGLE_ADS",
    ]);
  });

  it("limits Shopify V1 workspaces to Meta and TikTok", () => {
    const workspace = {
      id: "ws_v1",
      productMode: "SHOPIFY_META_TIKTOK_V1",
      installType: "SHOPIFY_CUSTOM_PIXEL",
    };

    expect(getAllowedDestinationsForWorkspace(workspace)).toEqual(["META", "TIKTOK"]);
    expect(isDestinationAllowedForWorkspace(workspace, "INTERNAL")).toBe(false);
    expect(
      filterDestinationsForWorkspace(workspace, [
        { destination: "META" },
        { destination: "GA4" },
        { destination: "TIKTOK" },
      ])
    ).toEqual([{ destination: "META" }, { destination: "TIKTOK" }]);
  });

  it("uses LEGACY_WORKSPACE_IDS as an emergency bypass", () => {
    vi.stubEnv("LEGACY_WORKSPACE_IDS", "ws_v1, ws_other");

    expect(
      resolveWorkspaceProductMode({
        id: "ws_v1",
        productMode: "SHOPIFY_META_TIKTOK_V1",
        installType: "SHOPIFY_CUSTOM_PIXEL",
      })
    ).toBe("LEGACY_ALL_DESTINATIONS");
  });
});
