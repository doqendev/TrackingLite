import { Prisma, PrismaClient } from "@prisma/client";

export interface DeploymentDatabaseIdentity {
  databaseName: string;
  schemaName: string;
  systemIdentifier: string;
  inRecovery: boolean;
  transactionReadOnly: boolean;
}

export interface ExpectedDeploymentDatabaseIdentity {
  databaseName: string;
  schemaName: string;
  systemIdentifier: string;
}

type IdentityEnvironment = Record<string, string | undefined>;

export interface DeploymentDatabaseIdentityClient {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
}

type DisconnectableIdentityClient = DeploymentDatabaseIdentityClient & {
  $disconnect(): Promise<void>;
};

function validateIdentity(
  value: DeploymentDatabaseIdentity | undefined
): DeploymentDatabaseIdentity {
  if (
    !value ||
    typeof value.databaseName !== "string" ||
    value.databaseName.length === 0 ||
    typeof value.schemaName !== "string" ||
    value.schemaName.length === 0 ||
    typeof value.systemIdentifier !== "string" ||
    !/^\d+$/.test(value.systemIdentifier) ||
    typeof value.inRecovery !== "boolean" ||
    typeof value.transactionReadOnly !== "boolean"
  ) {
    throw new Error("Production database identity metadata is unavailable");
  }
  return value;
}

function validateExpectedIdentity(
  value: ExpectedDeploymentDatabaseIdentity
): ExpectedDeploymentDatabaseIdentity {
  if (
    !value.databaseName?.trim() ||
    !value.schemaName?.trim() ||
    !/^\d+$/.test(value.systemIdentifier?.trim() ?? "")
  ) {
    throw new Error("Production database identity configuration is incomplete");
  }
  return {
    databaseName: value.databaseName.trim(),
    schemaName: value.schemaName.trim(),
    systemIdentifier: value.systemIdentifier.trim(),
  };
}

export function readExpectedDeploymentDatabaseIdentity(
  environment: IdentityEnvironment
): ExpectedDeploymentDatabaseIdentity {
  return validateExpectedIdentity({
    databaseName:
      environment.TRACKCLEAR_PRODUCTION_DATABASE_NAME ?? "",
    schemaName:
      environment.TRACKCLEAR_PRODUCTION_DATABASE_SCHEMA ?? "",
    systemIdentifier:
      environment.TRACKCLEAR_PRODUCTION_DATABASE_SYSTEM_IDENTIFIER ?? "",
  });
}

export async function readDeploymentDatabaseIdentity(
  client: DeploymentDatabaseIdentityClient
): Promise<DeploymentDatabaseIdentity> {
  try {
    const rows = await client.$queryRaw<DeploymentDatabaseIdentity[]>(Prisma.sql`
      SELECT
        current_database() AS "databaseName",
        current_schema() AS "schemaName",
        (
          SELECT system_identifier::text
          FROM pg_control_system()
        ) AS "systemIdentifier",
        pg_is_in_recovery() AS "inRecovery",
        current_setting('transaction_read_only') = 'on'
          AS "transactionReadOnly"
    `);
    if (rows.length !== 1) {
      throw new Error("unexpected identity row count");
    }
    return validateIdentity(rows[0]);
  } catch {
    // Prisma connection errors can contain credentials. Release-gate failures
    // intentionally expose only this fixed message to CI/provider logs.
    throw new Error("Production database identity query failed");
  }
}

export function assertDeploymentDatabaseIdentityMatchesExpected(
  actualIdentity: DeploymentDatabaseIdentity,
  expectedIdentity: ExpectedDeploymentDatabaseIdentity
): void {
  const actual = validateIdentity(actualIdentity);
  const expected = validateExpectedIdentity(expectedIdentity);
  if (actual.inRecovery || actual.transactionReadOnly) {
    throw new Error(
      "Production database identity must be a writable primary"
    );
  }
  if (
    actual.databaseName !== expected.databaseName ||
    actual.schemaName !== expected.schemaName ||
    actual.systemIdentifier !== expected.systemIdentifier
  ) {
    throw new Error(
      "Production database identity does not match the approved target"
    );
  }
}

export function assertSameDeploymentDatabase(
  runtimeIdentity: DeploymentDatabaseIdentity,
  directIdentity: DeploymentDatabaseIdentity,
  expectedIdentity: ExpectedDeploymentDatabaseIdentity
): void {
  const runtime = validateIdentity(runtimeIdentity);
  const direct = validateIdentity(directIdentity);
  if (
    runtime.databaseName !== direct.databaseName ||
    runtime.schemaName !== direct.schemaName ||
    runtime.systemIdentifier !== direct.systemIdentifier
  ) {
    throw new Error(
      "Production runtime and direct database connections do not identify the same database"
    );
  }
  if (
    runtime.inRecovery ||
    direct.inRecovery ||
    runtime.transactionReadOnly ||
    direct.transactionReadOnly
  ) {
    throw new Error(
      "Production runtime and direct database connections must both be writable primaries"
    );
  }
  assertDeploymentDatabaseIdentityMatchesExpected(runtime, expectedIdentity);
}

function createIdentityClient(url: string): DisconnectableIdentityClient {
  try {
    return new PrismaClient({
      datasources: { db: { url } },
    });
  } catch {
    throw new Error("Production database identity client initialization failed");
  }
}

export async function assertProductionDatabaseUrlsMatch(
  runtimeDatabaseUrl: string | undefined,
  directDatabaseUrl: string | undefined,
  expectedIdentity: ExpectedDeploymentDatabaseIdentity
): Promise<void> {
  if (!runtimeDatabaseUrl?.trim() || !directDatabaseUrl?.trim()) {
    throw new Error("Production database identity configuration is incomplete");
  }
  const expected = validateExpectedIdentity(expectedIdentity);

  let runtimeClient: DisconnectableIdentityClient | null = null;
  let directClient: DisconnectableIdentityClient | null = null;
  try {
    runtimeClient = createIdentityClient(runtimeDatabaseUrl);
    directClient = createIdentityClient(directDatabaseUrl);
    const [runtimeIdentity, directIdentity] = await Promise.all([
      readDeploymentDatabaseIdentity(runtimeClient),
      readDeploymentDatabaseIdentity(directClient),
    ]);
    assertSameDeploymentDatabase(runtimeIdentity, directIdentity, expected);
  } finally {
    await Promise.allSettled(
      [runtimeClient, directClient]
        .filter(
          (client): client is DisconnectableIdentityClient => client !== null
        )
        .map((client) => client.$disconnect())
    );
  }
}
