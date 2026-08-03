# Track Clear --- Project Status & Audit

Last updated: 2026-08-02 (Track Clear live at exact SHA `20844b3c619fc1affefb5c6031fc01f1dc5b648e` after the Meta/TikTok match-quality release; Mizoke funnel repair live at exact SHA `2b802ee9ac2f32de2321ca17fd073b98e930246c`)

## Build Health

| Metric | Status |
|--------|--------|
| Build (`pnpm build`) | Compiles on local Node 22; release CI enforces a Node 20 standalone build and a Node 24 non-standalone production build |
| Unit tests | 692/692 passing (58 files) on local Node 22 and in the PR #9 release CI Node 20/24 gates at the deployed SHA |
| Integration tests | 62/62 passing (7 files) in live-release CI against PostgreSQL 16/Redis 7; the 2026-08-01 local attempt stopped in setup because loopback PostgreSQL on port 5433 and Redis were unavailable after the workstation restart |
| Migrations | All 17 repository migrations are applied in production, including `20260730_add_internal_analytics_destination`; 11/11 required indexes are valid and Prisma drift is zero |
| TypeScript | `pnpm exec tsc --noEmit` passes cleanly |
| ESLint | Passes with pre-existing `<img>` optimization warnings |
| Production release | Approved SHA `20844b3c619fc1affefb5c6031fc01f1dc5b648e`; Vercel Git deployment disabled; Railway GitHub autodeploy was discovered ENABLED during the 2026-08-02 cutover and must be re-verified in the dashboard; both providers pinned to the production database identity |

## 2026-08-03 Critical: Custom Pixel Delivery Blocked By Denied Web Locks

**Severity: critical, production, silent.** Every normal Shopify Custom Pixel workspace stopped delivering browser events on 2026-07-27, the day the tracking-hardening release shipped the consent-revocation queue. Dirava sent zero PageView/ViewContent/AddToCart/InitiateCheckout for seven days while still taking orders; only webhook Purchases survived. Not deployed yet at the time of writing.

- Root cause: Shopify runs custom pixels in a sandboxed iframe with an **opaque origin**. There `navigator.locks` is present but `navigator.locks.request()` rejects with `SecurityError: Access to the Locks API is denied in this context.` The generated `dk()` helper guarded only synchronous throws (`try{...return navigator.locks.request(LK,f)}catch(e){}`), so the asynchronous rejection escaped, propagated through `rr()`, and hit the single unguarded `await rr()` in `se()` — the statement immediately before the ingest `fetch`. Every event rejected before sending, with no console error because `se()` is invoked fire-and-forget.
- Why it looked like a store problem: the loader, snippet, workspace ID, consent, CSP, and tracker URL were all correct and verified in the live storefront. The failure was entirely inside the shipped tracker.
- Why Mizoke was unaffected: `headless-sdk.ts` does not use Web Locks, and the Hydrogen storefront runs on a real top-level origin.
- Fix: `dk()` now wraps the lock callback so a rejected or synchronously throwing `request()` falls back to a direct call, while a genuine callback failure after the lock was granted still propagates and is never retried. `se()` no longer lets the revocation replay block delivery (`if(!ref)try{await rr()}catch(e){}`), and the fire-and-forget init call carries its own `catch`. Applied to both `/api/pixel/:workspaceId` and legacy `/api/s/:workspaceId`.
- Regression coverage: `tests/unit/pixel-route.test.ts` extracts the shipped `dk()` from both generated scripts and asserts denied-locks fallback, single execution under a granted lock, and no retry when the callback itself fails. 693/693 unit tests pass.
- Diagnosis evidence: production EventLog showed browser sources stopping at `2026-07-27T18:42Z` with webhook Purchases continuing to `2026-08-02`; a live storefront probe reproduced the `SecurityError` and showed the real tracker registering all 7 subscriptions and calling `activate()` while issuing zero fetches.
- Follow-up worth adding: a tracking-health alert for "browser events stopped while webhooks continue", which would have caught this in hours instead of a week.

## 2026-08-02 Meta/TikTok Match-Quality Improvements

**Release state:** live. PR #9 merged to `main` as exact SHA `20844b3c619fc1affefb5c6031fc01f1dc5b648e` after all four release gates passed (Node 20 runtime, Node 24 runtime, Node 20 worker container, PostgreSQL 16 migration rehearsal). Deployed 2026-08-02 ~21:55-21:58 UTC. No Prisma schema change and no `bridge-v1` change were involved, so no store repaste was required.

- Cutover evidence: old worker fleet stopped via `railway down` before the release pin rotated on both providers; Vercel source deployment `tracking-lite-ee1awfd5e` aliased to www.trackclear.io with parsed health JSON reporting `status: "ok"`, `release: "approved"`, and the exact release commit; Railway worker deployment `48142d27-47fc-4226-88df-05c498207eaf` passed the guarded predeploy (migrations verified, 11/11 indexes valid, zero drift), started 11/11 listeners, drained the paused backlog, and continued processing Meta/TikTok jobs with zero errors.
- Cutover deviations, both benign here but material for the next release: (1) Railway GitHub autodeploy was still ENABLED and built the worker from the merge commit immediately, so the new worker went live ~2 minutes before the new web; the release gate passed because the baked commit matched the freshly rotated pin. Verify or disable autodeploy in the dashboard before the next controlled release, and rotate `TRACKCLEAR_PRODUCTION_RELEASE_SHA` before merging to `main`. (2) Two `railway up` CLI deployments (`128f8afd`, `c836cfbd`) failed without going live, consistent with the release gate failing closed on CLI uploads that carry no git commit metadata; the GitHub-triggered deployment is the working path for the worker.

- Checkout contact enrichment now covers TikTok and has a realistic window. The initial InitiateCheckout job for META and TIKTOK is delayed 90 seconds (previously META-only with a 5-second delay that usually expired before shoppers submitted contact info, so the anonymous version was sent). `checkout_contact_info_submitted` re-sends the same event ID to both platforms via `onlyDestinations`, refreshing only unclaimed PENDING rows; the single delivered event per destination carries hashed email/phone.
- Anonymous events now carry an `external_id`. Marketing-consented events propagate `trackclearSessionId` through ingest, queue jobs, retry envelopes, and the webhook Purchase path. Meta receives an `external_id` array (hashed `customerId` plus hashed session ID); TikTok receives hashed `customerId` with a hashed-session-ID fallback. This stitches anonymous funnel events to the identified Purchase.
- Generated pixel and legacy scripts build `contents` arrays (id, quantity, per-unit price) for ViewContent, AddToCart, and InitiateCheckout; browser `fbq` calls pass the same `contents` for catalog matching, and InitiateCheckout `numItems` sums line-item quantities instead of counting lines.
- `_fbp`/`_fbc` validation in the Meta normalizer, generated pixel, legacy script, and headless SDK accepts any numeric subdomain index (`fb.0.`/`fb.2.`), so valid Meta cookies set at other domain depths are no longer discarded and overwritten.
- Verification: 692/692 unit tests (58 files, including 7 new tests for enrichment fan-out, external_id, and cookie validation), `pnpm exec tsc --noEmit` clean, ESLint clean except pre-existing `<img>` warnings, production build compiles. The integration suite was not rerun locally (Docker remains unavailable on this workstation, as first noted 2026-08-01); it must pass in release CI before deployment.
- Out of scope here, tracked as follow-ups: enabling the existing Meta/TikTok browser-ownership modes per workspace (config action, requires confirming no competing pixel owner), Mizoke storefront PageView/ViewContent dispatch and TikTok `_ttp` coverage (Mizoke repository), TikTok `test_event_code` support, and any AddPaymentInfo event expansion (blocked by the five-event scope guardrail and a `bridge-v1` repaste).

## 2026-08-02 Mizoke Funnel Tracking Contract Repair

**Release state:** live. Mizoke PR #5 restored analytics-only AddToCart/InitiateCheckout dispatch, and PR #6 repaired the strict Track Clear proxy contract. Oxygen production workflow `30766182444` deployed current exact SHA `2b802ee9ac2f32de2321ca17fd073b98e930246c`.

- The storefront regression had two independent causes. AddToCart and InitiateCheckout were dispatched only when advertising was allowed, so analytics-allowed/marketing-denied sessions never reached Track Clear. After that gate was corrected, Mizoke's `/api/track` proxy still appended unsupported `requestId`, `ip`, and `userAgent` JSON keys; Track Clear's strict ingest schema rejected the body with HTTP 400 while the proxy returned success to the browser.
- AddToCart and InitiateCheckout now dispatch when either analytics or advertising is permitted. Both-denied remains blocked. TikTok browser dispatch and Meta/TikTok server fan-out remain gated by marketing plus sale/sharing permission.
- The proxy now serializes only `toTrackClearPayload()` output. Client IP and user agent remain server-only in the supported `X-TL-Client-IP` and `X-TL-Client-UA` headers, so no matching signal was removed from eligible advertising delivery.
- Validation passed on Node 22: targeted tracking tests 18/18, full typecheck, production Hydrogen build, 344/344 tests across 82 files, and ESLint with zero errors plus 25 existing warnings. GitHub PR verification independently passed typecheck, lint, unit tests, and production build; it stopped only at the unchanged pre-existing homepage/product client bundle budgets. Those budgets were not relaxed.
- Live analytics-only QA on the One Piece custom-sign page created exactly one `INTERNAL`/`SENT` AddToCart and one `INTERNAL`/`SENT` InitiateCheckout, with zero Meta/TikTok rows and null IP, user agent, fbp, fbc, and ttclid. Checkout reached Shopify, no Purchase was attempted, and the test cart was emptied afterward.
- A separate positive-value signed-webhook Purchase (`39.01 EUR`, one item) reached both Meta and TikTok as `SENT` on 2026-08-02, confirming the canonical Purchase delivery path remained healthy. US geolocation/GPC behavior and a controlled marketing-allowed storefront funnel event remain open live QA.

## 2026-08-01 Location-Aware Consent and Sale/Sharing Enforcement

**Release state:** live. Track Clear PR #6 is deployed to Vercel and Railway at exact SHA `0a2c19e16baa73ece24c39137c091fa6d0b8a582`; the Mizoke consent release from PRs #3 and #4 remains included in the current Oxygen SHA recorded above.

- Mizoke now treats Shopify's Customer Privacy API as the authority for location-aware defaults. With no saved decision, the storefront uses `analyticsProcessingAllowed()`, `marketingAllowed()`, `saleOfDataAllowed()`, and `shouldShowBanner()` instead of inferring rules from a hard-coded country list.
- In regions where Shopify permits tracking before an opt-out, the effective browser state can start enabled without writing a fabricated consent choice. Where Shopify requires opt-in, tracking remains disabled and the custom consent UI appears only when Shopify says a banner is required.
- Explicit shopper choices still call Shopify `setTrackingConsent()`. Reject All, an explicit marketing denial, GPC, or `saleOfDataAllowed=false` blocks Meta/TikTok browser dispatch, Mizoke's Track Clear proxy, Track Clear marketing fan-out, and marketing identifier persistence in cart/session context.
- `saleOfDataAllowed` is accepted by bounded ingest validation, normalized by the headless SDK, written as `_tc_consent_sale_of_data` in cart attribution, retained with its own timestamped Redis tombstone, and reconciled between cart and session consent for signed Shopify Purchase webhooks.
- Backward compatibility is intentional: clients that omit the new field retain the existing STRICT/LAX behavior, but an explicit `false` blocks marketing delivery in both modes.
- First-party analytics remains separate. When analytics is explicitly allowed but advertising is denied, the existing privacy-minimized `INTERNAL` record may preserve sanitized campaign/landing attribution; it does not queue a platform event, retain click IDs/IP/user agent, or consume Purchase billing. Analytics denial records nothing.
- The Mizoke checkout helper no longer forwards stored ad click IDs or Meta/TikTok cookies after advertising permission is denied. UTM context and the opaque Track Clear session anchor can remain for allowed first-party analytics.
- Validation on Node 22: Track Clear TypeScript passed, ESLint passed with only existing image warnings, 685/685 unit tests passed across 58 files, and `pnpm build` succeeded. Release CI passed Node 20/24, PostgreSQL 16/Redis 7 integration (62/62), worker-container, and migration-rehearsal gates. The current Mizoke validation baseline is recorded in the 2026-08-02 repair section above.
- No database migration was required. The encrypted pre-release restore point is `E:\backups\trackclear\2026-08-01-0a2c19e-pre-release\trackclear-production-pre-release.7z`, SHA-256 `17923725B78D5E157E71F248AE5F85C176BF3EEA154DA80F5BFC0D16FF3C51D5`; its password is separately DPAPI-protected and plaintext working files were moved to the Windows Recycle Bin after verification.
- Vercel deployment `D1NVfuLHUYdoSP8AuGPpsCjvgiHa` serves `www.trackclear.io`; public health returned HTTP 200 with release/database/schema/Redis ready at the full approved SHA after the 45-second serverless overlap buffer. Railway deployment `23e538aa-bf26-44f5-aebb-f80bdc729689` was created from the exact GitHub SHA, reported 17/17 migrations current, 11/11 required indexes valid, zero drift, and started all 11 listeners. The earlier CLI-source attempt `4c13b165-700f-419a-9243-c9138c8a0a05` failed closed because provider commit metadata was absent and never became the live worker.
- The first Mizoke Oxygen attempt exposed an SSR-only import failure and was immediately rolled back to the previous healthy SHA. The minimal fix renamed the byte-identical consent helper from a client-only module to an isomorphic module; Oxygen workflow run `30711750195` then deployed exact SHA `87e027abdaa1402988bffe11e70626ee7c36ae03`. Live homepage and product-route checks return HTTP 200, the deployed bundle contains the sale-of-data logic, and a browser smoke rendered `One Piece Custom Sign` with zero console errors.
- Live US geolocation/GPC behavior remains open QA. A positive-value post-release signed-webhook Purchase has since reached both Meta and TikTok; HTTP/render health alone is still not treated as tracking proof.

## 2026-07-30 Privacy-Minimized Internal Attribution

**Release state:** live in production at exact SHA `d09cf963177ccb69e63f59711483c61945587b0b`. PR #4 passed all four release gates, was merged to `main`, and was deployed through a drained exact-SHA cutover.

- When analytics consent is allowed and marketing consent is denied, Track Clear now records an `INTERNAL` EventLog instead of silently losing the event when no analytics destination is eligible. If analytics is also denied, it records nothing.
- Internal rows are terminal first-party records only: no Meta/TikTok or other destination queue, no browser-platform send, no Purchase billing reservation, no retry envelope, and no delivery claim.
- Stored reporting data is limited to sanitized UTM source/medium/campaign/content/term, external referrer hostname, a query-free and identifier-redacted landing path/URL, value, currency, and item count. Raw event/order/session/cart/checkout IDs are represented only by a workspace-scoped SHA-256 event key; email, phone, IP, user agent, ad click IDs, cookies, and payment gateway are null or absent.
- Browser ingest and the canonical signed Shopify webhook both support the internal path. A later consented platform delivery supersedes a matching internal record, and dashboard funnel/campaign queries exclude that superseded row to prevent double-counting.
- Dashboard revenue, funnel, campaigns, Events, and Recent Events include `Internal analytics`. Platform health, conversion accuracy, failure alerts, replay, recovery, and Purchase usage reconciliation explicitly exclude it.
- The additive PostgreSQL enum migration is included in the fail-closed deployment-schema gate and is now applied in production as migration 17/17.
- Validation completed on local Node 22: `pnpm build`, `pnpm exec tsc --noEmit`, Prisma validation, 677/677 unit tests across 58 files, and ESLint with only the existing `<img>` warnings. Release CI passed its Node 20/24, PostgreSQL 16/Redis 7, worker-container, and full migration-rehearsal gates, including the 62/62 integration baseline.
- Fresh encrypted pre-release PostgreSQL/Redis backup: `E:\backups\trackclear\2026-07-30-d09cf96-pre-release\trackclear-production-pre-release.7z`, SHA-256 `DDBFC42F62C64A16D90CD41CC440B5817FFB52100988488EA58910CAC1F40050`; the password is separately DPAPI-protected and plaintext working files were moved to the Windows Recycle Bin after archive verification.
- Vercel deployment `FVQiW8qX8533PaXSGNpV3qqLkScb` serves `www.trackclear.io`; `/api/health` returned HTTP 200 with release approved, database/schema/Redis ready, and the exact full SHA. Railway deployment `e97087a8-6abd-4b74-a817-b5508ca84baf` passed 17/17 migration status, 11/11 index verification, zero drift, `/health`, and started all 11 listeners.
- Live bounded QA created one anonymous Mizoke AddToCart with `analytics=true` and `marketing=false`. It persisted exactly one `INTERNAL`/`SENT` row with sanitized TikTok campaign attribution, null IP/UA/fbp/fbc/ttclid, and zero platform rows. No Purchase was created and no ad-platform call was attempted.

## 2026-07-27 Own-Store Tracking Hardening

**Historical release state:** the exact SHA `a4628c9bd3760fd3e902a8df5680002ced759651` release was superseded by the 2026-07-30 release above after a second controlled cutover. Its QA remains the regression baseline.

- **Durable Shopify intake:** signed webhook bodies are encrypted and inserted into `ShopifyWebhookInbox` before Shopify receives a success acknowledgement. The live request then returns immediately; the one-minute inbox worker owns processing, compare-and-set replay, and bounded backoff. Successful processing erases the payload.
- **Verified webhook gate:** saving a secret is configuration only. Browser Meta Purchase suppression and the server fallback grace period activate only after Track Clear verifies a signed `orders/paid` delivery. Domain or secret changes reset that proof.
- **Atomic delivery outbox:** ingest persists every eligible destination EventLog in one transaction before queueing. Every job uses the deterministic ID `event-<EventLog.id>`, including manual and automatic replay.
- **Purchase race protection:** normalized order-name/order-ID/checkout/cart aliases reconcile webhook-first and browser-first paths per destination. Canonical takeover uses `SUPERSEDED`, a 90-second verified-store fallback grace period (longer than one inbox scan), and a final database delivery claim immediately before external I/O. A canonical Meta row cannot suppress a required TikTok fallback.
- **Lossless Custom Pixel startup:** the generated `bridge-v1` loader uses seven literal Shopify event subscriptions before requesting the remote tracker, holds at most 100 early events in one ordered FIFO, and activates only after every handler is registered. Literal event names are required for Shopify's Custom Pixel editor to validate the subscriptions. The versioned loader URL bypasses stale generated-script cache during repaste rollout.
- **Identity parity:** generated pixel and legacy scripts include `checkout.orderName` in both the browser event ID and ingest custom data, preventing pre-verification browser/server ID divergence.
- **Retry fidelity:** an AES-256-GCM retry envelope preserves the original event for at most 72 hours, is cleared on success/expiry/terminal skip, and lets replay retain click IDs and customer match fields without placing raw PII in the normal EventLog payload.
- **Delivery resilience:** circuit breakers are workspace-and-destination scoped; only transient network/408/425/429/5xx failures count; terminal configuration errors stop automatic retry; scheduled PENDING/RETRYING/FAILED recovery is deterministic and bounded.
- **Consent and attribution:** generated pixels subscribe to Shopify consent updates; explicit denial purges browser/cookie/cart ad identifiers and uses one fail-closed Redis operation to write false consent plus timestamped tombstones across every linked hashed alias. After API-key authentication and strict bounded validation, privacy-minimized no-destination revocations require a session/checkout/cart anchor and pass isolated 120/minute plus 5,000/day workspace budgets before persisting ahead of workspace-active, destination-credential, and generic delivery-rate gates. The fast path uses one opaque anchor, never a predictable order alias, and returns without outbox or queue work; a 429 remains in the client retry queue. Headless clients generate and reuse a fallback session anchor. Custom Pixel, legacy, and headless clients persist at most 20 revocations for 30 days and replay them from 5 seconds up to 5 minutes; dual storage is merged independently and generation-safe settlement prevents an old replay from deleting a newer denial. A stable `trackclear-consent-revocation-v1` Web Lock serializes cross-tab sends where supported; without Web Locks, per-client serialization remains but cross-tab ordering is best-effort. Webhook Purchase chooses the newest bounded cart-or-session consent snapshot, and explicit denial remains authoritative for the full 30-day server-context window instead of aging into LAX allow. Browser/headless latest-touch context is capped at 90 days, and the headless SDK canonicalizes alias consent keys with event-level precedence before sending.
- **Optional browser parity:** Meta and TikTok browser SDK ownership is persisted separately from server destination delivery and is off by default. An enabled owner loads only after consent, emits the exact server `event_id`, supports later revoke/grant, and does not auto-fire TikTok PageView.
- **Duplicate usage safety:** normalized Purchase identities use an atomic Redis reservation so concurrent identical ingests cannot consume usage twice or create a false 402. Hourly reconciliation rebuilds transitive workspace-scoped alias groups, count floors, and every hashed marker (including FREE users without a Subscription row) without lowering concurrent live usage. Purchase abuse throttling runs before the reservation.
- **Privacy disclosure:** the privacy page now documents the short-lived encrypted retry envelope and lossless encrypted webhook intake.
- **Release safety:** concurrent EventLog indexes are each isolated in a one-statement migration, a strict 11-index verifier checks definitions/readiness, missing historical schema is repaired forward-only, and integration tests reset only a loopback `_test` database before applying the committed migrations. Vercel Git deployment is disabled; the Vercel-specific build requires recognized provider environment metadata, prebuilt production deployment is prohibited, and production-mode Edge runtime fails closed even when every Vercel marker is absent. Production still requires the exact approved full SHA. Vercel and Railway require runtime/direct URLs to identify the same writable PostgreSQL database/schema/cluster and match operator-pinned production identity values; Railway additionally requires the exact production environment and runs migrate/status/index/drift checks before activation. `/api/health` returns 503 unless release approval, PostgreSQL identity, required migrations/indexes, and Redis are ready. All 11 BullMQ listeners use `autorun: false`; required recovery schedules register before `run()`, every listener passes `waitUntilReady()`, and a startup latch gates `/health`. Startup failure, fatal process errors, and signals close listeners, their supplied Redis connections, shared Redis, and Prisma through one path with readiness dropped immediately. The 30-second outbound ceiling has a 45-second application drain and 60-second Railway drain. PR gates cover Node 20/24 plus PostgreSQL 16/Redis 7.

### Rehearsal Evidence

- The original eight-file hardening chain upgraded a disposable baseline-shaped PostgreSQL 17.5 database with 50,000 EventLogs and 10,000 Purchases in 3.856 seconds, retaining every row, backfilling every Purchase alias, and leaving historical FAILED deliveries unscheduled.
- The final 16-migration history upgraded a populated baseline with 20,000 EventLogs and 5,000 Purchases in 1.281 seconds, retained all rows and expected backfills, verified 11/11 indexes, and produced no Prisma schema difference. A full empty-database reset through all 16 migrations also finished current with 11/11 indexes and zero drift.
- The guarded plaintext-secret migration rejected an unsafe legacy row, then completed only after a full encrypted replacement was present. A concurrent-index backend was also intentionally terminated; recovery dropped only the exact invalid index, resolved only its failed migration, and redeployed cleanly.
- The integration harness now force-resets only a loopback database ending in `_test`, flushes only loopback Redis DB 1-15 (default 15), truncates all application tables dynamically, and clears shared Redis clients. This prevents a test command from flushing development or production Redis DB 0.
- Local runtime gates passed on Node 20.20.2 and Node 24.18.0. The published PR also passed the Node 20/24, PostgreSQL 16, Redis 7, and worker-container release gates before production.

### Controlled Production Cutover Evidence

- PR checks passed on Node 20/24, PostgreSQL 16, and Redis 7 before `main` was fast-forwarded to the approved SHA.
- The encrypted pre-release PostgreSQL/Redis backup is `E:\backups\trackclear\2026-07-27-a4628c9-pre-release\trackclear-production-pre-release.7z` with SHA-256 `39A20800B6610373A7D82DAAA0AC01CB8216C4CF8A6C8A299E79F2FF12C51AF3`; the archive password is protected separately with Windows DPAPI and plaintext temporary files were removed.
- Railway production deployment `84d5ef69-3822-44f8-be54-0d8f967c1342` passed the exact-environment/SHA gate, applied all migrations, verified 11/11 indexes and zero drift, then started all 11 listeners only after recovery schedules registered and `waitUntilReady()` completed.
- Vercel production deployment `E6FSrYAScp7CayAbatpcNsXTgcwE` passed the exact-SHA/database gate and aliased to `www.trackclear.io`. Live `/api/health` returned HTTP 200 with database, schema, Redis, and release ready at the approved SHA.
- After the bounded drain, all 11 queues were confirmed paused with zero active jobs, then resumed. Mizoke live AddToCart and InitiateCheckout diagnostics both reached Meta and returned to 100% success with zero pending/failed events.
- Dirava publicly serves the required workspace-specific Cart Attribution Helper on the homepage and product page. Its generated production pixel reports Meta/TikTok browser ownership off, verified-webhook gating on, and `VARIANT_NUMERIC_ID` catalog mode.
- Dirava Shopify custom pixel `325222664` was repasted and remains connected. Shopify accepted the corrected loader with no validation error or no-subscription warning; Pixel Helper reported the pixel loaded and received `page_viewed` plus `product_viewed` on the live Harry Potter-inspired product page. The attempted AddToCart did not change the cart, so no AddToCart pass is claimed.

### Post-Release Store QA Still Open

- Repaste the now-live Shopify-validator-compatible literal-subscription loader in stores other than Dirava. Dirava's saved Custom Pixel is already corrected; automatic deployment remains disabled.
- Run a safe Dirava AddToCart canary on a product whose cart submission succeeds, then verify the Track Clear destination result. The first attempted product remained out of the cart, so it produced no valid AddToCart test event.
- Run one explicitly approved controlled paid Dirava order and observe it for 30-60 minutes before expanding store by store.
- Run controlled Dirava regression orders for normal cart, buy-now/direct checkout, returning visitor, and delayed checkout; verify exactly one Meta and one TikTok Purchase per order plus cart-helper attribution.
- Keep both Track Clear browser ownership flags off until every Shopify app/theme/tag-manager pixel targeting the same Meta dataset or TikTok Pixel ID is removed. After changing owners, wait at least the 30-second shared-cache TTL and start a fresh browser session before enabling the replacement; then prove exactly one browser send plus one deduplicated server send for every supported event.
- Verify Meta/TikTok Events Manager UI receipt/dedup and live non-default catalog modes. Existing pending QA templates remain templates, not pass evidence.

Known low-frequency billing caveat: an order reserved immediately before UTC month rollover whose canonical webhook row is first written just after rollover can consume one unit in both months during reconciliation. Correct repair requires durable billing-period ownership, not a risky counter decrement. This is a billing edge rather than a delivery/dedup loss path, and remains intentionally documented because commercial redesign is outside this tracking-only release.

## Production QA Evidence

- Dirava controlled order `#5076` is documented in `docs/qa/dirava-order-5076.md`.
- Dirava cart helper paid order `#5077` is documented in `docs/qa/dirava-cart-helper-test.md`.
- The order proved the canonical Shopify webhook Purchase path for a controlled `0 EUR` order: deterministic Purchase event ID, one Meta and one TikTok EventLog, Meta API acceptance (`events_received: 1`), TikTok API acceptance (`code: 0`, `message: OK`), attribution through Redis session enrichment plus landing-site fallback, and variant-ID `content_ids`/`contents`.
- The order did not prove paid-order revenue propagation because the final Shopify order total was intentionally `0 EUR` after two discount codes.
- Cart/order attribute persistence remains unproven for the Shopify Custom Pixel `/cart/update.js` writer: `_trackclear_session_id` was not present in webhook/order attribution, and the order was enriched through Redis session enrichment rather than cart attributes.
- Order `#5077` proved the storefront Cart Attribution Helper path on a paid `0.5 EUR` order: `/cart/update.js` fired, `/cart.js` verification passed before checkout, webhook Purchase attribution source was `cart_attributes`, `_trackclear_session_id` was present in webhook/order attribution, Meta/TikTok accepted the event, and Shopify/TrackClear/destination payload value matched `0.5 EUR`.
- Normal Shopify V1 now treats the Cart Attribution Helper as part of the required install stack for reliable purchase attribution. The proven path is still one normal-cart paid checkout; buy-now/direct checkout, returning visitor, delayed checkout, live non-default catalog modes, and platform UI visibility remain open QA.
- Pending QA templates now exist for buy-now/direct checkout, returning visitor, delayed checkout, and non-default catalog modes under `docs/qa/`.

## What's Implemented

### Pages (14 routes)

| Route | Type | Status | Notes |
|-------|------|--------|-------|
| `/` | Public | Working | Landing page with hero, pricing, features, scroll animations |
| `/login` | Public | Working | Email/password + Google OAuth |
| `/signup` | Public | Working | Registration with auto-login, sends verification email, redirects to onboarding |
| `/forgot-password` | Public | Working | Sends password reset email via Resend |
| `/reset-password` | Public | Working | Token-based password reset with confirmation |
| `/privacy` | Public | Working | Privacy policy (accurate: IP/UA stored, PII hashing, data retention, GDPR rights) |
| `/terms` | Public | Working | Terms of service (billing, acceptable use, liability, termination) |
| `/dashboard` | Protected | Working | Mode-aware analytics with revenue cards (currency conversion), event funnel, delivery stats, order usage, health badge, conversion accuracy, campaign performance, recent events. Full i18n (6 languages) |
| `/tracking-health` | Protected | Working | Operational status for recent snippet activity, Shopify webhook, Meta/TikTok connection, Purchase, dedup, actionable cart-helper attribution source status, recent errors |
| `/events` | Protected | Working | Mode-aware paginated event log with type/status filters, Source/Campaign columns, retry failed events |
| `/diagnostics` | Protected | Working | Internal mode-aware diagnostics for destination health, event/destination matrix, data quality, event audit fields, and safe non-Purchase test events |
| `/settings` | Protected | Working | Event toggles, consent mode, catalog ID matching, custom ingest domain, snippet, required Cart Attribution Helper install card, alert preferences, language selector, currency selector, danger zone |
| `/integrations` | Protected | Working | Mode-aware setup: V1 shows Shopify webhook + Meta/TikTok, legacy/custom workspaces show all destination cards |
| `/billing` | Protected | Working | Current plan, order usage, 4-tier plan cards, FAQ accordion |
| `/onboarding` | Protected | Working | 3-step wizard: create workspace, install Custom Pixel + Cart Attribution Helper snippets, connect platforms |

### API Routes (core endpoints)

| Endpoint | Methods | Auth | Status | Notes |
|----------|---------|------|--------|-------|
| `/api/auth/[...nextauth]` | ALL | - | Working | NextAuth handler |
| `/api/auth/signup` | POST | - | Working | Zod validation, bcrypt, 409 on duplicate, sends verification email |
| `/api/auth/forgot-password` | POST | - | Working | Generates token, sends email via Resend |
| `/api/auth/reset-password` | POST | - | Working | Validates token, updates password |
| `/api/auth/verify-email` | GET | - | Working | Token-based email verification, sets emailVerified on User |
| `/api/diagnostics` | GET | Session | Working | Internal diagnostics data filtered through workspace destination allowlist |
| `/api/events/ingest` | POST, OPTIONS | API Key | Working | Strict bounded validation, atomic external outbox, deterministic jobs, idempotent Purchase usage, multi-key session enrichment, and no-queue privacy-minimized internal attribution when analytics is allowed but marketing is denied |
| `/api/workspaces` | GET, POST | Session | Working | Plan-limited active workspaces, required store domain, encrypted credentials |
| `/api/workspaces/[id]` | GET, PATCH, DELETE | Session | Working | Ownership verified, soft-delete, destination credentials, product mode/install type read-only from public PATCH, catalog ID settings and custom ingest domain editable |
| `/api/workspaces/[id]/custom-ingest-domain/verify` | POST | Session | Working | Verifies a saved custom ingest domain by checking the public TrackClear marker route through that host |
| `/api/workspaces/[id]/rotate-key` | POST | Session | Working | Generates new API key |
| `/api/workspaces/[id]/replay` | POST | Session | Working | Re-queue failed events (max 500, 5min cooldown), all destinations supported; sanitized rows replay without reconstructing raw PII |
| `/api/workspaces/[id]/analytics` | GET | Session | Working | Dashboard analytics (60s Redis cache, destination filter, currency conversion) |
| `/api/workspaces/[id]/diagnostics/test-event` | POST | Session | Working | Sends safe AddToCart/InitiateCheckout diagnostic events through ingest; Purchase is intentionally unsupported |
| `/api/user/preferences` | PATCH | Session | Working | Update user display currency and language |
| `/api/user/account` | DELETE | Session | Working | GDPR account deletion (cancels Stripe, cascades all data) |
| `/api/alerts/preferences` | GET, PUT | Session | Working | Alert notification preferences CRUD |
| `/api/snippet/[workspaceId]` | GET | Session | Working | Generates the versioned `bridge-v1` loader, synchronously buffers early Shopify events, and uses a verified custom ingest domain as the pixel-loader host when configured |
| `/api/cart-helper/[workspaceId]` | GET, OPTIONS | Public | Working | Storefront theme helper script for durable cart attribution: writes through same-origin `/cart/update.js`, verifies through `/cart.js`, retries once, and stores local non-PII diagnostics |
| `/api/pixel/[workspaceId]` | GET, OPTIONS | Public | Working | Public Shopify Custom Pixel JS with bridge activation, 30-second shared cache, `_trackclear_session_id`, catalog settings, consent-gated optional browser SDKs, and webhook-aware Purchase guard |
| `/api/s/[workspaceId]` | GET | Public | Working | Legacy public pixel JS with 30-second shared cache and the same session/cart attribution, browser ownership, catalog settings, custom ingest URL resolution, and Purchase guard |
| `/api/custom-ingest-domain/check` | GET | Public | Working | Public no-store marker route used by custom ingest domain verification |
| `/api/stripe/checkout` | POST | Session | Working | Creates Stripe checkout session |
| `/api/stripe/portal` | POST | Session | Working | Opens Stripe billing portal |
| `/api/stripe/webhook` | POST | Stripe sig | Working | Handles 5 Stripe event types |
| `/api/health` | GET | - | Working | Fail-closed readiness probe: DB, required migrations/indexes, and Redis with 3s bounds; returns 200 ready or 503 degraded |
| `/api/status` | GET | Session | Working | Auth-gated deep health check: DB + Redis ping with 3s timeout, uptime |
| `/api/webhooks/shopify` | POST | HMAC sig | Working | HMAC-verified orders/paid + refunds/create; encrypted durable inbox before acknowledgement, verified-Purchase gate, alias reconciliation, cart/session attribution, deferred replay |

### Multi-Destination Event Pipeline

Track Clear supports 7 ad/analytics destinations with server-side event forwarding:

| Destination | Events Supported | Auth Method | API |
|-------------|-----------------|-------------|-----|
| Meta CAPI | All 5 | Pixel ID + Access Token | Graph API v21.0 |
| TikTok | All 5 | Pixel ID + Access Token | Events API v1.3 |
| GA4 | All 5 + Refund | Measurement ID + API Secret | Measurement Protocol |
| Klaviyo | ViewContent, AddToCart, InitiateCheckout, Purchase | API Key | Events API |
| Reddit | All 5 | Account ID + Bearer Token | Conversions API v1 |
| Pinterest | All 5 | Ad Account ID + Bearer Token | Conversions API v5 |
| Google Ads | ViewContent, AddToCart, InitiateCheckout, Purchase | Conversion ID + Labels (public) | Pixel Endpoint (server-side GET) |

Each destination has:
- Normalizer + API client in `src/lib/destinations/`
- BullMQ worker in `src/workers/`
- Dedicated queue with 3 retries (exponential backoff)
- Encrypted credential storage (AES-256-GCM) -- except Google Ads (public values, plaintext)
- Settings UI card with enable toggle

### Core Library Modules

| Module | Status | What it does |
|--------|--------|-------------|
| `auth.ts` | Working | NextAuth v5 config (Google + Credentials providers, JWT sessions) |
| `db.ts` | Working | Prisma singleton with hot-reload safety, connection pool limit (configurable via PRISMA_POOL_SIZE), env-aware logging |
| `deployment-database-identity.ts` | Working | Requires runtime/direct URLs to identify the same writable primary and match pinned database/schema/system-ID values without logging credentials |
| `deployment-schema.ts` | Working | Requires the complete hardening migration chain and all 11 valid, ready indexes |
| `production-release-gate.ts` | Working | Enforces exact provider environment metadata and full approved production SHA |
| `utils.ts` | Working | `cn()` utility (clsx + tailwind-merge) |
| `encryption.ts` | Working | AES-256-GCM encrypt/decrypt for all credential storage |
| `hash-pii.ts` | Working | SHA-256 hashing for all PII fields, E.164 phone via phone-normalizer |
| `phone-normalizer.ts` | Working | 55-country prefix map, E.164 normalization, 7-15 digit validation |
| `consent.ts` | Working | STRICT (require explicit consent) / LAX (send unless opt-out) |
| `api-key.ts` | Working | Generate `tl_` + 64 hex chars, format validation |
| `stripe.ts` | Working | Stripe client (API version 2024-12-18.acacia), plan constants |
| `billing.ts` | Working | Atomic alias-aware Purchase reservation plus non-decreasing counter/marker reconciliation, plan limits, and auto-upgrade |
| `constants.ts` | Working | BILLING_PLANS, AUTO_UPGRADE_MAP, PLAN_PRICE_MAP, RATE_LIMIT, QUEUE_CONFIG (7 queues) |
| `meta-capi.ts` | Working | POST to Meta Graph API, MetaCapiError with status/response |
| `event-normalizer.ts` | Working | Converts snippet payload to Meta CAPI format, dual camelCase/snake_case, bounded Meta cookie validation |
| `event-log-payload.ts` | Working | Builds sanitized EventLog payloads with customData, userDataFlags, clickIdFlags, and redacted checkout/cart tokens instead of raw shopper userData |
| `event-delivery-guard.ts` | Working | Serializable Purchase alias election and token-checked worker attempt/accept/settlement ownership |
| `event-replay-queue.ts` | Working | Deterministic replay job construction for all destination workers |
| `event-retry-envelope.ts` | Working | AES-256-GCM short-lived full-fidelity retry payloads with expiry/clear helpers |
| `purchase-event-id.ts` | Working | Builds deterministic Shopify Purchase event IDs for snippet, generated pixel, ingest, and webhook paths, preferring order name when available for browser/webhook convergence |
| `content-id.ts` | Working | Normalizes Shopify catalog content IDs across numeric variant/product IDs, GraphQL IDs, SKU, custom templates, rich direct-ingest contents, and workspace catalog settings |
| `custom-ingest-domain.ts` | Working | Normalizes/validates merchant-owned ingest domains and resolves verified pixel-loader and ingest URLs with safe defaults |
| `workspace-mode.ts` | Working | Nullable product mode/install type fallback, V1 destination allowlist, `LEGACY_WORKSPACE_IDS` emergency bypass |
| `diagnostics-audit-fields.ts` | Working | Computes Diagnostics event-audit field visibility and counts: core fields plus captured optional click/UTM fields relevant to allowed destinations |
| `tracking-health.ts` | Working | Computes Shopify V1 readiness; duplicate delivery health counts only SENT rows and ignores SUPERSEDED aliases |
| `queue.ts` | Working | Lazy BullMQ queues (7 destinations), MetaEventJob + DestinationEventJob interfaces |
| `rate-limit.ts` | Working | Lazy Redis, 100 req/sec/workspace, 2s TTL keys |
| `analytics.ts` | Working | Dashboard analytics with destination deduplication, currency conversion, health, revenue, event breakdown, billing, conversion accuracy, campaign performance |
| `analytics-cache.ts` | Working | Redis caching wrapper for analytics (60s TTL, lazy connection, keyed by destination+currency) |
| `currency.ts` | Working | Exchange rate fetcher (frankfurter.app), Redis-cached 24h, convertCurrency helper |
| `email.ts` | Working | Resend client for password reset, alert emails, and email verification |
| `alerts.ts` | Working | Alert evaluation: tracking down, high error rate, order limit warnings |
| `replay-rate-limit.ts` | Working | Redis cooldown for event replay (5min per workspace) |
| `extract-custom-data.ts` | Working | Extract value/currency/numItems/orderId from customData |
| `destinations/index.ts` | Working | DESTINATION_EVENT_MAP for all 7 platforms |
| `destinations/tiktok.ts` | Working | TikTok normalizer + API client, hashed external_id support, rich contents payloads |
| `destinations/ga4.ts` | Working | GA4 Measurement Protocol normalizer + API client |
| `destinations/klaviyo.ts` | Working | Klaviyo normalizer + API client (raw email, not hashed) |
| `destinations/reddit.ts` | Working | Reddit Conversions API normalizer + API client (Bearer token, SHA-256 hashed PII, rdt_cid click ID) |
| `destinations/pinterest.ts` | Working | Pinterest Conversions API normalizer + API client (Bearer token, SHA-256 hashed PII in arrays, epik click ID, value as string) |
| `destinations/google-ads.ts` | Working | Google Ads pixel endpoint normalizer + client (server-side GET, Enhanced Conversions with SHA-256 PII, Gmail normalization, gclid attribution) |
| `api-key-cache.ts` | Working | Redis-cached workspace lookup (used by ingest route) |
| `circuit-breaker.ts` | Working | Redis-based circuit breaker for destination APIs (5 failures = 60s cooldown) |
| `redis.ts` | Working | Shared Redis singleton (lazyConnect) used by all web app modules — eliminates connection sprawl |
| `logger.ts` | Working | Structured JSON logger (level, msg, timestamp, context) with child loggers |
| `env-validation.ts` | Working | Validates required env vars at startup, warns for optional ones |
| `session-enrichment.ts` | Working | Redis-backed browser context store for webhook Purchase attribution keyed by `_trackclear_session_id`, checkout token, cart token, order ID/name, and email |
| `shopify-webhook.ts` | Working | HMAC-SHA256 signature verification for Shopify webhooks |
| `shopify-domain-resolver.ts` | Working | Resolves and validates Shopify store domains (myshopify.com normalization) |
| `workspace-cache.ts` | Working | Redis-cached workspace lookup by shopifyDomain (used by webhook route) |
| `guide-content.ts` | Working | Setup guide content for all 7 integration platforms + Shopify webhook |
| `tracking-context.ts` | Working | Shared helper for server-proxy client IP/UA extraction and fbclid -> fbc synthesis |
| `shopify-webhook-attribution.ts` | Working | Extracts Shopify order/cart/landing-site attribution, normalizes webhook Purchase URLs, and shapes line-item content IDs/contents |
| `shopify-webhook-inbox.ts` | Working | Encrypted signed-webhook capture, claims, backoff, retention, and inbox/fallback timing constants |
| `shopify-cart-attribution-helper.ts` | Working | Generates the storefront cart attribution helper and exposes tested extraction/write/verify utilities for Shopify cart attributes |
| `headless-sdk.ts` | Working | Headless/Hydrogen helper for URL attribution capture, Meta `_fbp`/`_fbc` cookies, `_trackclear_session_id` creation, Shopify cart attributes, and TrackClear ingest calls |

### Workers (14 files in src/workers/, including shared options)

All 7 destination workers have workspace-scoped circuit breakers, deterministic retry, final delivery ownership, and claim-token guarded terminal writes.

| File | Status | What it does |
|------|--------|-------------|
| `start-worker.ts` | Working | Constructs 11 paused listeners, registers mandatory recovery first, awaits listener readiness, exposes latched health, and drains for 45s inside Railway's 60s window |
| `worker-health.ts` | Working | Requires the startup latch, all 11 running listeners, PostgreSQL, and Redis before returning healthy |
| `meta-event-processor.ts` | Working | Meta CAPI worker: circuit breaker, decrypt, normalize, send, update EventLog |
| `tiktok-event-processor.ts` | Working | TikTok worker: circuit breaker, decrypt, normalize, send, update EventLog |
| `ga4-event-processor.ts` | Working | GA4 worker: circuit breaker, decrypt API secret, normalize, send, update EventLog |
| `klaviyo-event-processor.ts` | Working | Klaviyo worker: circuit breaker, decrypt API key, normalize, send, update EventLog |
| `reddit-event-processor.ts` | Working | Reddit worker: circuit breaker, decrypt Bearer token, normalize, send, update EventLog |
| `pinterest-event-processor.ts` | Working | Pinterest worker: circuit breaker, decrypt Bearer token, normalize, send, update EventLog |
| `google-ads-event-processor.ts` | Working | Google Ads worker: circuit breaker, normalize to pixel params, fire server-side GET, update EventLog |
| `alert-checker.ts` | Working | Hourly repeatable job: evaluates alerts, sends email notifications |
| `stale-pending-requeue.ts` | Working | Every 5min: deterministic PENDING/RETRYING/FAILED recovery; hourly transitive alias usage reconciliation; DLQ cleanup |
| `event-log-cleanup.ts` | Working | Hourly: deletes expired EventLogs per plan retention (7d Free/Starter, 30d Growth/Scale) |
| `shopify-webhook-inbox-worker.ts` | Working | Every minute: processes/replays encrypted signed Shopify deliveries after capture-only live acknowledgement |
| `worker-options.ts` | Working | Shared concurrency, lock-duration, stalled interval, and stalled-count controls |

### Dashboard Analytics Components

| Component | What it shows |
|-----------|-------------|
| `conversion-accuracy.tsx` | Purchase delivery accuracy (7d/30d), sent/failed counts |
| `revenue-cards.tsx` | 3 revenue cards (AddToCart, Checkout, Purchase) with yesterday delta |
| `event-funnel.tsx` | 5-row event funnel with horizontal bars |
| `delivery-stats.tsx` | 24h delivery metrics: success rate, delivered/failed |
| `order-usage-bar.tsx` | Order usage progress bar with plan badge |
| `recent-events.tsx` | Last 10 events mini-table with value column |
| `campaign-performance.tsx` | Top campaigns by revenue with per-platform tabs (30d) |

### Test Coverage

#### Unit Tests (58 files, 677 tests)

Run with `pnpm vitest run`. Hardening-specific suites cover encrypted webhook
capture/replay, delivery claims across every destination, canonical Purchase
alias election, deterministic retry jobs, retry-envelope privacy, consent
tombstones, browser ownership, bounded ingest validation, and billing identity
reconciliation. The executable Vitest result is authoritative for individual
file counts.

#### Integration Tests (7 files, 62 tests)

Run with `pnpm test:integration`. The harness requires isolated loopback
PostgreSQL and a non-zero Redis database; defaults are `trackinglite_test` and
Redis DB 15. It refuses unsafe reset targets.

| Test File | Tests | Covers |
|-----------|-------|--------|
| `ingest.test.ts` | 15 | Full ingest pipeline: auth, billing, event toggles, consent, CORS |
| `workspaces.test.ts` | 15 | Workspace CRUD: list, create, get, update, delete, rotate-key |
| `stripe-webhook.test.ts` | 8 | Stripe webhooks: invalid sig, checkout, subscription events |
| `signup.test.ts` | 5 | Signup: creates user, duplicate email, validation |
| `health.test.ts` | 3 | HTTP 200 with approved exact provider SHA and pinned DB identity when schema/Redis are ready, and HTTP 503 when a required gate is degraded |
| `workspace-uniqueness.test.ts` | 9 | Global Shopify-domain uniqueness, plan-aware setup, soft-delete reuse |
| `tracking-hardening.test.ts` | 7 | Real PostgreSQL/Redis/BullMQ webhook durability, atomic consent denial, 30-day denial retention, serializable Purchase election, alias billing, compensation, and deterministic job reuse |

### Database Schema

**12 models:** User, Account, Session, VerificationToken, PasswordResetToken, Workspace, EventLog, ShopifyWebhookInbox, Subscription, AlertPreference, AlertLog, WebhookDeadLetter

**11 enums:** Platform, WorkspaceProductMode, WorkspaceInstallType, CatalogIdMode, EventName (5 events + Refund), EventStatus, ConsentMode, BillingPlan, SubscriptionStatus, Destination (META/TIKTOK/GA4/KLAVIYO/REDDIT/PINTEREST/GOOGLE_ADS), ShopifyWebhookInboxStatus

**Workspace tracking fields:** product mode/install type, signed Shopify webhook verification/last-received timestamps, explicit-off-by-default Meta/TikTok browser ownership flags, catalog ID mode/prefix/suffix/template, and optional custom ingest domain with verified/last-check/last-error metadata.

**Key indexes:** Existing workspace/event indexes plus EventLog retry schedule, delivery-claim, order-name, checkout-token, and cart-token indexes; ShopifyWebhookInbox unique delivery identity plus status/next-attempt and workspace/created indexes. New EventLog indexes are created concurrently in the hardening migration.

---

## Known Bugs

- A Purchase reserved just before a UTC month boundary whose canonical webhook row is first written after rollover can consume one usage unit in both months. Destination delivery remains single-owner and lossless; a correct billing fix needs durable billing-period ownership.

---

## Dead Code & Unused Dependencies

### Dead Code

None currently tracked.

### Unused npm Dependencies

| Package | Issue |
|---------|-------|
| `@radix-ui/react-dropdown-menu` | No component file, not imported |
| `@radix-ui/react-select` | No component file, not imported |
| `@radix-ui/react-tabs` | No component file, not imported |
| `@radix-ui/react-toast` | Sonner used instead, not imported |
| `next-themes` | No ThemeProvider rendered, not imported |

---

## Feature Expansion History

### Phase 1: Quick Wins (2026-02-19)
1. **Event Replay** - Retry failed events from events page (bulk or per-event, 5min cooldown). Replay is privacy-preserving after EventLog sanitization and does not reconstruct removed raw PII.
3. **Conversion Accuracy** - Purchase delivery accuracy dashboard (7d/30d)
4. **Password Reset** - Working password reset via Resend email service

### Phase 2: Multi-Destination (2026-02-19)
1. **Architecture Refactoring** - Fan-out pipeline, per-destination queues, Destination enum
2. **Google Ads** - Conversion API integration with offline upload
3. **TikTok** - Events API integration with ttclid capture in snippet

### Phase 3: Ecosystem (2026-02-19)
1. **GA4** - Measurement Protocol integration for server-side Google Analytics
2. **Klaviyo** - Server-side events for email/SMS automation (raw email, not hashed)
3. **Email Alerts** - Proactive notifications for tracking health, error rates, order limits

### Phase 4: Attribution & Reliability (2026-02-19)
1. **UTM Parameter Capture** - Snippet captures utm_source/medium/campaign/content/term from landing page URL, stored on EventLog
2. **gclid Capture** - Google Click ID captured from URL params alongside UTMs
3. **Campaign Performance Dashboard** - Top campaigns by revenue with per-platform tabs, Source/Campaign columns on events page
4. **Stale Pending Auto-Requeue** - BullMQ job every 5min re-queues PENDING events older than 5min to destination queues

### Phase 5: Analytics Fix, Currency & i18n (2026-02-19)
1. **Analytics Deduplication** - Fixed double-counting bug where multi-destination fan-out inflated all metrics 2-5x. Uses canonical destination filtering to deduplicate "All" view
2. **Per-Destination Tabs** - Dashboard tabs for All + each enabled destination. Filters analytics to show per-platform stats
3. **Currency Display & Conversion** - User-selectable display currency in settings. Exchange rates from frankfurter.app API cached 24h in Redis. Revenue cards and campaign performance show converted values
4. **Internationalization (6 Languages)** - Full i18n with next-intl v4. Languages: English, Portuguese, Spanish, French, German, Italian. Cookie-based locale, language selector in settings, ~250 translation keys per language
5. **User Preferences API** - New PATCH `/api/user/preferences` endpoint for display currency and language. `displayCurrency` and `language` fields added to User model

### Phase 6: Onboarding Redesign (2026-02-20)
1. **Onboarding Redesign** - 3-step wizard updated: Create Workspace, Install Snippet, Connect Platforms. Removed Meta credential fields from onboarding flow.
2. **enableMeta Toggle** - Added `enableMeta Boolean @default(true)` field to Workspace model. Meta now has a toggle like all other destinations for consistency.
3. **react-icons Dependency** - Added react-icons 5.5.0 for brand icons in settings and onboarding.
4. **Translation Structure** - Added `onboarding` namespace (~36 keys) to all 6 language files (EN, PT, ES, FR, DE, IT).

### Phase 7: Destination Swap — Reddit & Pinterest (2026-02-21)
1. **Google Ads Removed** - Google Ads used the browser pixel endpoint server-side, which silently failed without returning errors. Removed entirely to avoid misleading merchants.
2. **Reddit Conversions API** - New destination using Bearer token auth. SHA-256 hashed PII (email, phone). Captures `rdt_cid` (Reddit click ID) from snippet URL params.
3. **Pinterest Conversions API** - New destination using Bearer token auth. SHA-256 hashed PII passed in arrays per Pinterest schema. Captures `epik` (Pinterest click ID) from snippet URL params. Revenue value sent as string per API requirement.
4. **Snippet Updated** - Now captures `rdtCid` and `epik` alongside existing `ttclid`, `gclid`, and UTM params.
5. **Event Replay — All Destinations** - Replay route previously only supported Meta. Now supports all 6 destinations.
6. **Test Suite Expanded** - Unit tests grown from 239 to 263 (added Reddit and Pinterest normalizer/client tests).

---

## Billing Model

**Order-based billing** (migrated 2026-02-18)

| Plan | Price | Monthly Orders | Auto-Upgrade To |
|------|-------|---------------|-----------------|
| FREE | $0 | 50 | -- (blocked at limit) |
| Starter | $29 | 500 | Growth |
| Growth | $49 | 1,000 | Scale |
| Scale | $99 | 5,000 | -- (contact us) |

- Only **Purchase** events count toward limits. All other events are free and unlimited.
- Free plan: no credit card required. Purchase forwarding blocked at limit.
- Paid plans: auto-upgrade to next tier via Stripe subscription update when limit exceeded.
- Active workspace limits are 1/3/5/unlimited for Free/Starter/Growth/Scale; the order pool remains shared per user.

### Phase 8: Production Readiness (2026-02-21)
1. **Content-Security-Policy** - CSP header added to next.config.mjs (script-src, connect-src for all 6 platforms + Stripe)
2. **Account Deletion API** - DELETE /api/user/account endpoint for GDPR compliance (cancels Stripe, cascades all data)
3. **Email Verification** - Verification email sent on signup, GET /api/auth/verify-email endpoint, VerificationToken model
4. **Circuit Breaker** - Redis-based circuit breaker for all 6 destination workers (5 consecutive failures = 60s cooldown)
5. **Privacy & Terms Pages** - /privacy and /terms pages with accurate legal content (IP/UA storage, PII hashing, data retention)
6. **Database Indexes** - Added composite indexes for dashboard and analytics query performance
7. **Request ID Tracking** - X-Request-ID header on ingest success responses for observability
8. **Env Validation** - Extended to validate NEXTAUTH_SECRET, warn for optional vars (Stripe, Resend, App URL)

### Phase 9: Production Hardening (2026-02-23)
1. **Smart Health Check** - `/api/health` checks DB, the required migration/index set, and Redis with bounded probes; current release behavior returns HTTP 200 only when ready and HTTP 503 when degraded
2. **Auth-Gated Status Endpoint** - `/api/status` for authenticated deep health checks, uses shared Redis (no per-request connection)
3. **Sentry Worker Integration** - `@sentry/node` added to worker process (start-worker.ts) with conditional init, exception capture in uncaughtException/unhandledRejection handlers, flush on shutdown
4. **Redis Connection Consolidation** - Eliminated 4 remaining IORedis singletons (stripe/webhook, stripe/checkout, currency.ts, status route) — all web app modules now use shared `getSharedRedis()` from `src/lib/redis.ts`
5. **Prisma Connection Pool Limit** - `connection_limit` (configurable via `PRISMA_POOL_SIZE` env var, default 10) + `pool_timeout=10s` added to prevent connection exhaustion and indefinite hangs
6. **Worker Memory Management** - `NODE_OPTIONS="--max-old-space-size=512"` added to Dockerfile.worker for bounded heap usage
7. **Structured Logging** - All route handlers and workers use `createLogger()` for JSON-structured log output
8. **Quality Principle** - Added to CLAUDE.md: "Never apply half measures" directive for all future development

### Phase 10: Shopify Webhook Integration (2026-02-24)
1. **Shopify Order Webhook** - `POST /api/webhooks/shopify` handles `orders/paid` and `refunds/create` topics. HMAC-SHA256 verification with encrypted webhook secret. Session enrichment bridges browser context (fbp, fbc, ttclid, rdtCid, epik) to webhook events.
2. **Webhook UI Card** - Integrations page shows Shopify Webhook card with copyable webhook URL, signing secret input, and 3-step setup guide. Full i18n (6 languages, ~14 keys).
3. **Refund Support** - `Refund` added to EventName enum. GA4 receives refund events. Refund amount stored on EventLog. Billing gives back order count on refund.
4. **Dead-Letter Queue** - Postgres-backed WebhookDeadLetter table for failed webhook processing. PII redacted before storage. 30d/90d retention policy.
5. **Webhook Rate Limiting** - Atomic Redis Lua script rate limiter (100 req/min per shop domain), placed after HMAC verification to prevent unauthenticated DoS.
6. **Session Enrichment Store** - Redis hashes linked across session/checkout/cart/order/email identifiers bridge browser context to webhooks. Context is retained for at most 30 days with per-field bounds; consent grants expire after 24 hours and explicit denials remain authoritative for 30 days.
7. **PayPal Order Fix** - Added `paypal` to ALLOWED_SOURCES (PayPal orders were silently dropped by source filter).
8. **Billing Order Fix** - Moved billing INCR in ingest route to after dedup/toggle/consent checks (prevented phantom billing where orders counted but no EventLog created).
9. **Revenue Status Fix** - Revenue aggregation now includes PENDING/RETRYING events (not just SENT), so revenue appears immediately on ingest.
10. **Production Hardening** - Encrypted webhook secret (AES-256-GCM), Stripe webhook returns 200 for permanent failures, JWT 7-day maxAge, PAST_DUE 7-day grace period, API key format validation, sanitizeForJs hardening, GDPR Redis session cleanup, order count reconciliation.

### Phase 11: Google Ads Server-Side Conversion Tracking (2026-03-02)
1. **Google Ads Pixel Endpoint** - New 7th destination using server-side GET requests to `googleadservices.com/pagead/conversion/`. No OAuth or developer token needed -- Conversion ID and Labels are public values (visible in page source of any gtag.js site).
2. **4 Events Supported** - Purchase (primary conversion), AddToCart, InitiateCheckout, ViewContent (secondary/micro-conversions). PageView and Refund not supported by Google Ads.
3. **Enhanced Conversions** - SHA-256 hashed PII sent via `em` parameter (email, phone, name, city, state, zip, country). Gmail-specific normalization strips dots and +suffix from local part before hashing.
4. **gclid Attribution** - Google Click ID (already captured by snippet) forwarded for conversion attribution matching.
5. **Order Deduplication** - `oid` parameter sends orderId, matching what browser gtag.js sends. Google deduplicates server + browser conversions automatically.
6. **No Encryption Needed** - Unlike other destinations, Google Ads Conversion ID and Labels are public values stored in plaintext (not encrypted).
7. **Full Pipeline Integration** - Worker, queue, ingest fan-out, webhook fan-out, stale requeue, diagnostics, settings UI card, onboarding, i18n (6 languages), setup guide.
8. **Unit Tests** - 34 tests covering normalizeEmailForGoogle(), normalizeToGoogleAdsParams(), sendToGoogleAds(), and GoogleAdsApiError.

### Phase 12: Mizoke/TrackClear Attribution Hardening (2026-05-21)
1. **fbclid -> fbc Synthesis** - Ingest now accepts `fbclid`, `gbraid`, and `wbraid`; when `fbc` is missing but `fbclid` exists, TrackClear builds `fb.1.<timestamp_ms>.<fbclid>` and stores/passes the resolved `fbc`.
2. **Server Proxy IP/UA Pass-Through** - Ingest now prefers server-only `X-TL-Client-IP` and `X-TL-Client-UA` headers over generic proxy headers, without adding those headers to the browser CORS allow-list.
3. **Bounded _fbp Robustness** - Meta `_fbp` validation now accepts `fb.1.<timestamp_ms>.<random>` values with 7-20 numeric random digits in the server normalizer and generated pixel scripts.
4. **Webhook Purchase Enrichment** - Shopify `orders/paid` webhook now extracts cart/order attributes such as `_fbp`, `_fbc`, `_fbclid`, `_gclid`, `_ttclid`, `_rdt_cid`, `_epik`, and `utm_*` before falling back to session enrichment or landing-site query params. Landing-site `fbclid` is synthesized into `fbc` only after stronger order/session/landing `fbc` values are absent. Relative `landing_site` values are normalized to absolute store URLs so webhook Purchase `event_source_url` stays Meta-compatible when session context is unavailable.
5. **Richer Purchase Payloads** - Webhook Purchases now include variant-first `content_ids`, `content_type: "product"`, and `contents` with quantity and item price where Shopify provides them.
6. **Session Enrichment Before Webhook Skip** - Snippet Purchase events for webhook-enabled workspaces now store browser context before returning `webhook_active`, so later Shopify webhooks can recover checkout attribution.
7. **Webhook Purchase Dedup Guard** - For workspaces with a Shopify webhook secret configured, generated `/api/pixel/:workspaceId` and legacy `/api/s/:workspaceId` scripts suppress browser `fbq("track", "Purchase")` while still sending TrackClear Purchase context to ingest.
8. **EventLog Payload Privacy** - Snippet-created EventLog rows now store sanitized `customData`, `userDataFlags`, and `clickIdFlags` instead of raw email, phone, name, address, or customer ID. Queue jobs still receive transient raw userData for Meta/TikTok delivery. Replay keeps sanitized custom data and attribution columns but does not reconstruct removed raw PII.
9. **Shopify Meta+TikTok V1 Product Mode** - Added nullable `Workspace.productMode` and `installType`, defaulted new workspaces to `SHOPIFY_META_TIKTOK_V1` + `SHOPIFY_CUSTOM_PIXEL`, treated null/existing workspaces as `LEGACY_ALL_DESTINATIONS` + `HEADLESS_CUSTOM`, and committed an idempotent Prisma migration for the schema change.
10. **Mode-Aware Destination Allowlist** - V1 workspaces are limited to Meta/TikTok in integrations UI, onboarding, ingest, Shopify webhooks, replay, dashboard analytics, and events. Legacy/custom workspaces keep all configured destination behavior including `onlyDestinations` and `excludeDestinations`.
11. **Product Mode Guardrails** - Public workspace PATCH requests reject `productMode` and `installType`, server-rendered UI resolves mode through the same helper as backend fan-out, and `LEGACY_WORKSPACE_IDS` remains available as an emergency bypass.
12. **Tracking Health Page** - Added `/tracking-health` for V1 readiness: recent snippet event activity, webhook active/Purchase received, Meta/TikTok connection, dedup status, attribution context, and recent errors. The snippet check is intentionally named as event activity, not a pixel-install heartbeat.
13. **V1 Product Copy** - Public landing/pricing/OpenGraph copy now describes Shopify purchase tracking for Meta + TikTok and no longer advertises hidden 7-platform, annual-pricing, or unproven delivery-rate claims for new users.
14. **Production Legacy Protection** - Production migration `20260521_add_workspace_product_mode` was applied, `LEGACY_WORKSPACE_IDS` was set in Vercel Production, and Mizoke workspace `cmo1hd1x600045r6d9elaw3tg` was explicitly marked `LEGACY_ALL_DESTINATIONS` + `HEADLESS_CUSTOM`; null existing workspaces still resolve to legacy/custom.
15. **Events Replay Count Filtering** - The Events page failed-count/replay note now uses the same workspace destination allowlist as the visible event table, so V1 workspaces do not surface hidden legacy destination failures.
16. **Regression Tests** - Added focused unit tests for header precedence, fbc synthesis, order/landing attribution extraction, line-item payload shape, ingest propagation, event-normalizer cookie bounds, generated pixel Purchase guards, EventLog payload sanitization, workspace-mode fallback, V1 allowlisting, Shopify webhook fan-out filtering, Events page failed-count filtering, public PATCH mode immutability, and legacy destination preservation.

### Phase 13: Maximum Tracking Quality Sprint 1 (2026-05-22)
1. **Deterministic Shopify Purchase IDs** - Generated pixel scripts, ingest, and Shopify webhooks now use `shopify-purchase:<workspaceId>:<order|checkout|cart>` where Shopify order, checkout, or cart identifiers are available. Order name is preferred when present so browser checkout events with only `order.name` converge with webhook payloads that also include numeric order IDs; GraphQL and numeric order IDs normalize to the same fallback segment.
2. **Normalized Catalog Content IDs** - Added shared content ID helpers and applied them to generated pixel payloads, ingest customData, and Shopify webhook line items. The default is Shopify variant numeric ID, with product numeric ID and SKU fallbacks; helper support exists for GraphQL ID, SKU, and custom template modes.
3. **Richer TikTok Payloads** - TikTok Events API payloads now hash `customerId` into `external_id` when available and prefer rich `contents` with quantity/item price over flat content IDs.
4. **Token-Safe EventLog Payloads** - Sanitized EventLog payloads now redact checkout and cart tokens from stored `customData`; queue jobs still receive transient event data for delivery.
5. **Regression Tests** - Added focused tests for deterministic Purchase IDs, content ID normalization, TikTok external_id/rich contents, generated pixel output, ingest normalization, and Shopify webhook event IDs.

### Phase 14: Maximum Tracking Quality Sprint 2 (2026-05-22)
1. **TrackClear Session ID** - Generated pixel scripts now create and persist `_trackclear_session_id` and include it on ingest payloads, giving webhook Purchases a stable non-PII browser-session join key.
2. **Cart Attribute Attribution Writer** - Generated public and legacy pixel scripts best-effort preserve `_trackclear_session_id`, Meta/TikTok/Google/Reddit/Pinterest click IDs, UTMs, landing page, and consent markers into Shopify cart attributes during add-to-cart and checkout-start. This is intentionally additive and preserves existing cart attributes where the Custom Pixel sandbox allows cart mutation.
3. **Multi-Key Session Enrichment** - Ingest now stores browser context under TrackClear session ID, checkout token, cart token, Shopify order ID/name, and email. The Shopify webhook lookup checks all available identifiers and merges fresh fields, reducing dependency on email-only enrichment.
4. **Webhook Attribution Source Visibility** - Shopify webhook EventLog payloads now record sanitized attribution source metadata (`cart_attributes`, `session_enrichment`, `landing_site`, or `none`), consent markers, and TrackClear session presence without storing raw shopper PII or raw tokens.
5. **Tracking Health Source Breakdown** - `/tracking-health` now reports recent webhook Purchase attribution source counts, making it easier to see whether Purchases are being enriched by cart/order attributes, Redis session enrichment, landing-site fallback, or no attribution source.
6. **Regression Tests** - Added `session-enrichment.test.ts` and expanded ingest, webhook attribution, webhook route, pixel route, and EventLog payload tests for session IDs, cart attributes, consent markers, attribution source metadata, and token redaction.

### Phase 15: Diagnostics Mode-Aware Field Visibility (2026-05-22)
1. **Diagnostics Destination Filtering** - `/api/diagnostics` now selects workspace product mode/install type and applies `getAllowedDestinationsForWorkspace()` to destination health, event coverage, matrix, data quality, failures, stuck events, and audit queries. Shopify V1 workspaces see Meta/TikTok diagnostics only; legacy workspaces retain all allowed destinations.
2. **Captured Field Counts** - `/diagnostics` event audit rows now count core fields plus optional click/UTM fields only when those optional values are actually captured and relevant to an allowed destination. This prevents clean V1 orders from showing misleading missing Reddit/Pinterest/Google or absent campaign-click fields.
3. **Event-Specific Audit Fields** - Order ID remains core for Purchase audits but is hidden for AddToCart/InitiateCheckout unless captured, so non-Purchase event completeness is not penalized by impossible order fields.
4. **Regression Tests** - Added `diagnostics-audit-fields.test.ts` and `diagnostics-route-mode.test.ts`.

### Phase 16: Tracking Quality Sprint 3 (2026-05-22)
1. **Catalog ID Settings** - Added `CatalogIdMode` and workspace catalog ID fields for variant numeric, product numeric, Shopify GraphQL IDs, SKU, prefix/suffix, and custom templates. Settings can update these fields while product mode/install type remain internal-only.
2. **Catalog-Aware Delivery Paths** - Generated `/api/pixel/:workspaceId`, legacy `/api/s/:workspaceId`, ingest normalization, and Shopify webhook Purchase contents all apply the same workspace catalog ID settings.
3. **Diagnostics Live Validation** - `/diagnostics` now includes safe non-Purchase AddToCart and InitiateCheckout validation buttons, backed by `POST /api/workspaces/:id/diagnostics/test-event`. Purchase diagnostics remain blocked to avoid fake order signals.
4. **Diagnostics Field Clarity** - Event audit rows label fields as Core or Optional and show optional click/UTM counts separately so 8/8 vs 14/14 is understandable.
5. **Consent Mapping Hardening** - Google Ads is explicitly treated as a marketing destination for STRICT/LAX consent filtering.
6. **Headless/Hydrogen Helper** - Added `headless-sdk.ts` and `docs/headless-shopify.md` for URL attribution capture, `_fbp`/`_fbc` cookie maintenance, Shopify cart attributes, and TrackClear ingest calls from custom storefronts.
7. **TypeScript Cleanup** - Removed the previous test-only top-level-await TypeScript failure in `meta-event-processor.test.ts`; `pnpm exec tsc --noEmit` now passes cleanly.
8. **Regression Tests** - Added `diagnostics-test-event-route.test.ts` and `headless-sdk.test.ts`, and expanded pixel, content-ID, webhook-attribution, ingest-attribution, consent, workspace route, and Meta worker tests.

### Phase 17: Custom Ingest Domain (2026-05-22)
1. **Workspace Custom Domain Fields** - Added nullable `customIngestDomain`, `customIngestDomainVerifiedAt`, `customIngestDomainLastCheckedAt`, and `customIngestDomainLastError` fields with a unique domain constraint.
2. **Verified Endpoint Resolution** - Generated snippets use `https://<custom-domain>/api/pixel/:workspaceId` only after verification; generated `/api/pixel` and legacy `/api/s` scripts use `https://<custom-domain>/api/events/ingest` only after verification. Unverified and unset workspaces continue using the existing TrackClear defaults.
3. **Domain Verification Route** - Added public `GET /api/custom-ingest-domain/check` and protected `POST /api/workspaces/:id/custom-ingest-domain/verify`; failures clear verification and store the latest error.
4. **Settings UI** - Added a Custom Ingest Domain card with DNS target guidance, status, active endpoint, last checked time, save, and verify controls.
5. **Docs and Tests** - Added `docs/custom-ingest-domain.md`, updated the deployment runbook for the new migration, and added tests for helper behavior, snippet host selection, pixel ingest URL selection, workspace PATCH validation, and verification route behavior.
6. **Production Migration** - Applied `20260522_add_custom_ingest_domain` to the production Railway Postgres database before deployment.
7. **Dirava Managed Setup Removed** - The unverified `t.dirava.com` setting was cleared from Dirava and the temporary Vercel `dirava.com` domain entry was removed. Dirava continues using the default TrackClear ingest URL.

### Phase 18: Purchase ID Convergence Hardening (2026-05-23)
1. **Order-Name-First Purchase Identity** - `purchase-event-id.ts`, generated `/api/pixel/:workspaceId`, and legacy `/api/s/:workspaceId` now prefer Shopify order name before numeric/GraphQL order ID when order name is available. This reduces browser/webhook Purchase ID divergence when Shopify exposes `order.name` in checkout events and both `id` plus `name` in webhooks.
2. **Order ID Normalization Confirmed** - GraphQL order IDs such as `gid://shopify/Order/987654321` and numeric webhook IDs normalize to the same deterministic segment.
3. **Checkout Token Fallback Documented** - Browser Purchases that only have checkout/cart token identity intentionally keep a checkout/cart-token-based event ID. They cannot deduplicate against a later order-name webhook ID unless Shopify exposes order identity in the browser event; webhook-enabled workspaces still suppress browser `fbq("track", "Purchase")` to avoid Meta browser/server mismatches.
4. **Regression Tests** - Expanded `purchase-event-id.test.ts` and `pixel-route.test.ts` to cover order-name convergence, GraphQL/numeric order convergence, checkout-token-only fallback behavior, and generated pixel priority.

### Phase 19: Catalog And Headless Hardening (2026-05-23)
1. **Direct Ingest Catalog Settings** - `normalizeCustomDataContentIds()` now uses rich item/root fields such as `variantId`, `productId`, GraphQL IDs, SKU, and country when applying workspace SKU/custom catalog modes to direct or headless ingest payloads.
2. **Webhook Catalog Regression Coverage** - Shopify webhook Purchase tests now assert workspace SKU and product-numeric catalog modes flow into EventLog payloads and queued destination jobs.
3. **Headless Session Helper** - `headless-sdk.ts` now exposes `ensureTrackClearSessionId()`, which reuses or creates `_trackclear_session_id`, persists it to localStorage and/or cookies when available, and remains safe when called without browser storage.
4. **Headless Docs Updated** - `docs/headless-shopify.md` now uses `ensureTrackClearSessionId()` for TrackClear ingest and Shopify cart attributes instead of assuming each storefront implements its own session ID storage.
5. **Branch Deployment Cleanup** - GitHub default branch is now `main`. Vercel production deployment exposes the `git-main` alias, Railway worker status is attached to `main` commits, and `master` was fast-forwarded to `main` before the default branch was changed.

### Phase 20: Dirava Controlled Order QA (2026-05-23)
1. **Controlled Real Order Evidence** - Added `docs/qa/dirava-order-5076.md` for Dirava order `#5076`, including the test URL, zero-value discount context, deterministic Purchase event ID, EventLog IDs, destination API response summaries, attribution source, content IDs, and limitations.
2. **Canonical Purchase Path Result** - The order proved webhook receipt/processing, deterministic event identity, Meta/TikTok fan-out, destination API acceptance, browser Purchase suppression, session enrichment, landing-site fallback, and default variant-ID Purchase contents for one controlled `0 EUR` order.
3. **Revenue Proof Still Required** - Because the order total was intentionally `0 EUR`, a paid non-zero order is still required before claiming revenue propagation is proven end to end.
4. **Cart Attribute Persistence Still Unproven** - `_trackclear_session_id` was absent from webhook/order attribution for this order. The current `/cart/update.js` writer remains best-effort until a test captures request firing, cart attribute presence before checkout, and final webhook/order attribute persistence.

### Phase 21: Shopify Cart Attribution Helper (2026-05-23)
1. **Storefront Helper Route** - Added public `GET /api/cart-helper/:workspaceId` for a Shopify theme-installed helper script that runs in the normal storefront context rather than the Customer Events Custom Pixel sandbox.
2. **Durable Cart Attribute Writes** - The helper creates/reuses `_trackclear_session_id`, reads Meta cookies, click IDs, UTMs, landing page, and Shopify customer privacy consent where available, writes TrackClear attribution attributes through same-origin `/cart/update.js`, verifies with `/cart.js`, and retries once if verification misses expected attributes.
3. **Early/Repetitive Timing** - The helper writes on page load/pageshow, add-to-cart submit/click, detected cart mutations through `fetch`/`XMLHttpRequest`, before checkout navigation, and pagehide. It does not block checkout.
4. **Local Diagnostics** - The helper stores `_tc_cart_attr_last_ok`, `_tc_cart_attr_last_checked_at`, and `_tc_cart_attr_missing` in localStorage. Debug mode is enabled with `?trackclear_debug=1` or `localStorage.setItem("trackclear_debug", "1")`.
5. **Settings Install Card** - Settings now has a dedicated Cart Attribution Helper card with the workspace-specific `<script async src=".../api/cart-helper/:workspaceId"></script>` snippet and install instructions for `theme.liquid` before `</head>` or a Custom Liquid/theme app block equivalent.
6. **Privacy Guardrail** - The helper only writes attribution/session/click/consent fields. It does not write raw email, phone, name, address, customer ID, or full customer data to cart attributes.
7. **Public Middleware Allowlist** - Added `/api/cart-helper/:workspaceId` to the middleware public-route allowlist so Shopify themes can load the helper without an authenticated dashboard session.
8. **Docs and Tests** - Added `docs/shopify-cart-attribution-helper.md`, `cart-helper-route.test.ts`, `shopify-cart-attribution-helper.test.ts`, and `middleware-public-routes.test.ts`.

### Phase 22: Dirava Cart Helper Paid QA (2026-05-23)
1. **Paid Order Proof** - Dirava order `#5077` was a paid `0.5 EUR` order. TrackClear EventLog value and destination payload value matched `0.5 EUR`.
2. **Cart Attribute Proof** - User-provided debug console evidence showed the storefront helper loaded, reused `_trackclear_session_id`, wrote through `/cart/update.js`, verified through `/cart.js`, and reported cart update verified before checkout.
3. **Webhook Attribution Source** - The Shopify webhook Purchase EventLog used `attributionSource: "cart_attributes"` with `_trackclear_session_id` present and attribution sources `cart_attributes`, `session_enrichment`, and `landing_site`.
4. **Destination Acceptance** - Meta returned `events_received: 1` with no messages, and TikTok returned `code: 0`, `message: OK`.
5. **Permanent QA Artifact** - Added `docs/qa/dirava-cart-helper-test.md`.

### Phase 23: Normal Shopify Install Hardening (2026-05-23)
1. **Cart Helper Required Copy** - Settings now labels the Cart Attribution Helper as required for reliable Shopify purchase attribution, not an optional enhancement.
2. **Onboarding Install Stack** - Onboarding now gives merchants both snippets: Shopify Customer Events / Custom Pixel and the Cart Attribution Helper for theme/storefront context.
3. **Install Checklist Updated** - Onboarding and docs now define the normal Shopify V1 install standard as Custom Pixel, Shopify webhook, Cart Attribution Helper, Meta credentials, TikTok credentials, test AddToCart, and test webhook Purchase.
4. **Actionable Tracking Health** - `/tracking-health` now classifies recent webhook Purchase attribution as excellent when `cart_attributes` are present, warning when Purchases only use session enrichment or landing-site fallback, and error when no attribution context is present.
5. **Regression Tests** - Added `tracking-health.test.ts` coverage for the cart-helper attribution health states.
6. **Validation** - `pnpm test -- --run` passed 443/443, `pnpm exec tsc --noEmit --pretty false` passed, `pnpm lint` passed with the existing `<img>` warnings, and `pnpm build` completed successfully with the existing image/dynamic-render warnings.

### Phase 24: Checkout-Path QA Preparation (2026-05-23)
1. **Direct Health Language** - Tracking Health wording now explicitly says what the attribution state means: excellent means the Cart Helper is doing its job, warning means attribution survived but not through durable cart attributes, and error means purchase attribution is weak or missing.
2. **Buy-Now QA Artifact** - Added `docs/qa/dirava-buy-now-flow.md` as the required evidence template for product-page buy-now/direct checkout.
3. **Returning Visitor QA Artifact** - Added `docs/qa/dirava-returning-visitor-flow.md` for same-browser purchases without fresh click parameters.
4. **Delayed Checkout QA Artifact** - Added `docs/qa/dirava-delayed-checkout-flow.md` for attribution capture followed by a delayed purchase.
5. **Catalog Modes QA Artifact** - Added `docs/qa/dirava-catalog-modes.md` for `PRODUCT_NUMERIC_ID`, `SKU`, and `CUSTOM` mode proof.
6. **Privacy Guardrail** - The new QA artifacts require flags and summaries only, with no raw PII or full webhook payloads.

## Not Yet Implemented

| Feature | Notes |
|---------|-------|
| Team access | Invite members to workspace |
| Batch ingestion | Multiple events per request |
| Remaining Shopify flow QA | Cart helper and paid revenue are proven for one normal Dirava paid order; buy-now/direct checkout, returning visitor without fresh click params, delayed checkout, live non-default catalog modes, and Meta/TikTok Events Manager UI visibility still need QA |
| Custom ingest staging DNS QA | The implementation is in place, but a staging merchant-owned domain should still be verified end-to-end before promoting this as a recommended launch step |
| Webhook consent policy | Add an explicit workspace-level policy for webhook Purchase consent handling before stricter compliance rollouts |
| Tracking Health signal percentages | Add percentages for webhook Purchases with fbp/fbc/fbclid-derived fbc/ttclid/gbraid/wbraid/email/phone/content IDs/value+currency |
