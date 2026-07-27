# CLAUDE.md

`AGENTS.md` is the single authoritative repository guide for architecture,
tracking behavior, project structure, API reference, tests, commands, and
current release state. Read it completely before changing this repository. If
this file and `AGENTS.md` ever conflict, `AGENTS.md` wins.

This indirection is intentional: the previous duplicated guide had drifted far
enough to describe unsafe, obsolete tracking and deployment behavior.

## Required Documentation Maintenance

After every implementation, bug fix, or significant change, update
`AGENTS.md`, `STATUS.md`, and `MEMORY.md`. Refresh this file when the canonical
documentation location or the release boundary below changes. Stale
documentation is worse than no duplicated documentation.

## Current Release Boundary

- Production remains on the deployed `main` baseline. The 2026-07-27
  own-store tracking hardening is isolated on
  `codex/own-store-tracking-hardening` and is not deployed.
- `main` is the source branch. Vercel Git deployment is disabled for the
  controlled release, and Railway autodeploy plus effective custom config paths
  must be verified in the provider before cutover.
- The branch-only migration chain must be applied and verified before the new
  web or worker runtime handles production traffic. Old and new destination
  workers must never overlap.
- TrackClear Meta/TikTok browser ownership is explicit, off by default,
  consent-gated, and must be the only browser owner for its dataset/Pixel ID.
- Consent revocation durability depends on the Redis service surviving a
  restart. Authenticated, strictly minimized no-destination revocations bypass
  delivery-state gates so they can still clear stale identity, but require an
  opaque session/cart/checkout anchor and their own bounded workspace budget;
  they must never create outbox or queue work. Verify production persistence
  and backups before rollout.
- Do not deploy from this branch until every open gate in `STATUS.md` and the
  exact sequence in `docs/deploy.md` is satisfied.

## Repeatable Verification Commands

```bash
pnpm vitest run
pnpm test:integration
pnpm exec tsc --noEmit
pnpm lint
pnpm exec prisma format --check
pnpm exec prisma validate
pnpm build
```

Use `pnpm build:vercel` for a Vercel deployment; its production path runs the
read-only release/schema assertion. `pnpm build:railway` uses POSIX shell
syntax and is intended for the Linux container build, not direct PowerShell
execution. See `AGENTS.md` and `docs/deploy.md` for migration, worker-smoke,
release-SHA, health, and provider-specific gates.
