import { describe, expect, it, vi } from "vitest";
import {
  assertDeploymentDatabaseIdentityMatchesExpected,
  assertSameDeploymentDatabase,
  readDeploymentDatabaseIdentity,
  readExpectedDeploymentDatabaseIdentity,
  type DeploymentDatabaseIdentityClient,
} from "@/lib/deployment-database-identity";

const IDENTITY = {
  databaseName: "trackclear",
  schemaName: "public",
  systemIdentifier: "7542140398433862625",
  inRecovery: false,
  transactionReadOnly: false,
};

describe("deployment database identity", () => {
  it("reads database, schema, and PostgreSQL cluster identity", async () => {
    const client: DeploymentDatabaseIdentityClient = {
      $queryRaw: vi.fn().mockResolvedValue([IDENTITY]),
    };

    await expect(readDeploymentDatabaseIdentity(client)).resolves.toEqual(
      IDENTITY
    );
    const queryObject = (client.$queryRaw as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as { sql: string };
    const query = queryObject.sql;
    expect(query).toContain("current_database");
    expect(query).toContain("current_schema");
    expect(query).toContain("pg_control_system");
    expect(query).toContain("pg_is_in_recovery");
    expect(query).toContain("transaction_read_only");
  });

  it("accepts only the same cluster and same database", () => {
    const expected = {
      databaseName: IDENTITY.databaseName,
      schemaName: IDENTITY.schemaName,
      systemIdentifier: IDENTITY.systemIdentifier,
    };
    expect(() =>
      assertSameDeploymentDatabase(IDENTITY, { ...IDENTITY }, expected)
    ).not.toThrow();

    expect(() =>
      assertSameDeploymentDatabase(
        IDENTITY,
        { ...IDENTITY, databaseName: "trackclear_shadow" },
        expected
      )
    ).toThrow("do not identify the same database");

    expect(() =>
      assertSameDeploymentDatabase(
        IDENTITY,
        { ...IDENTITY, inRecovery: true },
        expected
      )
    ).toThrow("must both be writable primaries");
    expect(() =>
      assertSameDeploymentDatabase(
        IDENTITY,
        { ...IDENTITY, transactionReadOnly: true },
        expected
      )
    ).toThrow("must both be writable primaries");
    expect(() =>
      assertSameDeploymentDatabase(
        IDENTITY,
        { ...IDENTITY, systemIdentifier: "7542140398433862626" },
        expected
      )
    ).toThrow("do not identify the same database");

    expect(() =>
      assertSameDeploymentDatabase(
        IDENTITY,
        { ...IDENTITY, schemaName: "shadow" },
        expected
      )
    ).toThrow("do not identify the same database");
    expect(() =>
      assertDeploymentDatabaseIdentityMatchesExpected(IDENTITY, {
        ...expected,
        databaseName: "wrong_database",
      })
    ).toThrow("does not match the approved target");
    expect(() =>
      assertDeploymentDatabaseIdentityMatchesExpected(
        { ...IDENTITY, transactionReadOnly: true },
        expected
      )
    ).toThrow("must be a writable primary");
    expect(() =>
      assertDeploymentDatabaseIdentityMatchesExpected(
        { ...IDENTITY, inRecovery: true },
        expected
      )
    ).toThrow("must be a writable primary");
    expect(
      readExpectedDeploymentDatabaseIdentity({
        TRACKCLEAR_PRODUCTION_DATABASE_NAME: expected.databaseName,
        TRACKCLEAR_PRODUCTION_DATABASE_SCHEMA: expected.schemaName,
        TRACKCLEAR_PRODUCTION_DATABASE_SYSTEM_IDENTIFIER:
          expected.systemIdentifier,
      })
    ).toEqual(expected);
    expect(() => readExpectedDeploymentDatabaseIdentity({})).toThrow(
      "configuration is incomplete"
    );
  });

  it("fails closed for missing or malformed identity metadata", async () => {
    for (const rows of [
      [],
      [{ ...IDENTITY, systemIdentifier: "" }],
      [{ ...IDENTITY, databaseName: "" }],
      [{ ...IDENTITY, schemaName: "" }],
      [{ ...IDENTITY, systemIdentifier: "not-a-number" }],
      [{ ...IDENTITY, inRecovery: null }],
      [{ ...IDENTITY, transactionReadOnly: null }],
    ]) {
      const client: DeploymentDatabaseIdentityClient = {
        $queryRaw: vi.fn().mockResolvedValue(rows),
      };
      await expect(readDeploymentDatabaseIdentity(client)).rejects.toThrow(
        "Production database identity query failed"
      );
    }
  });

  it("redacts connection failures that may contain credentials", async () => {
    const client: DeploymentDatabaseIdentityClient = {
      $queryRaw: vi
        .fn()
        .mockRejectedValue(
          new Error(
            "connect postgresql://secret-user:secret-password@private/trackclear"
          )
        ),
    };

    try {
      await readDeploymentDatabaseIdentity(client);
      throw new Error("expected the identity query to fail");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toBe("Production database identity query failed");
      expect(message).not.toContain("secret-password");
    }
  });
});
