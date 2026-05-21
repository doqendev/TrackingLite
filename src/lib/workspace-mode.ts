import type { Destination } from "@prisma/client";

export const SHOPIFY_META_TIKTOK_V1 = "SHOPIFY_META_TIKTOK_V1" as const;
export const LEGACY_ALL_DESTINATIONS = "LEGACY_ALL_DESTINATIONS" as const;
export const SHOPIFY_CUSTOM_PIXEL = "SHOPIFY_CUSTOM_PIXEL" as const;
export const HEADLESS_CUSTOM = "HEADLESS_CUSTOM" as const;

export type WorkspaceProductModeValue =
  | typeof SHOPIFY_META_TIKTOK_V1
  | typeof LEGACY_ALL_DESTINATIONS;

export type WorkspaceInstallTypeValue =
  | typeof SHOPIFY_CUSTOM_PIXEL
  | typeof HEADLESS_CUSTOM;

export const DEFAULT_NEW_WORKSPACE_PRODUCT_MODE = SHOPIFY_META_TIKTOK_V1;
export const DEFAULT_NEW_WORKSPACE_INSTALL_TYPE = SHOPIFY_CUSTOM_PIXEL;

const ALL_DESTINATIONS = [
  "META",
  "TIKTOK",
  "GA4",
  "KLAVIYO",
  "REDDIT",
  "PINTEREST",
  "GOOGLE_ADS",
] as const satisfies readonly Destination[];

const DESTINATIONS_BY_PRODUCT_MODE: Record<WorkspaceProductModeValue, readonly Destination[]> = {
  SHOPIFY_META_TIKTOK_V1: ["META", "TIKTOK"],
  LEGACY_ALL_DESTINATIONS: ALL_DESTINATIONS,
};

type WorkspaceModeSource = {
  id?: string | null;
  productMode?: WorkspaceProductModeValue | string | null;
  installType?: WorkspaceInstallTypeValue | string | null;
};

function getLegacyWorkspaceIds(): Set<string> {
  return new Set(
    (process.env.LEGACY_WORKSPACE_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

export function resolveWorkspaceProductMode(
  workspace: WorkspaceModeSource
): WorkspaceProductModeValue {
  if (workspace.id && getLegacyWorkspaceIds().has(workspace.id)) {
    return LEGACY_ALL_DESTINATIONS;
  }

  if (workspace.productMode === SHOPIFY_META_TIKTOK_V1) {
    return SHOPIFY_META_TIKTOK_V1;
  }

  return LEGACY_ALL_DESTINATIONS;
}

export function resolveWorkspaceInstallType(
  workspace: WorkspaceModeSource
): WorkspaceInstallTypeValue {
  if (workspace.id && getLegacyWorkspaceIds().has(workspace.id)) {
    return HEADLESS_CUSTOM;
  }

  if (workspace.installType === SHOPIFY_CUSTOM_PIXEL) {
    return SHOPIFY_CUSTOM_PIXEL;
  }

  return HEADLESS_CUSTOM;
}

export function isLegacyWorkspace(workspace: WorkspaceModeSource): boolean {
  return resolveWorkspaceProductMode(workspace) === LEGACY_ALL_DESTINATIONS;
}

export function getAllowedDestinationsForWorkspace(
  workspace: WorkspaceModeSource
): readonly Destination[] {
  return DESTINATIONS_BY_PRODUCT_MODE[resolveWorkspaceProductMode(workspace)];
}

export function filterDestinationsForWorkspace<T extends { destination: string }>(
  workspace: WorkspaceModeSource,
  destinations: T[]
): T[] {
  const allowed = new Set(getAllowedDestinationsForWorkspace(workspace));
  return destinations.filter((destination) =>
    allowed.has(destination.destination as Destination)
  );
}

export function isDestinationAllowedForWorkspace(
  workspace: WorkspaceModeSource,
  destination: Destination
): boolean {
  return getAllowedDestinationsForWorkspace(workspace).includes(destination);
}
