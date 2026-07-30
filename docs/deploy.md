# Deployment Runbook

## 2026-07-27 Tracking Hardening and 2026-07-30 Internal Attribution Releases

This release is schema-first and mixed-version-sensitive. The database changes
are additive, but old destination workers do not understand delivery claims or
`SUPERSEDED`. Never run old and new workers together.

Required migration chain:

- `20260727_add_shopify_webhook_inbox`
- `20260727_add_shopify_webhook_inbox_idx01_status_next_retry`
- `20260727_add_shopify_webhook_inbox_idx02_status_last_attempt`
- `20260727_add_shopify_webhook_inbox_idx03_workspace_order_id`
- `20260727_add_shopify_webhook_inbox_idx04_workspace_order_name`
- `20260727_add_shopify_webhook_inbox_idx05_workspace_checkout_token`
- `20260727_add_shopify_webhook_inbox_idx06_workspace_cart_token`
- `20260727_add_shopify_webhook_inbox_idx07_delivery_claim_token`
- `20260727_schema_history_catch_up`
- `20260727_schema_history_catch_up_drop_plaintext_secret`
- `20260727_schema_history_catch_up_idx01_workspace_refund_id`
- `20260730_add_internal_analytics_destination`

The base migration contains tracking schema changes and targeted backfills. The
schema-history catch-up adds older model changes that were never represented by
a committed migration. Its following guard drops the legacy plaintext Shopify
secret only when every populated row already has encrypted value, IV, and tag.
Each EventLog `CREATE INDEX CONCURRENTLY`, including the refund index, is
isolated in its own one-statement migration so Prisma 5.22 does not place it in
a multi-statement implicit transaction. Do not combine these files or replace
the concurrent builds with blocking indexes.

The 2026-07-30 migration is one additive `ALTER TYPE` statement that adds the
`INTERNAL` EventLog destination used for privacy-minimized first-party analytics.
The deployment-schema gate requires it. Apply it before activating a web or
worker build that contains the new Prisma enum. It was applied during the
2026-07-30 controlled cutover and production now reports 17/17 migrations,
11/11 required indexes, and zero Prisma drift.

Before touching production, require an active Vercel/Railway account, a current
database restore point, recorded web/worker deployment IDs, and explicit
control of both providers' automatic `main` deployments. The repository turns
off Vercel Git deployment, but Railway autodeploy and the effective custom
config paths are dashboard state and must be verified live. Do not use
`vercel deploy --prebuilt` for production; the source build and its provider
metadata gate must execute on Vercel. Also verify that
the production Redis service has persistent storage and a current backup; the
server-side consent revocation record and delivery queues must survive a Redis
service restart.

Set `TRACKCLEAR_PRODUCTION_RELEASE_SHA` to the exact 40-character release SHA
before the controlled cutover and keep it pinned for the full lifetime of that
deployed release, including restarts. For the next release, rotate it atomically
as part of the next drained cutover; do not unset it after deployment. Set
`TRACKCLEAR_PRODUCTION_RAILWAY_ENVIRONMENT_ID` to the exact production Railway
environment ID. From a separately verified production database console, record
this read-only identity query:

```sql
SELECT
  current_database() AS database_name,
  current_schema() AS schema_name,
  (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier,
  pg_is_in_recovery() AS in_recovery,
  current_setting('transaction_read_only') AS transaction_read_only;
```

Require `in_recovery = false` and `transaction_read_only = off`, then configure
the returned values as `TRACKCLEAR_PRODUCTION_DATABASE_NAME`,
`TRACKCLEAR_PRODUCTION_DATABASE_SCHEMA`, and
`TRACKCLEAR_PRODUCTION_DATABASE_SYSTEM_IDENTIFIER` on both providers. Vercel
must expose `VERCEL_GIT_COMMIT_SHA` through its system environment variables.
Both providers must have `DATABASE_URL` and `DIRECT_DATABASE_URL`; the release
gate requires both connections to report the pinned PostgreSQL identity, with
`pg_is_in_recovery() = false` and `transaction_read_only = off`, before any
schema command. A promoted physical clone can retain the same system identifier,
database name, and schema, so this non-mutating check is not a substitute for
live provider URL/config verification. The Vercel-specific build rejects absent
or unknown `VERCEL_ENV` metadata, and production-mode middleware rejects
requests even when every Vercel marker is absent. A different
SHA/database/schema/environment, a replica, a read-only session, or unavailable
identity metadata also fails closed without logging the values.

The guarded Railway predeploy runs the following sequence only after those
checks pass; the same commands remain the manual verification sequence:

```bash
pnpm prisma migrate deploy
pnpm prisma migrate status
pnpm db:verify-tracking-hardening
DATABASE_URL="$DIRECT_DATABASE_URL" DIRECT_DATABASE_URL="$DIRECT_DATABASE_URL" pnpm prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code
```

Keep database URLs in the child environment as shown. Do not pass a production
connection URL through `--from-url`, where it becomes visible in process
arguments.

The verifier requires exactly eleven indexes on the expected schema/table, exact
ordered columns and uniqueness, and `indisvalid = indisready = true`. Migration
status alone is not a sufficient concurrent-index gate. The zero-exit schema
diff is also mandatory because an idempotent `IF NOT EXISTS` statement can hide
an incompatible pre-existing object.

An interrupted `CREATE INDEX CONCURRENTLY` can leave the exact index absent,
valid, or invalid while Prisma still records a failed migration. Stop the
rollout, identify the exact failed `idxNN` migration, run `DROP INDEX
CONCURRENTLY IF EXISTS "<exact_index_name>"` for only that migration's index,
mark only that migration rolled back with `pnpm prisma migrate resolve
--rolled-back <name>`, then rerun deploy, status, schema diff, and the eleven-index
verifier. Never mark an incomplete migration applied.

If `20260727_schema_history_catch_up_drop_plaintext_secret` refuses to run,
stop the rollout. Backfill a complete AES-256-GCM encrypted value, IV, and tag
for every reported legacy plaintext row without logging either secret, verify
the backfill, mark only that failed migration rolled back, and retry it. Never
drop or blank the plaintext column merely to bypass the guard.

Disposable rehearsal evidence from 2026-07-27: the original hardening chain
upgraded a baseline-shaped PostgreSQL 17.5 database with 50,000 EventLogs and
10,000 Purchases in 3.856 seconds. The final 16-migration history upgraded a
populated 20,000-EventLog/5,000-Purchase baseline in 1.281 seconds, retained
every row and expected backfill, verified 11/11 indexes, and produced zero
Prisma drift. A full greenfield reset through all 16 migrations also passed
status, 11/11 indexes, and zero drift. The plaintext guard rejection/recovery
path passed. An intentionally terminated concurrent build left an invalid
index; dropping that exact index, resolving only its failed migration, and
redeploying recovered cleanly. PostgreSQL 16/Redis 7 CI remains a required PR
gate before production.

Roll out in this exact order. `overlapSeconds = 0` is useful configuration, but
it does not prove that Railway has removed the old process before the candidate
starts:

The worker timeout hierarchy is deliberate: destination HTTP requests are
bounded at 30 seconds, the process allows 45 seconds for listener drain and
database settlement, and `railway.worker.toml` allows 60 seconds before provider
termination. Do not lower or invert those deadlines. All eleven listeners are
constructed with `autorun: false`; mandatory stale-outbox and Shopify-inbox
schedules register before `run()`, and `/health` is not exposed until every
listener has passed `waitUntilReady()` and the startup latch is set.

1. Confirm the preflight above and require all four draft-PR checks: Node 20
   runtime, Node 24 runtime, Node 20 worker container, and PostgreSQL 16
   migration rehearsal.
2. In Railway's effective service settings, disable GitHub autodeploy and verify
   the worker config path is `/railway.worker.toml`, its Dockerfile path is
   `/Dockerfile.worker`, the effective worker drain is 60 seconds, and the
   account can deploy. If a Railway web service still exists, either remove it
   from the rollout or prove it receives no production traffic. If it must
   receive traffic, prove its config is `/railway.web.toml`, its autodeploy is
   disabled, and its effective drain is at least 45 seconds. A tracked custom
   TOML file is not proof that the provider is using it.
3. Confirm Vercel Git deployment is disabled, system Git variables are exposed,
   and production will be deployed from source. Do not use a prebuilt/output/API
   artifact path because it can skip the build-time schema assertion; runtime
   SHA fencing still returns 503 when commit metadata is missing or mismatched.
4. Verify Redis persistence and backup state, take the PostgreSQL restore point,
   then manually stop or pause the old Railway worker fleet. Require `active = 0` on
   all eleven BullMQ queues, wait for any active job to settle, and prove the old
   deployment/process is gone before starting the candidate. Do not rely on a
   rolling deployment or the overlap setting for this release.
5. Only after the old workers are gone, set the release-approval variables to
   the exact environment and SHA; keep them pinned for that release's lifetime.
   Run `pnpm release:railway-production` in the
   approved Railway production environment and require matching runtime/direct
   database identity, clean migration status, 11/11 indexes, and zero drift.
6. Deploy the exact approved SHA to Vercel from source while outbound workers
   remain stopped. The production build must pass its read-only schema gate and
   the Edge runtime must accept the same exact SHA. Wait for
   Vercel's provider view to show zero in-flight invocations from the old build,
   then wait at least the largest configured function duration plus a safety
   buffer. `vercel.json` currently pins ingest and Shopify webhook functions to
   30 seconds, so the minimum release wait is 45 seconds after zero in-flight;
   if the effective provider maximum is larger, use that larger value. Require
   parsed health JSON, not only HTTP 200, to report the exact full 40-character
   release commit plus connected database, ready schema, and Redis.
7. Start the exact approved worker SHA as one fleet. Its idempotent predeploy
   repeats the migration/status/index/drift gates. Verify all eleven queues,
   including `shopify-webhook-inbox`, are listening without schema errors. The
   worker health response must be HTTP 200 with the expected commit,
   `startupReady: true`, `listenersReady: 11`, `workers: 11`, and connected
   database and Redis.
8. Verify `/api/health`, submit safe AddToCart/InitiateCheckout diagnostics,
   and confirm EventLogs progress PENDING -> SENT. For an intentionally induced
   transient only, require bounded RETRYING -> SENT recovery.
9. Repaste the latest Custom Pixel snippet into Dirava only and confirm its
   first line identifies `bridge-v1`, its subscriptions exist before the remote
   request, and it loads one versioned `?loader=bridge-v1` script.
10. Keep TrackClear Meta/TikTok browser ownership disabled during the rollout.
   To change a browser owner later, disable the old owner, wait at least the
   30-second shared-cache TTL, start a fresh browser session, and only then
   enable the replacement. Never overlap two browser integrations for one
   dataset/Pixel ID.
11. Run one low-value controlled Dirava paid order. Confirm the live webhook returns
   after durable capture, the one-minute inbox worker creates the canonical
   outbox before the 90-second browser fallback, and exactly one Meta and one TikTok
   Purchase, one canonical event ID per destination, no active browser fallback,
   and `cart_attributes` attribution where the Cart Helper is installed.
12. Verify the exact EventLog rows and Meta/TikTok Events Manager entries, then
    observe Dirava for 30-60 minutes and at least one normal subsequent event.
13. Verify replay by inducing only a controlled non-Purchase transient failure;
   confirm the deterministic `event-<EventLog.id>` job is reused.
14. Repaste other own stores one at a time only after all Dirava gates remain
    green. A backend release is shared across stores; this bridge repaste is the
    only store-scoped canary available without a workspace release flag.

Rollback safety:

- Before any candidate traffic is processed, the recorded baseline web and
  worker deployments can be restored together with zero worker overlap.
- After candidate traffic is processed, do not restore either the raw
  `506f432` web build or worker. The worker cannot safely reconcile inbox rows,
  claims, or retained jobs, and the old web/dashboard does not understand the
  `SUPERSEDED` terminal state. Stop outbound workers and use a forward fix or a
  deliberately compatible web/worker pair while preserving queues and inbox
  rows.
- The additive schema can remain during a code rollback. Do not drop the inbox,
  retry envelope, alias, or enum fields while any new-version process is running.
- If worker health is uncertain, stop outbound workers while keeping webhook
  intake available; the encrypted inbox preserves signed deliveries for replay.

The 2026-07-30 release completed the required production controls. PR #4 passed
Node 20/24, PostgreSQL 16/Redis 7, worker-container, and migration-rehearsal
gates. A verified encrypted restore point was created at
`E:\backups\trackclear\2026-07-30-d09cf96-pre-release`, the old worker was
stopped, Vercel deployment `FVQiW8qX8533PaXSGNpV3qqLkScb` was activated and
health-checked at exact SHA `d09cf963177ccb69e63f59711483c61945587b0b`, then
Railway deployment `e97087a8-6abd-4b74-a817-b5508ca84baf` passed its guarded
predeploy and started 11/11 listeners. Automatic Vercel and Railway deployments
remain disabled. Store-specific `bridge-v1` loader changes still require a
repaste in each Shopify Custom Pixel.

Known billing-only edge: an order reserved immediately before a UTC month
boundary can be reconstructed into the next month if its canonical webhook row
is first written after rollover. A safe repair needs persisted billing-period
ownership; do not compensate by lowering a live Redis counter during rollout.

## Workspace Mode And Catalog Settings Release

Before deploying app or worker code that reads `Workspace.productMode`,
`Workspace.installType`, catalog ID settings fields, or custom ingest domain
fields, apply committed Prisma migrations against production:

```bash
pnpm prisma migrate deploy
```

For the 2026-07-27 hardening release, Vercel performs a read-only exact-SHA,
writable-primary database-identity, migration, index, and schema-drift assertion
before a source build. The approved Railway predeploy performs the matching
identity check and then applies and verifies migrations. The Railway worker also
fails closed when actual Railway project/service/environment markers exist but
approval metadata is incomplete. Provider config-path, autodeploy, account, and
drain settings remain external state, so live provider verification remains
mandatory.

This release includes:

- `20260521_add_workspace_product_mode`
- `20260522_add_catalog_id_settings`
- `20260522_add_custom_ingest_domain`
- `20260727_add_shopify_webhook_inbox` plus the seven `idx01`-`idx07`
  one-statement index migrations listed above
- `20260727_schema_history_catch_up`
- `20260727_schema_history_catch_up_drop_plaintext_secret`
- `20260727_schema_history_catch_up_idx01_workspace_refund_id`
- `20260730_add_internal_analytics_destination`

All 17 repository migrations are applied in production. Every future release
must still run the guarded migration/status/index/drift checks before activation.

Protect existing headless/custom Shopify workspaces before or during rollout:

```sql
UPDATE "Workspace"
SET "productMode" = 'LEGACY_ALL_DESTINATIONS',
    "installType" = 'HEADLESS_CUSTOM'
WHERE id = 'cmo1hd1x600045r6d9elaw3tg';
```

Set the same workspace ID in production environment variables:

```bash
LEGACY_WORKSPACE_IDS=cmo1hd1x600045r6d9elaw3tg
```

For future internal workspace classification, do not use public APIs. Use:

```bash
pnpm tsx scripts/set-workspace-mode.ts <workspaceId> <productMode> <installType>
```

Supported values:

- `productMode`: `SHOPIFY_META_TIKTOK_V1`, `LEGACY_ALL_DESTINATIONS`
- `installType`: `SHOPIFY_CUSTOM_PIXEL`, `HEADLESS_CUSTOM`

After deployment, require `https://trackclear.io/api/health` to return HTTP 200
with parsed JSON containing `status: "ok"`, the exact full 40-character release
`commit`, `release: "approved"`, `database: "connected"`, `schema: "ready"`, and
`redis: "connected"`.

## Production Branch

Production source remains `main`, but this hardening release disables Vercel Git
deployment in `vercel.json` and requires Railway GitHub autodeploy to be disabled
in the provider dashboard for the controlled cutover:

- Vercel production deployments expose the `tracking-lite-git-main-*` alias.
- Railway worker GitHub statuses are reported against `main` commits.
- GitHub default branch is `main`.

`master` was fast-forwarded to `main` during the branch cleanup. New production
work should target `main`.

Custom ingest domains are per-workspace and remain inactive until saved and
verified. See `docs/custom-ingest-domain.md` before configuring a merchant
domain.
