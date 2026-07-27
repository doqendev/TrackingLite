import { describe, expect, it, vi } from "vitest";
import {
  assertTrackingDeploymentSchemaReady,
  REQUIRED_TRACKING_INDEXES,
  REQUIRED_TRACKING_MIGRATIONS,
  type DeploymentSchemaClient,
} from "@/lib/deployment-schema";

function readyClient(
  migrationOverrides: Record<string, Partial<{
    finishedAt: Date | null;
    rolledBackAt: Date | null;
  }>> = {},
  indexOverrides: Record<string, Partial<{
    isValid: boolean;
    isReady: boolean;
  }>> = {}
): DeploymentSchemaClient {
  const migrations = REQUIRED_TRACKING_MIGRATIONS.map((migrationName) => ({
    migrationName,
    finishedAt: new Date("2026-07-27T12:00:00.000Z"),
    rolledBackAt: null,
    ...migrationOverrides[migrationName],
  }));
  const indexes = REQUIRED_TRACKING_INDEXES.map((indexName) => ({
    indexName,
    isValid: true,
    isReady: true,
    ...indexOverrides[indexName],
  }));
  const queryRaw = vi
    .fn()
    .mockResolvedValueOnce(migrations)
    .mockResolvedValueOnce(indexes);
  return { $queryRaw: queryRaw };
}

describe("deployment schema readiness", () => {
  it("accepts all finished migrations and ready indexes", async () => {
    await expect(
      assertTrackingDeploymentSchemaReady(readyClient())
    ).resolves.toBeUndefined();
  });

  it("fails closed for missing, unfinished, or rolled-back migrations", async () => {
    const missingClient = readyClient();
    (missingClient.$queryRaw as ReturnType<typeof vi.fn>).mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(
        REQUIRED_TRACKING_INDEXES.map((indexName) => ({
          indexName,
          isValid: true,
          isReady: true,
        }))
      );
    await expect(
      assertTrackingDeploymentSchemaReady(missingClient)
    ).rejects.toThrow("11 migrations");

    await expect(
      assertTrackingDeploymentSchemaReady(
        readyClient({
          [REQUIRED_TRACKING_MIGRATIONS[0]]: { finishedAt: null },
          [REQUIRED_TRACKING_MIGRATIONS[1]]: {
            rolledBackAt: new Date("2026-07-27T12:05:00.000Z"),
          },
        })
      )
    ).rejects.toThrow("2 migrations");
  });

  it("fails closed for missing, invalid, or unfinished indexes", async () => {
    await expect(
      assertTrackingDeploymentSchemaReady(
        readyClient({}, {
          [REQUIRED_TRACKING_INDEXES[0]]: { isValid: false },
          [REQUIRED_TRACKING_INDEXES[1]]: { isReady: false },
        })
      )
    ).rejects.toThrow("2 indexes");
  });

  it("redacts database failures that may contain connection credentials", async () => {
    const client: DeploymentSchemaClient = {
      $queryRaw: vi.fn().mockRejectedValue(
        new Error(
          "connect postgresql://secret-user:secret-password@private/trackclear"
        )
      ),
    };
    try {
      await assertTrackingDeploymentSchemaReady(client);
      throw new Error("expected schema query to fail");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toBe("Tracking deployment schema query failed");
      expect(message).not.toContain("secret-password");
    }
  });
});
