import { describe, it, expect, vi, afterAll } from "vitest";
import { GET } from "@/app/api/health/route";
import { disconnectAll } from "./helpers/db";

describe("GET /api/health", () => {
  afterAll(async () => {
    await disconnectAll();
  });

  it("returns 200 with database connected", async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.database).toBe("connected");
    expect(data.schema).toBe("ready");
    expect(data.timestamp).toBeDefined();
  });

  it("reports the full provider commit for exact release verification", async () => {
    const environmentNames = [
      "RAILWAY_GIT_COMMIT_SHA",
      "VERCEL_ENV",
      "VERCEL_GIT_COMMIT_SHA",
      "TRACKCLEAR_PRODUCTION_RELEASE_SHA",
      "TRACKCLEAR_PRODUCTION_DATABASE_NAME",
      "TRACKCLEAR_PRODUCTION_DATABASE_SCHEMA",
      "TRACKCLEAR_PRODUCTION_DATABASE_SYSTEM_IDENTIFIER",
    ] as const;
    const originalEnvironment = new Map(
      environmentNames.map((name) => [name, process.env[name]])
    );
    const commit = "e".repeat(40);
    const { db } = await import("@/lib/db");
    const { readDeploymentDatabaseIdentity } = await import(
      "@/lib/deployment-database-identity"
    );
    const identity = await readDeploymentDatabaseIdentity(db);
    delete process.env.RAILWAY_GIT_COMMIT_SHA;
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_GIT_COMMIT_SHA = commit;
    process.env.TRACKCLEAR_PRODUCTION_RELEASE_SHA = commit;
    process.env.TRACKCLEAR_PRODUCTION_DATABASE_NAME = identity.databaseName;
    process.env.TRACKCLEAR_PRODUCTION_DATABASE_SCHEMA = identity.schemaName;
    process.env.TRACKCLEAR_PRODUCTION_DATABASE_SYSTEM_IDENTIFIER =
      identity.systemIdentifier;

    try {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.commit).toBe(commit);
      expect(data.release).toBe("approved");
    } finally {
      for (const name of environmentNames) {
        const original = originalEnvironment.get(name);
        if (original === undefined) delete process.env[name];
        else process.env[name] = original;
      }
    }
  });

  it("returns 503 with a degraded body when database query fails", async () => {
    const { db } = await import("@/lib/db");
    const original = db.$queryRaw.bind(db);
    db.$queryRaw = vi.fn().mockRejectedValue(new Error("Connection refused")) as any;

    try {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.status).toBe("degraded");
      expect(data.database).toBe("disconnected");
      expect(data.schema).toBe("unready");
    } finally {
      db.$queryRaw = original;
    }
  });
});
