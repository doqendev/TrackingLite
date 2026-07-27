import "dotenv/config";
import { spawnSync } from "node:child_process";
import {
  assertProductionDatabaseUrlsMatch,
  readExpectedDeploymentDatabaseIdentity,
} from "../src/lib/deployment-database-identity";
import { assertRailwayProductionReleaseApproved } from "../src/lib/production-release-gate";

const COMMAND_TIMEOUT_MS = 15 * 60 * 1_000;

function runPnpm(label: string, args: string[]): void {
  // Windows cannot execute a .cmd shim directly with shell:false. Use the
  // platform command host explicitly so local release rehearsals exercise the
  // same fixed pnpm arguments without enabling a general-purpose shell mode.
  const executable =
    process.platform === "win32"
      ? process.env.ComSpec ?? "cmd.exe"
      : "pnpm";
  const commandArgs =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "pnpm.cmd", ...args]
      : args;
  const directDatabaseUrl = process.env.DIRECT_DATABASE_URL;
  if (!directDatabaseUrl) {
    throw new Error("Production release gate is missing DIRECT_DATABASE_URL");
  }
  const result = spawnSync(executable, commandArgs, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: directDatabaseUrl,
      DIRECT_DATABASE_URL: directDatabaseUrl,
      TRACKING_HARDENING_REHEARSAL: "0",
    },
    stdio: "inherit",
    shell: false,
    timeout: COMMAND_TIMEOUT_MS,
  });

  if (result.error) {
    throw new Error(`${label} could not start`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed`);
  }
}

async function runProductionReleaseGate(): Promise<void> {
  assertRailwayProductionReleaseApproved(process.env);
  await assertProductionDatabaseUrlsMatch(
    process.env.DATABASE_URL,
    process.env.DIRECT_DATABASE_URL,
    readExpectedDeploymentDatabaseIdentity(process.env)
  );
  console.log("Railway production environment and release SHA are approved.");

  runPnpm("Prisma production migration", ["exec", "prisma", "migrate", "deploy"]);
  runPnpm("Prisma migration status", ["exec", "prisma", "migrate", "status"]);
  runPnpm("Tracking hardening index verification", [
    "db:verify-tracking-hardening",
  ]);
  runPnpm("Prisma production schema diff", [
    "exec",
    "prisma",
    "migrate",
    "diff",
    "--from-schema-datasource",
    "prisma/schema.prisma",
    "--to-schema-datamodel",
    "prisma/schema.prisma",
    "--exit-code",
  ]);
  console.log("Railway production schema migration and verification completed.");
}

void runProductionReleaseGate().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Railway production release gate failed"
  );
  process.exitCode = 1;
});
