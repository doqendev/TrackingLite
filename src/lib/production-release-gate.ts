const FULL_GIT_SHA = /^[0-9a-f]{40}$/i;

type ReleaseEnvironment = Record<string, string | undefined>;

const NON_PRODUCTION_VERCEL_ENVIRONMENTS = new Set([
  "preview",
  "development",
]);
const RAILWAY_RUNTIME_MARKERS = [
  "RAILWAY_PROJECT_ID",
  "RAILWAY_SERVICE_ID",
  "RAILWAY_ENVIRONMENT_ID",
] as const;

export interface ApprovedProductionRelease {
  commitSha: string;
}

function requireValue(
  environment: ReleaseEnvironment,
  name: string
): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`Production release gate is missing ${name}`);
  }
  return value;
}

function requireFullGitSha(value: string, name: string): void {
  if (!FULL_GIT_SHA.test(value)) {
    throw new Error(`Production release gate requires a full Git SHA in ${name}`);
  }
}

function requireApprovedCommit(
  actualCommitSha: string,
  approvedCommitSha: string
): ApprovedProductionRelease {
  requireFullGitSha(actualCommitSha, "provider commit metadata");
  requireFullGitSha(
    approvedCommitSha,
    "TRACKCLEAR_PRODUCTION_RELEASE_SHA"
  );
  if (actualCommitSha !== approvedCommitSha) {
    throw new Error(
      "Production release gate rejected a commit that was not explicitly approved"
    );
  }
  return { commitSha: actualCommitSha };
}

export function assertRailwayProductionReleaseApproved(
  environment: ReleaseEnvironment
): ApprovedProductionRelease {
  const release = assertRailwayProductionRuntimeReleaseApproved(environment);
  requireValue(environment, "DATABASE_URL");
  requireValue(environment, "DIRECT_DATABASE_URL");
  return release;
}

export function assertRailwayProductionRuntimeReleaseApproved(
  environment: ReleaseEnvironment
): ApprovedProductionRelease {
  const environmentId = requireValue(environment, "RAILWAY_ENVIRONMENT_ID");
  const approvedEnvironmentId = requireValue(
    environment,
    "TRACKCLEAR_PRODUCTION_RAILWAY_ENVIRONMENT_ID"
  );
  if (environmentId !== approvedEnvironmentId) {
    throw new Error(
      "Production release gate rejected a non-production Railway environment"
    );
  }

  return requireApprovedCommit(
    requireValue(environment, "RAILWAY_GIT_COMMIT_SHA"),
    requireValue(environment, "TRACKCLEAR_PRODUCTION_RELEASE_SHA")
  );
}

export function shouldAssertRailwayProductionRelease(
  environment: ReleaseEnvironment
): boolean {
  return RAILWAY_RUNTIME_MARKERS.some(
    (name) => Boolean(environment[name]?.trim())
  );
}

export function shouldAssertVercelProductionSchema(
  environment: ReleaseEnvironment
): boolean {
  const vercelEnvironment = environment.VERCEL_ENV?.trim().toLowerCase();
  if (vercelEnvironment === "production") return true;
  if (
    vercelEnvironment &&
    NON_PRODUCTION_VERCEL_ENVIRONMENTS.has(vercelEnvironment)
  ) {
    return false;
  }
  // This helper is called unconditionally by the Vercel-specific build. An
  // absent marker must not be interpreted as a local build because Vercel only
  // exposes VERCEL/VERCEL_ENV when System Environment Variables are enabled.
  // Local and generic CI builds use `pnpm build` and never enter this helper.
  throw new Error(
    "Vercel release gate requires recognized provider environment metadata"
  );
}

export function assertVercelProductionReleaseApproved(
  environment: ReleaseEnvironment
): ApprovedProductionRelease {
  const release = assertVercelProductionRuntimeReleaseApproved(environment);

  requireValue(environment, "DATABASE_URL");
  requireValue(environment, "DIRECT_DATABASE_URL");
  return release;
}

export function assertVercelProductionRuntimeReleaseApproved(
  environment: ReleaseEnvironment
): ApprovedProductionRelease {
  if (!shouldAssertVercelProductionSchema(environment)) {
    throw new Error(
      "Vercel production release approval was requested outside production"
    );
  }

  return requireApprovedCommit(
    requireValue(environment, "VERCEL_GIT_COMMIT_SHA"),
    requireValue(environment, "TRACKCLEAR_PRODUCTION_RELEASE_SHA")
  );
}
