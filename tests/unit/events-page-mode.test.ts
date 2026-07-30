import { beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const mockAuth = vi.fn();
const mockGetActiveWorkspace = vi.fn();
const mockWorkspaceFindUnique = vi.fn();
const mockEventLogFindMany = vi.fn();
const mockEventLogCount = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

vi.mock("@/lib/active-workspace", () => ({
  getActiveWorkspace: (...args: unknown[]) => mockGetActiveWorkspace(...args),
}));

vi.mock("@/lib/db", () => ({
  db: {
    workspace: {
      findUnique: (...args: unknown[]) => mockWorkspaceFindUnique(...args),
    },
    eventLog: {
      findMany: (...args: unknown[]) => mockEventLogFindMany(...args),
      count: (...args: unknown[]) => mockEventLogCount(...args),
    },
  },
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string, values?: Record<string, unknown>) => {
    if (key === "totalEvents") return `${values?.count ?? 0} events`;
    if (key === "replayPrivacyNote") return "Replay privacy note";
    return key;
  }),
}));

import EventsPage from "@/app/(dashboard)/events/page";

describe("Events page workspace mode filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user_123" } });
    mockGetActiveWorkspace.mockResolvedValue({ id: "ws_v1" });
    mockWorkspaceFindUnique.mockResolvedValue({
      id: "ws_v1",
      name: "V1 Store",
      productMode: "SHOPIFY_META_TIKTOK_V1",
      installType: "SHOPIFY_CUSTOM_PIXEL",
    });
    mockEventLogFindMany.mockResolvedValue([]);
    mockEventLogCount.mockResolvedValue(0);
  });

  it("counts failed events only for destinations allowed by the workspace mode", async () => {
    await EventsPage({ searchParams: {} });

    expect(mockEventLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          destination: { in: ["META", "TIKTOK", "INTERNAL"] },
        }),
      })
    );

    expect(mockEventLogCount).toHaveBeenNthCalledWith(2, {
      where: {
        workspaceId: "ws_v1",
        status: "FAILED",
        destination: { in: ["META", "TIKTOK"] },
      },
    });
  });
});
