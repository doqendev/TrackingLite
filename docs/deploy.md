# Deployment Runbook

## Current deployment: 2026-10-13 Google Ads Data Manager

Release `42cb4f9ef10788b3bfbb466a7514aa388a12a829` (PR #24) replaces the Google Ads
destination. The old worker pinged the browser conversion endpoint from the server,
which carries no Google cookies, so nothing was attributable. Purchases now go to one
merchant "Website (Import from clicks)" conversion action through Google's Data
Manager API with the Google click ID (gclid/gbraid/wbraid) and hashed customer data.
Track Clear's service account `trackclear-google-ads@track-clear.iam.gserviceaccount.com`
(GCP project `track-clear`, key in `GOOGLE_DATA_MANAGER_SERVICE_ACCOUNT_KEY` on Railway
and Vercel) authenticates; merchants add its email to Google Ads. SENT means accepted;
`destinationRequestStatus` holds Google's asynchronous result, polled from the existing
5-minute recovery cycle (still 12 listeners). Google Ads is allowed for standard Shopify
V1 workspaces (not headless V1). Design, setup and errors: `docs/google-ads.md`.

Exact-merge CI `38469839345` passed all five gates; 823 unit tests (70 new) and the
integration suite pass. Encrypted restore point:
`E:/backups/trackclear/2026-10-13-google-ads-release` (identity verified). The old worker
`3cb055b2-cd2c-4c8f-97b6-7b7d96f129fb` was removed before the cutover; the staged
Railway key was committed without a deploy and the release pins were set on both hosts.
Migrations `20261014_google_ads_data_manager` and `_idx01_request_status` applied:
22 migrations, 12/12 indexes valid, zero drift. Vercel `dpl_7wTEVDpxeL8Uma1hfCaEVUJYuqEh`
reports the exact SHA with database, schema and Redis ready; after a 2-minute drain margin
Railway `f4574ad5-20e4-4258-adb1-de3a18e4d995` passed its guarded predeploy and reports
12/12 listeners in one fleet. Delivery paused 21:24-21:33 UTC; all 24 events captured
in that window were SENT afterwards and the delivery queues drained.

Infinite Layers: Google Ads customer 867-880-1549 granted the service account Standard
access; conversion action "Track Clear purchase" (ID 7843158220, Purchase, Primary, count
Every, 90-day click window, data-driven) created. The workspace's Save and validate passed
(`validateOnly`) and delivery is enabled. Older Purchase conversion actions in that
Google Ads account are still Primary and await the owner's account cleanup.

## Previous deployment: 2026-10-13 retention and checkout recovery

Release `d3f553a3e38b8bc27a5e1ce8855326ce20c40c68` (PR #22) keeps seven days
of detailed logs and 30 days of reporting for every plan. Compact EventLog identities
remain for 35 days, preserving deduplication and current-month billing. Pending,
recoverable and ambiguous delivery owners remain protected. Redis attribution,
consent, original event times and webhook recovery lifetimes are unchanged.
New modules: `event-retention.ts`, `event-retention-policy.ts`, `sql-timestamp.ts`,
`logical-events-sql.ts`; migration: `20261013_event_retention_summaries`.
See `docs/event-retention.md` for lifecycle and health findings.

Exact-merge CI `38377464019` passed all five gates: Node 20/24, the worker image,
and PostgreSQL 16/17 migration rehearsals. 753 unit tests and 76 integration tests
pass. An isolated production-data rehearsal preserved all 68,173 rows and every
identity/accounting value, and exposed the temporary WAL headroom requirement.

The user approved capacity up to 2 GB. Railway only offered 1 GB or 5 GB; PostgreSQL
was resized online from 500 MB to 1 GB, staying below that approval. The first live
cleanup compacted 39,645 settled rows and created 44 summaries. Checksums of their
tracking identities and accounting values matched before/after. Current EventLog
row bytes fell from 91.2 MB to 49.9 MB; allocated database space is reused rather
than immediately returned to the filesystem. Volume use was 50% after cleanup.

Vercel `dpl_4fdMqyobwNGQa2UKjggMbC6zxNc5` and Railway
`3cb055b2-cd2c-4c8f-97b6-7b7d96f129fb` report the exact release SHA, healthy DB/Redis,
and 12/12 worker listeners in one fleet. The old workers were removed before the
schema-first cutover. Twenty migrations, 11 required indexes valid, zero drift.
Encrypted restore point: `E:/backups/trackclear/2026-10-13-retention-release`.
Infinite Layers' unlimited orders/stores and complimentary Growth remain intact.

Infinite Layers Meta: all 9,362 sampled seven-day non-Purchase funnel rows were SENT.
Dirava has similar anonymous-visitor contact-coverage gaps; both use server-only
Meta. No browser mode or consent setting changed. The separate ChatGPT phone
normalization failure was reproduced under tsx and fixed using explicit /core
metadata. All six recoverable checkout events subsequently received HTTP 200
acceptance with their original IDs, timestamps and Pixel binding unchanged. Three
older envelopes had expired and were not reconstructed. Two consent blocks remain
untouched. The user subsequently authorized historical Purchase recovery: all 36 eligible
orders received HTTP 200 acceptance with original identities/timestamps preserved,
zero duplicate accepted aliases, and exactly one accepted delivery per order.
Seven older Purchase envelopes had expired and were not reconstructed. This is
recovery of existing genuine orders; fresh cart-to-webhook attribution and
consent-denial live QA remain separate open checks. No monitoring was scheduled.



## Previous deployment: 2026-10-13 order-exemption configuration

Code remains approved SHA `e9ff8c7bf566c02c3be2c5fc2f3ef3dceab1294d`.
Vercel `dpl_765K25T6gWqFCLoSnkwYQu1A4ycT` and Railway
`5a2db944-3155-4c93-a6f0-8e4da7a92c3b` activate the Infinite Layers owner in
`UNLIMITED_ORDER_USER_IDS`; the two existing exemptions and all release pins were
preserved. The workspace allowance was already configured. No Stripe/schema/code
change. Both hosts are healthy, the running worker confirms both allowances,
12/12 listeners are ready, and only the new worker deployment remains active.
The deployment used exact GitHub SHA source and Railway's explicit pinned deploy;
variables were saved with `--skip-deploys` before that explicit deployment.
Backup: `E:/backups/trackclear/2026-10-13-infinite-unlimited`, encrypted PostgreSQL,
Redis and provider config with verified primary identity and DPAPI-protected key.
All 35 targeted billing/workspace-limit tests passed. Existing exact-SHA CI was
rechecked green; Railway predeploy verified the schema and all 11 required indexes.

Later the same day, the user requested Growth's 1,000-order display for Infinite
Layers. A complimentary active Growth entitlement was granted to its owner using
a real Stripe customer record and no Stripe subscription, price or expiry. This
database-only update required no additional deployment; unlimited exemptions remain
enabled and plan-based event-log retention is now 30 days. The live billing page
shows Growth / Active, with the standard list price still visible but no charge.

## Previous deployment: 2026-09-30

Approved runtime SHA: `e9ff8c7bf566c02c3be2c5fc2f3ef3dceab1294d` (PRs #19/#20).
Exact-merge CI `36759317445` passed all five gates. Vercel production deployment is
`dpl_4pQTgYYx87aQphu61uh3m7N3Mxv6`; Railway worker deployment is
`7f54c9ef-621d-4e0d-8f25-5fb09c2b122f`. Nineteen migrations, 11 valid required indexes,
zero drift, 12/12 listeners, one active worker fleet. Both health endpoints agree.

The PR #20 cutover drained and stopped the old worker, verified encrypted database,
Redis and provider-config restore points, deployed the exact GitHub source, waited
for old web invocations to finish, and then started the matching worker. Restore
points are under `E:\backups\trackclear\2026-09-30-chatgpt-pre-release` and
`E:\backups\trackclear\2026-09-30-chatgpt-onboarding-fix`; keys are DPAPI-protected.

The final Vercel deployment activates the same code SHA with both user-confirmed
owned accounts in `UNLIMITED_WORKSPACE_USER_IDS`. Railway received the same variable
with `--skip-deploys`; this web-only allowance did not require restarting its worker.
It does not change Stripe or order limits. Keep the exact release pin intact.

The following sections retain older migration/release details for reference.

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

The verifier requires exactly twelve indexes on the expected schema/table, exact
ordered columns and uniqueness, and `indisvalid = indisready = true`. Migration
status alone is not a sufficient concurrent-index gate. The zero-exit schema
diff is also mandatory because an idempotent `IF NOT EXISTS` statement can hide
an incompatible pre-existing object.

An interrupted `CREATE INDEX CONCURRENTLY` can leave the exact index absent,
valid, or invalid while Prisma still records a failed migration. Stop the
rollout, identify the exact failed `idxNN` migration, run `DROP INDEX
CONCURRENTLY IF EXISTS "<exact_index_name>"` for only that migration's index,
mark only that migration rolled back with `pnpm prisma migrate resolve
--rolled-back <name>`, then rerun deploy, status, schema diff, and the twelve-index
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
   database identity, clean migration status, 12/12 indexes, and zero drift.
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
   Prefer Vercel's Create Deployment API with the linked GitHub repository,
   `target: production`, and `gitSource.sha` set to the approved full SHA. This
   makes Vercel fetch tracked source and supply its own Git commit identity.
   Do not upload the everyday working directory: Vercel CLI does not inherit
   `.gitignore`. The repository's `.vercelignore` is an additional safeguard,
   not a substitute for source provenance. A detached worktree CLI deployment
   may omit `VERCEL_GIT_COMMIT_SHA`; never inject that variable to bypass the gate.
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
