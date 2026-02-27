import { cache } from "react";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

const COOKIE_NAME = "activeWorkspaceId";

export interface ActiveWorkspaceInfo {
  id: string;
  name: string;
}

/**
 * Get the user's active workspace.
 * Reads from cookie, validates ownership, falls back to first active workspace.
 * Returns null if user has no workspaces or on DB error.
 *
 * Wrapped in React cache() to deduplicate calls within the same request
 * (layout + page both call this).
 */
export const getActiveWorkspace = cache(
  async (userId: string): Promise<ActiveWorkspaceInfo | null> => {
    try {
      const cookieStore = await cookies();
      const savedId = cookieStore.get(COOKIE_NAME)?.value;

      // If cookie is set, validate it belongs to this user and is active
      if (savedId) {
        const workspace = await db.workspace.findFirst({
          where: { id: savedId, userId, isActive: true },
          select: { id: true, name: true },
        });
        if (workspace) return workspace;
      }

      // Fall back to first active workspace
      const first = await db.workspace.findFirst({
        where: { userId, isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true },
      });

      return first ?? null;
    } catch (error) {
      console.error("Failed to get active workspace:", error);
      return null;
    }
  }
);

/**
 * Get all active workspaces for a user (for the switcher).
 * Wrapped in React cache() to deduplicate within the same request.
 */
export const getAllWorkspaces = cache(async (userId: string) => {
  try {
    return await db.workspace.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, domain: true },
    });
  } catch (error) {
    console.error("Failed to get all workspaces:", error);
    return [];
  }
});
