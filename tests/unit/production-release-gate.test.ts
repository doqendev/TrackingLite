import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertRailwayProductionReleaseApproved,
  assertRailwayProductionRuntimeReleaseApproved,
  assertVercelProductionReleaseApproved,
  assertVercelProductionRuntimeReleaseApproved,
  shouldAssertRailwayProductionRelease,
  shouldAssertVercelProductionSchema,
} from "@/lib/production-release-gate";

const SHA = "a".repeat(40);

describe("production release gate", () => {
  it("accepts only an exact Railway environment and full approved commit", () => {
    expect(
      assertRailwayProductionReleaseApproved({
        RAILWAY_ENVIRONMENT_ID: "production-environment",
        TRACKCLEAR_PRODUCTION_RAILWAY_ENVIRONMENT_ID: "production-environment",
        RAILWAY_GIT_COMMIT_SHA: SHA,
        TRACKCLEAR_PRODUCTION_RELEASE_SHA: SHA,
        DATABASE_URL: "postgresql://configured",
        DIRECT_DATABASE_URL: "postgresql://configured-direct",
      })
    ).toEqual({ commitSha: SHA });
  });

  it.each([
    ["wrong environment", { RAILWAY_ENVIRONMENT_ID: "preview" }],
    ["wrong commit", { RAILWAY_GIT_COMMIT_SHA: "b".repeat(40) }],
    ["short commit", { RAILWAY_GIT_COMMIT_SHA: "abc123" }],
    ["missing direct database", { DIRECT_DATABASE_URL: "" }],
  ])("fails closed for %s without printing sensitive values", (_label, override) => {
    const environment = {
      RAILWAY_ENVIRONMENT_ID: "production-environment",
      TRACKCLEAR_PRODUCTION_RAILWAY_ENVIRONMENT_ID: "production-environment",
      RAILWAY_GIT_COMMIT_SHA: SHA,
      TRACKCLEAR_PRODUCTION_RELEASE_SHA: SHA,
      DATABASE_URL: "postgresql://secret-user:secret-password@private/database",
      DIRECT_DATABASE_URL:
        "postgresql://secret-user:secret-password@private/database",
      ...override,
    };

    expect(() => assertRailwayProductionReleaseApproved(environment)).toThrow();
    try {
      assertRailwayProductionReleaseApproved(environment);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain("secret-password");
      expect(message).not.toContain(SHA);
    }
  });

  it("skips every Vercel non-production environment before requiring credentials", () => {
    expect(
      shouldAssertVercelProductionSchema({
        VERCEL: "1",
        VERCEL_ENV: "preview",
      })
    ).toBe(false);
    expect(
      shouldAssertVercelProductionSchema({
        VERCEL: "1",
        VERCEL_ENV: "development",
      })
    ).toBe(false);
  });

  it("fails closed for missing or unknown environment metadata on Vercel", () => {
    expect(() => shouldAssertVercelProductionSchema({}))
      .toThrow("recognized provider environment metadata");
    expect(() => shouldAssertVercelProductionSchema({ VERCEL: "1" }))
      .toThrow("recognized provider environment metadata");
    expect(() =>
      shouldAssertVercelProductionSchema({
        VERCEL: "1",
        VERCEL_ENV: "unknown",
      })
    ).toThrow("recognized provider environment metadata");
  });

  it("recognizes actual Railway runtime markers but not commit-only CI smoke", () => {
    expect(shouldAssertRailwayProductionRelease({})).toBe(false);
    expect(
      shouldAssertRailwayProductionRelease({
        RAILWAY_GIT_COMMIT_SHA: SHA,
      })
    ).toBe(false);
    for (const marker of [
      "RAILWAY_PROJECT_ID",
      "RAILWAY_SERVICE_ID",
      "RAILWAY_ENVIRONMENT_ID",
    ]) {
      expect(shouldAssertRailwayProductionRelease({ [marker]: "configured" }))
        .toBe(true);
    }

    const incompleteRailwayRuntime = { RAILWAY_PROJECT_ID: "project" };
    expect(shouldAssertRailwayProductionRelease(incompleteRailwayRuntime))
      .toBe(true);
    expect(() =>
      assertRailwayProductionReleaseApproved(incompleteRailwayRuntime)
    ).toThrow("RAILWAY_ENVIRONMENT_ID");
    expect(
      assertRailwayProductionRuntimeReleaseApproved({
        RAILWAY_ENVIRONMENT_ID: "production-environment",
        TRACKCLEAR_PRODUCTION_RAILWAY_ENVIRONMENT_ID:
          "production-environment",
        RAILWAY_GIT_COMMIT_SHA: SHA,
        TRACKCLEAR_PRODUCTION_RELEASE_SHA: SHA,
      })
    ).toEqual({ commitSha: SHA });
  });

  it("requires the exact approved Vercel production commit", () => {
    expect(
      assertVercelProductionReleaseApproved({
        VERCEL_ENV: "production",
        VERCEL_GIT_COMMIT_SHA: SHA,
        TRACKCLEAR_PRODUCTION_RELEASE_SHA: SHA,
        DATABASE_URL: "postgresql://configured",
        DIRECT_DATABASE_URL: "postgresql://configured-direct",
      })
    ).toEqual({ commitSha: SHA });
  });

  it("allows runtime approval to validate the exact commit without database secrets", () => {
    expect(
      assertVercelProductionRuntimeReleaseApproved({
        VERCEL_ENV: "production",
        VERCEL_GIT_COMMIT_SHA: SHA,
        TRACKCLEAR_PRODUCTION_RELEASE_SHA: SHA,
      })
    ).toEqual({ commitSha: SHA });

    expect(() =>
      assertVercelProductionRuntimeReleaseApproved({
        VERCEL_ENV: "production",
        VERCEL_GIT_COMMIT_SHA: "b".repeat(40),
        TRACKCLEAR_PRODUCTION_RELEASE_SHA: SHA,
      })
    ).toThrow("not explicitly approved");

    expect(() =>
      assertVercelProductionRuntimeReleaseApproved({
        VERCEL_ENV: "production",
        VERCEL_GIT_COMMIT_SHA: SHA.toUpperCase(),
        TRACKCLEAR_PRODUCTION_RELEASE_SHA: SHA,
      })
    ).toThrow("not explicitly approved");
  });

  it("keeps automatic deploy configs behind the explicit release gates", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8")
    ) as { scripts: Record<string, string> };
    const vercel = JSON.parse(
      readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")
    ) as {
      buildCommand: string;
      git?: { deploymentEnabled?: boolean };
    };
    const railwayWeb = readFileSync(
      resolve(process.cwd(), "railway.web.toml"),
      "utf8"
    );
    const railwayWorker = readFileSync(
      resolve(process.cwd(), "railway.worker.toml"),
      "utf8"
    );
    const vercelGate = readFileSync(
      resolve(process.cwd(), "scripts/assert-vercel-production-schema.ts"),
      "utf8"
    );
    const railwayGate = readFileSync(
      resolve(process.cwd(), "scripts/railway-production-release-gate.ts"),
      "utf8"
    );
    const workerEntrypoint = readFileSync(
      resolve(process.cwd(), "src/workers/start-worker.ts"),
      "utf8"
    );
    const middleware = readFileSync(
      resolve(process.cwd(), "src/middleware.ts"),
      "utf8"
    );
    const vercelIdentityIndex = vercelGate.indexOf(
      "await assertProductionDatabaseUrlsMatch("
    );
    const vercelSchemaIndex = vercelGate.indexOf(
      'runPnpm("Prisma migration status"'
    );
    const railwayApprovalIndex = railwayGate.indexOf(
      "assertRailwayProductionReleaseApproved(process.env);"
    );
    const railwayIdentityIndex = railwayGate.indexOf(
      "await assertProductionDatabaseUrlsMatch("
    );
    const railwayMigrationIndex = railwayGate.indexOf(
      'runPnpm("Prisma production migration"'
    );
    const middlewareApprovalIndex = middleware.indexOf(
      "assertVercelProductionRuntimeReleaseApproved(vercelReleaseEnvironment);"
    );
    const middlewareHandlingIndex = middleware.indexOf("cleanupStaleEntries();");
    const workerApprovalIndex = workerEntrypoint.indexOf(
      "assertRailwayProductionReleaseApproved(process.env);"
    );
    const workerSchemaIndex = workerEntrypoint.indexOf(
      "assertTrackingDeploymentSchemaReady(db)"
    );
    const firstWorkerImportIndex = workerEntrypoint.indexOf(
      'import("./meta-event-processor")'
    );

    expect(vercel.git?.deploymentEnabled).toBe(false);
    expect(vercel.buildCommand).toBe("pnpm build:vercel");
    expect(packageJson.scripts["build:vercel"]).toContain(
      "assert-vercel-production-schema.ts"
    );
    expect(packageJson.scripts["release:railway-production"]).toBe(
      "tsx scripts/railway-production-release-gate.ts"
    );
    expect(middleware).toContain("VERCEL: process.env.VERCEL");
    for (const config of [railwayWeb, railwayWorker]) {
      expect(config).toContain(
        'preDeployCommand = "pnpm release:railway-production"'
      );
      expect(config).not.toMatch(/preDeployCommand\s*=.*(?:migrate|db push|seed)/i);
    }
    expect(vercelGate).not.toMatch(/"(?:deploy|reset|db push|seed)"/i);
    expect(vercelIdentityIndex).toBeGreaterThan(-1);
    expect(vercelIdentityIndex).toBeLessThan(vercelSchemaIndex);
    expect(railwayApprovalIndex).toBeGreaterThan(-1);
    expect(railwayApprovalIndex).toBeLessThan(railwayMigrationIndex);
    expect(railwayIdentityIndex).toBeGreaterThan(-1);
    expect(railwayIdentityIndex).toBeLessThan(railwayMigrationIndex);
    expect(railwayGate.match(/"deploy"/g)).toHaveLength(1);
    expect(middlewareApprovalIndex).toBeGreaterThan(-1);
    expect(middlewareApprovalIndex).toBeLessThan(middlewareHandlingIndex);
    expect(workerApprovalIndex).toBeGreaterThan(-1);
    expect(workerApprovalIndex).toBeLessThan(firstWorkerImportIndex);
    expect(workerSchemaIndex).toBeGreaterThan(-1);
    expect(workerSchemaIndex).toBeLessThan(firstWorkerImportIndex);
  });
});
