# MEMORY.md

## 2026-10-25 Server-side InitiateCheckout, Cart Helper consent, cart writes and funnel country: live, not on `main`

Branch `agent/wetracked-learnings-20261025` applies the findings of the 24-25
October side-by-side comparison with Wetracked on Mizoke
(`mizoke-theme/docs/mizoke-tracking-compare-2026-10-25.md`), each also checked on
Dirava and Infinite Layers.

- InitiateCheckout from the server. Mizoke sent none for its two checkouts on
  25 October. Vercel request logs show why for order #1240: Mizoke's Custom Pixel
  script loaded on the product page at 03:07:04 and next at 03:08:05, after
  payment at 03:07:59, so it never ran during the checkout. Shop Pay's
  accelerated checkout runs in its own popup, outside the store's pixels. Signed
  `checkouts/create` and `checkouts/update` webhooks now go through the same
  durable inbox as `orders/paid` and become one InitiateCheckout per checkout,
  under `shopify-checkout:<workspaceId>:<checkout token>`
  (`src/lib/shopify-checkout-event.ts`). Email, phone, names and address come
  from the signed payload; attribution from the cart attributes, session record
  and landing site; consent through the same resolution as Purchase. A new row
  is held 5 minutes (`CHECKOUT_WEBHOOK_HOLD_MS`) so later updates enrich it; a
  pending, unclaimed row is enriched in place; a claimed or settled row is never
  reopened; a row an older pixel created for the same checkout under a random ID
  wins. The Custom Pixel and legacy script now name `checkout_started` with the
  same ID, so the pixel's fast path and the webhooks fill one event. `orders/paid`
  also adds the checkout's InitiateCheckout, unheld, when the checkout has none,
  which covers paid Shop Pay checkouts before the checkout webhooks are
  registered; a failure there never blocks the Purchase. Destinations: Meta,
  TikTok, ChatGPT, GA4 and Pinterest, filtered by workspace mode and consent;
  Klaviyo keeps the pixel's own Started Checkout. The merchant setup guide now
  asks for the two checkout webhooks.
- Cart Helper consent. Shopify's Customer Privacy API was not loaded when the
  helper read it, so it read nothing. LAX counted that as allowed: for an EU
  visitor with no choice yet, Dirava's helper wrote `_fbp` to the cart and set the
  cookie, and 7 of Dirava's last 60 orders carry `_fbp` next to
  `_tc_consent_marketing=false`. STRICT counted it as a denial: Infinite Layers'
  first write on a page, made before the API had loaded, cleared `_fbp`, `_fbc`
  and, by the same code path, the ChatGPT click context written under real
  consent; 6 of its last 60 orders from consenting shoppers ended without `_fbp`.
  The helper now loads the API itself with `Shopify.loadFeatures`
  (`consent-tracking-api` 0.2), takes the decision from `visitorConsentCollected`
  while the API answers nothing, and waits for one of them before its first write
  (at most 3 seconds, `CART_HELPER_CONSENT_WAIT_MS`). An explicit false or a
  sale/sharing opt-out still clears identifiers in both modes. With no answer at
  all, LAX keeps allow-by-default and STRICT now leaves identifiers and the
  ChatGPT click untouched.
- Cart writes. The helper wrote on every page load, again at `pageshow`,
  `pagehide` and checkout clicks, and 120 ms after any other script's cart call;
  next to Wetracked's repeated attribute writes on Mizoke that was 5 to 7 write
  and read pairs per page. It now keeps a digest of the last verified attribute
  set per cart token in localStorage (`_tc_cart_attr_written`) and skips the write
  when nothing changed within 30 minutes (`CART_HELPER_WRITE_REUSE_MS`).
  `_tc_consent_timestamp` is left out of the comparison and restamped on every
  real write, so the webhook's 24-hour grant freshness holds. Other scripts'
  attribute-only `/cart/update` calls that do not touch TrackClear keys are
  ignored; any other cart change drops the digest and re-verifies.
- Country. The generated Custom Pixel and the legacy script send the storefront
  country from Shopify's `localization` cookie (two letters only) as
  `userData.countryCode` on every marketing-allowed event; checkout events prefer
  the checkout's billing or shipping country, then its localization. Meta
  receives it hashed as `country`. Before this, Dirava and Infinite Layers sent no
  country on PageView, ViewContent or AddToCart.

New pure helpers, embedded in the storefront script with `toString()` so the
browser runs the tested code: `resolveHelperMarketingState`,
`isForeignAttributeOnlyCartUpdate`, `cartAttributeSignature`,
`shouldSkipCartAttributeWrite`. `enqueueReplayJob` accepts `delayMs` for a newly
added job. New tests: `tests/unit/shopify-checkout-webhook.test.ts` (checkout
webhooks, pixel-row enrichment and dedupe, consent, order fallback),
`tests/unit/pixel-country.test.ts` (country and the shared checkout event ID),
and the helper tests now run the generated script against a simulated storefront
(consent API, cart, cookies, other scripts' fetch and XHR).

Verification: 850 unit tests pass, `tsc` clean, lint has only the existing
`<img>` warnings, production build passes, and the webhook route and new module
load under `tsx` as the worker runs them. Prisma checks pass the way CI runs
them: the format check flags this Windows checkout's CRLF schema on `main` too,
an LF copy is formatted, and `validate` passes with placeholder database URLs.
Integration tests were not run (no local PostgreSQL/Redis, and no GitHub Actions
allowance). On live Dirava the consent API was absent, `Shopify.loadFeatures`
loaded it in 29 ms, and it reported marketing not allowed for an unanswered EU
visitor.

Release: live since 25 October 2026. The worker runs
`44afc8557a0d764913e7dcbcc7c5581a8db1b7db` (Railway
`c58250ea-f3b8-4ca1-b5f9-d8b93bbcc2fb`); the web runs
`f87dbac3ca38e12ce153a78315618b600b68fc35` (Vercel
`dpl_4DuoCsF4SpdXEnGNF1QkJjqDKmiD`), a web-only fix: the first web build served
a Cart Helper that did not parse, because the production build dropped the
escape sequences in its template literal, so from 15:05 to about 15:43 no cart
got TrackClear attributes or consent markers. Unit tests run the unminified
source; after changing a served script, fetch the live script and parse it.
Cutover record and the checkout webhook tests: `docs/deploy.md`.
It was deployed from this branch because `main` requires the GitHub Actions
checks and there is no Actions allowance. Merge it through a pull request once
Actions can run, and do not deploy `main` before that. No migration. The
Shopify inbox worker on Railway runs the webhook route, so web and worker must
both run this release. Register the checkout webhooks only on a fleet running
it; an older worker hands an inbox row for an unknown topic to the refund
handler. Per store, in Shopify admin > Settings > Notifications > Webhooks add
"Checkout creation" and "Checkout update" (JSON, latest API version) with the
URL already used for "Order payment"; Shopify signs them with the same key.
Without them, paid checkouts are still covered by the `orders/paid` fallback,
while abandoned checkouts the pixel cannot see are not.

## 2026-10-13 Google Ads Data Manager destination: merged (PR #24) and deployed

Branch `feature/google-ads-data-manager` replaces the Google Ads destination. The
old worker pinged the browser conversion endpoint from the server, which carries
no Google cookies, so nothing was attributable. Purchases now go to one merchant
"Website (Import from clicks)" conversion action through Google's Data Manager
API with the Google click ID (gclid/gbraid/wbraid) and hashed customer data.
Track Clear's own service account authenticates (`GOOGLE_DATA_MANAGER_SERVICE_ACCOUNT_KEY`,
on Railway and Vercel); merchants add its email to Google Ads and enter their
customer ID and conversion action ID. Google processes uploads asynchronously:
SENT means accepted, and `destinationRequestStatus` records Google's final
result, polled from the existing 5-minute recovery cycle (still 12 listeners).
Google Ads is now allowed for standard Shopify V1 workspaces (not headless V1).
Full design, setup and error guide: `docs/google-ads.md`.

New: `google-data-manager-auth.ts`, `destinations/google-ads-ids.ts`,
`google-ads-request-status.ts`, `components/integrations/google-ads-integration.tsx`;
rewritten `destinations/google-ads.ts` and `workers/google-ads-event-processor.ts`.
Migrations `20261014_google_ads_data_manager` (nullable columns) and
`20261014_google_ads_data_manager_idx01_request_status` (concurrent index), so the
release gate now requires 12 indexes. `markEventDeliveryAccepted` gained an
optional bookkeeping argument. Four de/es/fr/pt dashboard strings that were saved
as Latin-1 (`reportingRetention`) were restored to UTF-8.

Verification: 823 unit tests pass (70 new), `tsc` and lint clean. Integration
tests were updated but not run locally (no PostgreSQL on this machine); CI must
run them. Later merged as PR #24 (`42cb4f9`) and deployed: Railway worker
`f4574ad5-20e4-4258-adb1-de3a18e4d995` (2026-10-13 21:29 UTC) and Vercel
`dpl_7wTEVDpxeL8Uma1hfCaEVUJYuqEh` ran it until the 25 October release. That
deployment was not recorded at the time; this entry was corrected on 25 October.

## 2026-10-13 retention and checkout recovery release — live

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

## 2026-10-13 - Infinite Layers uncapped order tracking

- User requested no Track Clear limit for Infinite Layers. Live state was no Stripe
  subscription / Free 50 Purchases per month, despite unlimited workspace allowance.
- Added owner `cmlsehb7t00009vaih2k1o1sc` (`infinitelayersshop@gmail.com`) to
  `UNLIMITED_ORDER_USER_IDS` on both hosts; prior two exempt owners were preserved.
  The existing implementation is account-wide, covering this owner's current and
  future workspaces. Stripe and all other accounts were left unchanged.
- Same runtime SHA `e9ff8c7bf566c02c3be2c5fc2f3ef3dceab1294d` is now served by
  Vercel `dpl_765K25T6gWqFCLoSnkwYQu1A4ycT` and Railway
  `5a2db944-3155-4c93-a6f0-8e4da7a92c3b`. Both healthy; one active fleet, 12/12
  listeners. Railway SSH confirmed the runtime exemptions, not merely saved variables.
  Vercel config, production alias and replacement deployment were verified.
- Existing targeted billing/workspace-limit suite passed 35 tests. Verified encrypted
  restore point: `E:/backups/trackclear/2026-10-13-infinite-unlimited`.
- User then requested the 1,000-order tier to avoid apparent expiry. Granted a
  complimentary local `GROWTH`/`ACTIVE` Subscription for this owner using a real Stripe
  customer record, with null Stripe subscription/price/trial/period end and no
  scheduled cancellation. Stripe readback confirmed zero subscriptions. No payment
  or recurring charge was created. Both unlimited exemptions were rechecked intact.
  Live billing UI shows Growth / Active, 47 of 1,000 orders, and 30-day retention.
  Standard $49/month list price is still displayed even though the grant is complimentary.
  The 100 requests/second stability guard remains. Do not claim unlimited retention.
- No Purchase created or history polled. Continue waiting for the user's order report;
  do not recreate the canceled purchase-check automation.

## 2026-09-30 - Standard Shopify ChatGPT Ads release

- User authorized implementation through usable new-store onboarding. Standard
  Shopify is first; Mizoke migration is explicitly deferred. Infinite Layers
  (`www.infinitelayers.shop`, `afd09a.myshopify.com`) is the selected verification store.
- `OPENAI` is disabled by default and rejected for headless installs. Five standard
  commerce events use CAPI with `integration_source: trackclear`. No new browser SDK.
- Original event time/pixel are durable, consent is rechecked at send, and old
  envelopes cannot be revived from BullMQ. Click age starts at URL capture and is
  independent of other platforms. Shopify canonical Purchase ownership is reused.
- See `docs/chatgpt-ads.md`. PRs #19/#20 release `e9ff8c7bf566c02c3be2c5fc2f3ef3dceab1294d`
  is live: Vercel `dpl_4pQTgYYx87aQphu61uh3m7N3Mxv6`, Railway
  `7f54c9ef-621d-4e0d-8f25-5fb09c2b122f`; 19 migrations, 11 required indexes,
  zero drift, 12/12 listeners, one worker fleet. Exact-SHA CI passed all five jobs.
  Local build/typecheck/lint, 752 unit tests and 70 integration tests passed using
  isolated PostgreSQL 17/Redis 8.8. Signed-webhook reconciliation and generated-pixel
  runtime behavior are covered. Four live funnel types are verified below; Purchase
  and consent-denial verification remain outstanding.
- Preserve the required `PostgreSQL 16 migration rehearsal` branch check when
  expanding release coverage: the workflow now rehearses both PostgreSQL 16 and 17.
- Local browser QA covers workspace creation, snippets, three integrations and
  Add Store. Use `t.raw` for the literal `</head>` installation strings. Switching
  Shopify and Track Clear to the existing Infinite Layers Google account resolved access.
- Owned-store allowance is `UNLIMITED_WORKSPACE_USER_IDS`, separate from order limits.
  The connected ChatGPT Ads account inventory currently contains Mizoke only.
- User selected existing IL workspace `cmlseil1700029vaisp5tkn5k`, owned by
  `infinitelayersshop@gmail.com`. The empty Mizoke-account draft is inactive.
  Standard Shopify mode and canonical domain are backfilled; credentials were not transferred.
  Connected Custom Pixel `276791629` now uses bridge-v1 instead of the unavailable old
  Railway endpoint. The live theme helper was installed through infinite-layers-theme PR #1
  at `f1059e41ae74eee82b64faa8d20c5cbee7d383b8`. Signed orders/paid verification passed
  through Shopify Send test, with zero destination conversions. Purchase QA is open.
  At 19:22 UTC the user's new dedicated Infinite Layers source in the existing Ads
  account matched Track Clear; its encrypted CAPI key passed non-recording validation
  and delivery is enabled. `Infinite Layers - Purchase` now maps `order_created` to
  that source only, with default 30-day click/1-day view windows and no campaign.
  User refresh cleared the Pixel Helper load issue without code/privacy changes;
  the original cause is unknown. At 19:36 UTC, all 16 OPENAI rows were SENT/HTTP 200:
  12 PageView, 2 ViewContent, 1 AddToCart, 1 InitiateCheckout. Ads Manager independently
  exposed those four types as server-to-server in its recent sample. Checkout's
  roughly 92-second receipt lag included the intentional 90-second contact hold.
  The TRACKCLEARQA test item was removed, preserving two original cart items; no
  order was placed. These are QA events, not attributed sales. Purchase reconciliation,
  cart-to-webhook attribution, live consent denial and campaign attribution remain open.
  User chose the next genuine order, then canceled automatic checks. Heartbeat
  `verify-infinite-layers-first-purchase` was deleted. Wait for the user's message
  that a purchase happened before resuming verification.
  User subsequently requested Track Clear to own Meta and selected existing
  `InfiniteNew` (`803269915787577`), replacing saved `test il` (`1411310997119266`).
  At 21:14 UTC the native Facebook & Instagram data sharing was switched off,
  preserving its synced catalog, then Track Clear Meta CAPI was enabled. Browser
  ownership remains off and production test code is null. Existing encrypted token
  passed POST TestEvent (HTTP 200/events_received=1; Processed/Server in Meta UI),
  despite Graph GET Missing Permission. Do not equate read denial with CAPI failure.
  By 21:17 UTC, eight logical events (five PageView, one ViewContent, one AddToCart,
  one InitiateCheckout) each had accepted META and OPENAI receipts, matching IDs and
  no retries. Checkout passed after its 90-second hold. Removed only TRACKMETAQA and
  preserved the original two-item cart; no order was placed. TikTok stays disabled;
  unrelated wetracked integrations were preserved.
  Both owned accounts have workspace allowances; order limits are unchanged.
  Post-cutover Meta/TikTok queues drained with 85 SENT rows each and no pending/retrying rows.
- Vercel CLI does not use `.gitignore`. Fetch the approved GitHub `gitSource.sha`
  for production. An initial local upload was superseded and removed. `.vercelignore`
  excludes local credentials/prototypes from future CLI uploads; never inject Git SHA
  environment values to bypass provider provenance checks.
- Second-store onboarding must select the created workspace before opening Integrations.
  Creation now writes its active-store cookie and refreshes the Next router cache.
- Dashboard readiness includes OpenAI credentials; use the product mode resolver,
  not an allowlist-length check, now that standard Shopify has three destinations.
- Key integration/settings client forms by workspace ID. Router refresh preserves
  component state; without a key, the old store's credential drafts can survive a switch.
- Browser regression verification passed second-store handoff, draft clearing and
  OpenAI-only readiness. Wrap ChatGPT card actions to avoid overflowing the three-column grid.

## 2026-08-02 - Mizoke Funnel Tracking Contract Repair

- Mizoke is live at exact SHA `2b802ee9ac2f32de2321ca17fd073b98e930246c` after PR #5 restored AddToCart/InitiateCheckout dispatch for analytics-allowed/advertising-denied sessions and PR #6 removed unsupported `requestId`, `ip`, and `userAgent` fields from the strict Track Clear ingest JSON body. Client IP and user agent remain available through the supported `X-TL-Client-*` headers.
- The two regressions compounded: the component consent gate initially suppressed analytics-only funnel events; after that was fixed, Track Clear rejected the proxy payload with HTTP 400 because its Zod schema is strict. Purchases continued independently through signed Shopify webhooks.
- Privacy behavior is unchanged: both-denied sends nothing; marketing or sale/sharing denial blocks Meta/TikTok browser and server delivery; analytics-only events may create privacy-minimized `INTERNAL` records without IP, user agent, browser cookies, or click IDs.
- Validation passed: targeted tracking tests 18/18, Mizoke typecheck, production build, 344/344 tests across 82 files, and lint with zero errors plus 25 existing warnings. GitHub independently passed typecheck, lint, tests, and build; only the unchanged pre-existing client route performance budgets failed, and no budget was relaxed. Oxygen workflow `30766182444` deployed the exact SHA.
- Live analytics-only QA created exactly one `INTERNAL`/`SENT` AddToCart and one `INTERNAL`/`SENT` InitiateCheckout with zero platform rows and null IP/UA/fbp/fbc/ttclid. No Purchase was attempted and the test cart was emptied. Separately, a real `39.01 EUR` signed-webhook Purchase reached both Meta and TikTok as `SENT`.

## 2026-08-01 - Location-Aware Consent Production Release

- Track Clear release SHA `0a2c19e16baa73ece24c39137c091fa6d0b8a582` and Mizoke release SHA `87e027abdaa1402988bffe11e70626ee7c36ae03` delegate geographic defaults to Shopify Customer Privacy rather than maintaining a country list. A visitor with no stored decision uses Shopify's computed analytics, marketing, sale/sharing, and banner permissions.
- Eligible opt-out-region visitors can therefore begin with Shopify-permitted tracking enabled, while opt-in regions remain disabled until consent. This does not override an explicit No: Reject All, marketing denial, GPC, or `saleOfDataAllowed=false` blocks Meta/TikTok browser and server delivery.
- The new `saleOfDataAllowed` field flows through Mizoke events, the Track Clear ingest schema/headless SDK, `_tc_consent_sale_of_data` cart attributes, Redis session enrichment, and signed Shopify webhook reconciliation. Explicit false blocks every marketing destination in STRICT and LAX modes; omission remains backward compatible.
- Sale/sharing revocation uses an independent timestamped Redis tombstone while clearing the same advertising identity fields as marketing revocation. This prevents delayed aliases/events from hiding or resurrecting the opt-out.
- Mizoke no longer copies stored click IDs or Meta/TikTok cookies into checkout attribution when advertising is denied. Sanitized UTM context and an opaque first-party session anchor can still support the existing privacy-minimized `INTERNAL` attribution path when analytics is explicitly allowed; analytics denial stores nothing.
- Validation: Track Clear production build, TypeScript, lint with existing image warnings, 685/685 unit tests, and release CI including 62/62 PostgreSQL/Redis integration tests passed. Mizoke production build, TypeScript, lint with zero errors and 25 existing warnings, 341/341 tests, and direct built-server homepage/product SSR smokes passed.
- The controlled Track Clear cutover deployed Vercel `D1NVfuLHUYdoSP8AuGPpsCjvgiHa` and Railway `23e538aa-bf26-44f5-aebb-f80bdc729689` at the exact approved SHA. Public health reports release/database/schema/Redis ready, all 17 migrations and 11 required indexes are current, Prisma drift is zero, and Railway started all 11 listeners. Automatic Vercel/Railway deployments remain disabled.
- The encrypted pre-release restore point is `E:\backups\trackclear\2026-08-01-0a2c19e-pre-release\trackclear-production-pre-release.7z` with SHA-256 `17923725B78D5E157E71F248AE5F85C176BF3EEA154DA80F5BFC0D16FF3C51D5`; its password is separately DPAPI-protected and plaintext working files were moved to the Windows Recycle Bin after verification.
- The first Mizoke Oxygen deployment exposed an SSR-only client-module import failure and was immediately rolled back. A byte-identical consent helper rename made it isomorphic; Oxygen workflow `30711750195` deployed the corrected SHA. Live homepage/product checks return HTTP 200 and the real product page renders with no console errors. At that release point, US geolocation/GPC behavior and a post-release paid Purchase were still open; the Purchase proof was closed by the 2026-08-02 evidence above.

## 2026-07-30 - Privacy-Minimized Internal Attribution Production Release

- Production release SHA `d09cf963177ccb69e63f59711483c61945587b0b` records a distinct `INTERNAL` EventLog only when analytics consent is explicitly allowed, marketing consent is denied, and no eligible external analytics destination will receive the event. Both-denied consent records nothing.
- The internal record is never queued to Meta, TikTok, or another destination and never consumes a Purchase billing unit. It keeps only sanitized UTMs, external referrer hostname, query-free identifier-redacted landing path/URL, value, currency, and item count. Raw shopper/browser/order/session/click identifiers, IP, user agent, cookies, retry data, and delivery claims are absent; its event ID is a workspace-scoped SHA-256 key.
- Browser ingest and signed Shopify Purchase webhooks share this path. A later consented external delivery supersedes its matching internal row; revenue/funnel/campaign reporting excludes the superseded copy so consent transitions do not double-count.
- Dashboard reporting and event lists include `Internal analytics`, while delivery health, conversion accuracy, alerts, replay/recovery, and Purchase billing reconciliation exclude it.
- Migration `20260730_add_internal_analytics_destination` is applied as production migration 17/17 and is included in the runtime schema gate. Production verification reports 11/11 required indexes valid and zero Prisma drift.
- Local validation passed: production build, TypeScript, Prisma validation, ESLint with existing image warnings, and 677/677 unit tests across 58 files. Release CI passed Node 20/24, PostgreSQL 16/Redis 7, worker-container, and migration-rehearsal gates, including the 62/62 integration baseline.
- The controlled cutover deployed Vercel `FVQiW8qX8533PaXSGNpV3qqLkScb` and Railway `e97087a8-6abd-4b74-a817-b5508ca84baf` at the exact approved SHA while automatic deployments remained disabled. Public health reported release/database/schema/Redis ready, and Railway started all 11 listeners after its guarded predeploy.
- The encrypted pre-release restore point is `E:\backups\trackclear\2026-07-30-d09cf96-pre-release\trackclear-production-pre-release.7z` with SHA-256 `DDBFC42F62C64A16D90CD41CC440B5817FFB52100988488EA58910CAC1F40050`; its password is separately DPAPI-protected and plaintext working files were moved to the Windows Recycle Bin after verification.
- Live QA sent one anonymous non-Purchase Mizoke AddToCart with analytics allowed and marketing denied. It created one `INTERNAL`/`SENT` row with sanitized TikTok source/medium/campaign, null IP/UA/fbp/fbc/ttclid, and zero platform rows.

## 2026-07-27 - Own-Store Tracking Hardening and Controlled Production Release

- Release SHA `a4628c9bd3760fd3e902a8df5680002ced759651` was live on Vercel and Railway after a controlled cutover and was superseded by the 2026-07-30 release above. The candidate was fast-forwarded to `main`; Vercel Git deployment and Railway autodeploy remain disabled so later source changes cannot bypass the exact-SHA gates.
- An encrypted pre-release PostgreSQL/Redis backup is stored at `E:\backups\trackclear\2026-07-27-a4628c9-pre-release\trackclear-production-pre-release.7z` (SHA-256 `39A20800B6610373A7D82DAAA0AC01CB8216C4CF8A6C8A299E79F2FF12C51AF3`). Its password is DPAPI-protected separately and the plaintext temporary dump/RDB/manifest files were removed.
- Shopify webhook verification is now evidence-based: a saved secret does not suppress browser Purchase by itself; only a successfully signed `orders/paid` delivery marks the workspace verified.
- Signed Shopify webhooks are encrypted and persisted in `ShopifyWebhookInbox` before acknowledgement. Live requests return immediately after durable capture; the one-minute inbox worker then processes/replays with bounded backoff until success and erases the webhook body.
- Ingest persists the complete destination fan-out atomically, uses deterministic BullMQ job IDs, and retains a short-lived AES-256-GCM retry envelope so transient failures can recover shopper identity without storing raw PII in the normal EventLog payload.
- Purchase reconciliation now uses normalized order name/ID plus checkout/cart aliases, per-destination canonical ownership, a `SUPERSEDED` terminal state, a 90-second verified-webhook grace window (longer than one inbox scan), and a final delivery ownership claim so browser and webhook races cannot send two different Purchase identities.
- The `bridge-v1` pasted Custom Pixel loader uses seven explicit literal Shopify event subscriptions, keeps at most 100 early events in one ordered FIFO during remote initialization, and activates after all handlers register. Shopify's editor rejected the former dynamic `analytics.subscribe(name, ...)` loop and warned that no events were subscribed; the literal generator correction is now live, but existing stores must repaste the loader. Its versioned pixel URL bypasses transition cache and the public pixel scripts use a 30-second shared-cache TTL.
- Generated Shopify pixel variants now keep browser/server Purchase IDs aligned when Shopify exposes `checkout.orderName`. Meta and TikTok browser SDK ownership is independently opt-in and defaults off; when enabled, it is consent-gated, uses the exact server event ID, and must be the only browser integration for that dataset/Pixel ID. Browser Purchase is still suppressed after the signed webhook path is proven.
- Browser and headless attribution now retain latest-touch context for up to 90 days, capture `_ttp`, and apply STRICT/LAX consent by category. The Redis webhook-enrichment copy is capped at 30 days; consent grants expire after 24 hours while explicit denials remain authoritative for 30 days. Denial purges browser/cart identifiers and propagates timestamped Redis tombstones through previously linked hashed aliases so delayed older events cannot resurrect data; webhook Purchase selects the newest bounded cart-or-session consent snapshot. After API-key authentication and strict validation, privacy-minimized no-destination revocations require a session/checkout/cart anchor and pass isolated 120/minute plus 5,000/day workspace budgets before persisting ahead of delivery-state gates. The fast path starts from one opaque anchor rather than a predictable order alias; headless clients generate and reuse a fallback session anchor. Custom Pixel, legacy, and headless clients keep at most 20 such revocations for 30 days with 5-second-to-5-minute retry backoff. A stable `trackclear-consent-revocation-v1` Web Lock serializes cross-tab sends when supported; cross-tab ordering remains best-effort on browsers without Web Locks, alongside per-client serialization.
- Destination failures are classified as transient or terminal, circuit breakers are scoped by workspace and destination, scheduled retries are deterministic, and replay preserves encrypted event data while it remains within the 72-hour envelope TTL.
- Purchase usage counting now reserves normalized Purchase identities atomically in Redis. Hourly recovery groups transitive workspace-scoped aliases, includes FREE users without Subscription rows, and restores both a non-decreasing count floor and every hashed marker atomically. The known UTC month-boundary double-unit edge needs durable billing-period ownership and remains outside this tracking-only release.
- Required rollout order is the eleven-file branch migration chain first, then stop/drain every old worker, deploy the new web build while delivery is paused, wait for zero old Vercel invocations plus the configured duration buffer, and start exactly one new worker fleet. After candidate traffic, the raw baseline worker is not a safe rollback because it ignores inbox/claim/SUPERSEDED state.
- Migration history now includes forward-only catch-up for previously uncommitted Google Ads, Refund, WebhookDeadLetter, and encrypted Shopify-secret schema. The plaintext-secret drop refuses any row without a complete encrypted replacement; the refund index is isolated in its own concurrent migration.
- The original large PostgreSQL 17.5 rehearsal upgraded 50,000 EventLogs/10,000 Purchases in 3.856 seconds and exercised interrupted-index recovery. The final all-16 populated rehearsal upgraded 20,000 EventLogs/5,000 Purchases in 1.281 seconds, retained all rows/backfills, verified 11/11 indexes, and had zero Prisma drift; a greenfield reset through all 16 also passed 11/11 with zero drift.
- Final local validation passed on Node 22: 666/666 unit tests across 57 files; 62/62 real-infrastructure integration tests across 7 files; TypeScript; Prisma format/validation; actionlint; full ESLint with existing image warnings; production build; the complete guarded Railway release rehearsal; and an HTTP 200 isolated worker startup smoke with PostgreSQL/Redis connected and 11/11 listeners. Integration cleanup is fail-closed to a loopback `_test` database and non-zero Redis DB (default 15); PR CI repeats runtime gates on Node 20/24, PostgreSQL 16, Redis 7, and the Node 20 worker image.
- Railway worker readiness now requires `/health`, successful stale-outbox and Shopify-inbox schedule registration, a latched `waitUntilReady()` result for all 11 listeners, PostgreSQL, and Redis. Every BullMQ worker is constructed with `autorun: false`, so a failed candidate cannot claim outbound work before mandatory setup succeeds. The worker owns signals before asynchronous startup; startup failure, fatal process errors, and shutdown all drop readiness immediately and close listeners, supplied worker Redis clients, shared Redis, and Prisma through one path. The timeout hierarchy is 30 seconds outbound, 45 seconds application drain, and 60 seconds Railway drain.
- Production entrypoints now fail closed unless provider metadata carries the exact approved 40-character SHA; Railway also requires the exact environment ID. The Vercel-specific build rejects absent or unknown environment metadata, prebuilt production deployment is prohibited, and production-mode middleware rejects requests even when all Vercel markers are absent. Runtime and direct database URLs must identify the same writable PostgreSQL database/schema/cluster and match operator-pinned name/schema/system-ID values before migration or build; the complete 11-migration/11-index schema is asserted, and readiness requires release approval, PostgreSQL identity/schema, and Redis. A physical clone can retain the same system identifier, so provider URL verification remains mandatory. The provider SHA remains pinned for the deployed release's lifetime and rotates atomically at the next controlled cutover.
- Production migration/cutover gates passed: all 16 migrations are current, 11/11 required indexes are valid, schema drift is zero, Vercel live health identifies the approved SHA, Railway started 11/11 listeners, and all 11 queues were resumed only after both runtimes were ready.
- Mizoke post-release AddToCart and InitiateCheckout diagnostics both reached Meta and settled at 100% success with zero pending/failed events. Dirava publicly loads the required Cart Attribution Helper; its generated pixel confirms Meta/TikTok browser ownership off, verified-webhook gating on, and `VARIANT_NUMERIC_ID` mode.
- Existing Dirava order `#5076`/`#5077` evidence remains the regression baseline. Dirava Shopify custom pixel `325222664` was repasted with the literal-subscription `bridge-v1`, remained connected, and passed Shopify editor validation plus Pixel Helper `page_viewed`/`product_viewed` receipt on a live product page. The attempted AddToCart did not change the cart, so AddToCart destination proof remains open. Buy-now/direct checkout, returning visitor, delayed checkout, live non-default catalog modes, Meta/TikTok UI visibility, other-store repastes, and a controlled post-deploy paid order also remain open.

## 2026-05-23 - Checkout-Path QA Preparation

- Tightened `/tracking-health` cart-helper attribution language so merchants can interpret quality directly: excellent means the Cart Helper is doing its job, warning means attribution survived but not through durable cart attributes, and error means purchase attribution is weak or missing.
- Added pending QA artifacts for the remaining normal Shopify checkout-path proof:
  - `docs/qa/dirava-buy-now-flow.md`
  - `docs/qa/dirava-returning-visitor-flow.md`
  - `docs/qa/dirava-delayed-checkout-flow.md`
  - `docs/qa/dirava-catalog-modes.md`
- The new QA artifacts are templates only. They do not claim these flows have passed.
- Required evidence remains flags and summaries only. Do not store raw PII or full webhook payloads in QA artifacts.

## 2026-05-23 - Normal Shopify Install Hardening

- Updated Settings to label the Cart Attribution Helper as required for reliable Shopify purchase attribution.
- Updated Onboarding to provide both the Shopify Customer Events / Custom Pixel snippet and the Cart Attribution Helper snippet during setup.
- Updated normal Shopify V1 install guidance: Custom Pixel, Shopify webhook, Cart Attribution Helper, Meta credentials, TikTok credentials, test AddToCart, and test webhook Purchase are all required before a workspace is treated as live.
- Tracking Health now classifies webhook Purchase attribution sources: `cart_attributes` is excellent, session/landing-only attribution is warning, and no attribution context is error.
- Added `tests/unit/tracking-health.test.ts` with 3 tests for the cart-helper attribution health states.
- Validation passed: `pnpm test -- --run` 443/443, `pnpm exec tsc --noEmit --pretty false`, `pnpm lint` with existing `<img>` warnings, and `pnpm build` with existing image/dynamic-render warnings.
- Remaining QA remains unchanged: buy-now/direct checkout, returning visitor without fresh click params, delayed checkout, live non-default catalog modes, and Meta/TikTok Events Manager UI visibility.

## 2026-05-23 - Dirava Cart Helper Paid QA

- Added permanent QA evidence for Dirava order `#5077` in `docs/qa/dirava-cart-helper-test.md`.
- Production health during QA was `status: "ok"`, `database: "connected"`, `redis: "connected"`, `platform: "vercel"`, `commit: "9930a43"`.
- User-provided debug console output proved the storefront helper loaded, reused `_trackclear_session_id` `7cdc8bfa-d0bc-4140-a8da-a4a0fbc08ea7`, wrote through `/cart/update.js`, verified through `/cart.js`, and reported cart update verified before checkout.
- Production EventLogs for order `#5077` used event ID `shopify-purchase:cmlsa6h1w0001zm8nxuzn7a50:5077`, value `0.5`, currency `EUR`, and `attributionSource: "cart_attributes"` with `_trackclear_session_id` present.
- Meta EventLog `cmpifn2no0005ryfa81kml5jx` was `SENT` with API summary `events_received: 1`, `messages: []`. TikTok EventLog `cmpifn2nr0007ryfalei6rgoy` was `SENT` with API summary `code: 0`, `message: OK`.
- Remaining QA: Meta/TikTok Events Manager UI visibility, buy-now/direct checkout, returning visitor without fresh click params, delayed checkout, and live non-default catalog modes.

## 2026-05-23 - Shopify Cart Attribution Helper

- Built the approved storefront-context Cart Attribution Helper as the reliability layer for normal Shopify cart/order attribution.
- Added public `GET /api/cart-helper/:workspaceId`, backed by `src/lib/shopify-cart-attribution-helper.ts`.
- The helper creates/reuses `_trackclear_session_id`, reads Meta cookies/click IDs/UTMs/landing page/consent, writes TrackClear attributes with same-origin `/cart/update.js`, verifies via `/cart.js`, retries once, and stores local non-PII diagnostics (`_tc_cart_attr_last_ok`, `_tc_cart_attr_last_checked_at`, `_tc_cart_attr_missing`).
- The helper writes early and repeatedly on page load, pageshow, add-to-cart submit/click, detected cart mutations through `fetch`/`XMLHttpRequest`, before checkout navigation, and pagehide. It does not block checkout.
- Settings now includes a dedicated "Cart Attribution Helper" install card with a workspace-specific `<script async src="https://www.trackclear.io/api/cart-helper/<workspaceId>"></script>` snippet for `theme.liquid` before `</head>` or Custom Liquid/theme app block equivalent.
- Added `/api/cart-helper/:workspaceId` to the middleware public-route allowlist after live verification showed the new route was otherwise redirected to the app shell.
- Added `docs/shopify-cart-attribution-helper.md`, `tests/unit/cart-helper-route.test.ts`, `tests/unit/shopify-cart-attribution-helper.test.ts`, and `tests/unit/middleware-public-routes.test.ts`.
- Remaining proof gap: the helper still needs real Dirava QA showing cart attributes are present before checkout and webhook Purchase attribution includes `cart_attributes`; paid-order revenue propagation is also still unproven.

## 2026-05-23 - Dirava Controlled Order 5076 QA Artifact

- Added permanent QA evidence for Dirava controlled order `#5076` in `docs/qa/dirava-order-5076.md`.
- Production health at the time of documentation was `status: "ok"`, `database: "connected"`, `redis: "connected"`, `platform: "vercel"`, `commit: "638707a"`.
- Order `#5076` used controlled landing URL parameters (`fbclid=FB123`, `ttclid=TT123`, `gbraid=GB123`, `wbraid=WB123`, `utm_source=meta`, `utm_campaign=test`) and produced deterministic Purchase event ID `shopify-purchase:cmlsa6h1w0001zm8nxuzn7a50:5076`.
- Meta EventLog `cmpiacdmj00096z61ghhwddqa` was `SENT` with API summary `events_received: 1`, `messages: []`, and TikTok EventLog `cmpiacdml000b6z61jfk1fvbx` was `SENT` with API summary `code: 0`, `message: OK`.
- The order proved canonical webhook Purchase flow, session enrichment, landing-site fallback, browser Purchase suppression, and default variant-ID content payloads for one controlled `0 EUR` order.
- The test did not prove paid-order revenue propagation because two discount codes made Shopify total `0 EUR`.
- Cart/order attribute persistence remains unproven: `_trackclear_session_id` was not present in webhook/order attribution, and the Purchase was enriched through Redis session enrichment plus landing-site fallback rather than cart attributes.
- Recommended next durable attribution path is a theme/app-embed cart helper outside the Shopify Custom Pixel sandbox, while keeping Shopify app/web pixel extension work as the longer-term platform path.

## 2026-05-23 - Branch And Production Verification

- Changed the GitHub default branch from `master` to `main` with `gh api repos/doqendev/TrackingLite -X PATCH -f default_branch=main`.
- Confirmed `origin/main` and `origin/master` both pointed to `182cffb7f36cf78a2d4acf48407c4f1c612b7aa1` before changing the default branch, so there is no longer a stale default-branch review target.
- Confirmed Vercel production deployment uses the `tracking-lite-git-main-*` alias and `/api/health` reported commit `182cffb`, `database: "connected"`, and `redis: "connected"`.
- Confirmed GitHub commit status for `182cffb` is green for both Vercel and Railway worker.
- Ran production migration status with `.vercel/.env.production.local`; Prisma reported 5 migrations found and "Database schema is up to date!" against the Railway Postgres database.
- Remaining proof work is operational QA, not code implementation: real Shopify cart/order attribute preservation, canonical webhook Purchase proof, catalog mode proof with real payloads, headless integration proof, and custom ingest DNS proof.

## 2026-05-23 - Catalog And Headless Hardening

- Confirmed the production branch signals before cleanup: GitHub default branch was still `master`, but Vercel production deployment for `645b449` exposed the `tracking-lite-git-main-*` alias and Railway worker status was attached to the `main` commit. Deployment docs now say production is driven from `main`; a later operational cleanup changed the GitHub default branch to `main`.
- Tightened catalog normalization for direct/headless ingest. `normalizeCustomDataContentIds()` now uses rich content item/root fields (`variantId`, `productId`, GraphQL IDs, SKU, country) instead of treating every raw ID as only a variant ID, so SKU/custom workspace catalog modes can be applied to direct ingest payloads.
- Added route-level regression tests proving ingest applies SKU and custom-template catalog modes, and Shopify webhook Purchase applies SKU and product-numeric catalog modes into EventLog payloads plus queued destination jobs.
- Added `ensureTrackClearSessionId()` to `headless-sdk.ts`. It reuses existing `_trackclear_session_id` from storage/cookies, creates one when absent, persists it to localStorage and/or cookies when available, and remains safe when browser storage is unavailable.
- Updated `docs/headless-shopify.md` to use `ensureTrackClearSessionId()` for TrackClear ingest and cart attribution attributes instead of relying on each headless merchant to hand-roll session ID persistence.
- Validation: targeted catalog/headless route tests passed 24/24; `pnpm test -- --run` passed 427/427 unit tests; `pnpm exec tsc --noEmit --pretty false` passed; `pnpm lint` passed with existing `<img>` warnings; `pnpm build` completed successfully with existing `<img>` and dynamic-server static-generation warnings.
- Remaining operational QA: real Shopify Custom Pixel cart-attribute writing still needs a safe test order, and custom ingest domain DNS still needs an end-to-end staging domain check before recommending it broadly.

## 2026-05-23 - Purchase ID Convergence Hardening

- Rechecked the super-dev review against the current repo head. GitHub status for the pre-patch head `d54f2082a9084216939d70f622e130a28a78b0ea` was green, including the Railway worker context reporting success/no deployment needed. The local Railway CLI is not authenticated, so direct Railway log inspection was not available from this machine.
- Hardened deterministic Shopify Purchase IDs by preferring order name before numeric/GraphQL order ID when order name is available. This makes browser checkout events with only `order.name` converge with Shopify webhook payloads that include both numeric `id` and `name`.
- Kept numeric/GraphQL order ID normalization as the next fallback, so `gid://shopify/Order/987654321` and `987654321` still produce the same event ID.
- Documented checkout/cart-token-only Purchase identity as an intentional fallback: it cannot share a later order-name webhook ID unless Shopify exposes order identity in the browser event. Webhook-enabled workspaces still suppress browser Meta Purchase firing to avoid browser/server dedup mismatches.
- Updated generated `/api/pixel/:workspaceId` and legacy `/api/s/:workspaceId` Purchase ID priority to match `purchase-event-id.ts`.
- Added tests for browser order-name vs webhook order-id/name convergence, GraphQL vs numeric order ID convergence, checkout-token-only fallback behavior, and generated pixel priority. `purchase-event-id.test.ts` now has 8 tests; total unit coverage is 420 tests across 37 files.
- Validation: targeted Purchase/pixel/ingest/webhook route tests passed 21/21; `pnpm test -- --run` passed 420/420 unit tests; `pnpm exec tsc --noEmit --pretty false` passed; `pnpm lint` passed with existing `<img>` warnings; `pnpm build` completed successfully with existing `<img>` and dynamic-server static-generation warnings.

## 2026-05-22 - Custom Ingest Domain Sprint

- Added migration `20260522_add_custom_ingest_domain` with nullable workspace fields for `customIngestDomain`, verification timestamp, last checked timestamp, and last error. The domain is unique when present.
- Added `src/lib/custom-ingest-domain.ts` for hostname normalization/validation, default endpoint fallback, verification URL construction, and verified custom pixel/ingest URL resolution.
- Added public marker route `GET /api/custom-ingest-domain/check` and protected verification route `POST /api/workspaces/:id/custom-ingest-domain/verify`. Verification failure clears `customIngestDomainVerifiedAt` and stores a concise error.
- Updated workspace PATCH/GET to support merchant-editable custom ingest domains while keeping productMode/installType internal-only. Changing or clearing the domain clears prior verification.
- Updated generated snippets so verified custom domains become the pixel-loader host, and updated generated `/api/pixel/:workspaceId` plus legacy `/api/s/:workspaceId` so verified custom domains become the ingest endpoint. Unverified domains continue to use existing TrackClear defaults.
- Added a Settings card for Custom Ingest Domain with DNS target guidance, status, active endpoint, last checked time, save, and verify controls.
- Added `docs/custom-ingest-domain.md`, updated deployment docs for the new migration, and added `NEXT_PUBLIC_CUSTOM_INGEST_CNAME_TARGET` to `.env.example`.
- Added/expanded tests for custom domain helpers, verification route behavior, snippet host selection, generated pixel ingest URL selection, and workspace PATCH validation.
- Validation: focused custom-domain tests passed 20/20; `pnpm test -- --run` passed 417/417 unit tests; `pnpm prisma validate` passed when `DIRECT_DATABASE_URL` was supplied; `pnpm exec tsc --noEmit --pretty false` passed cleanly; `pnpm lint` passed with existing `<img>` warnings; `pnpm build` completed successfully with existing lint/static-generation warnings.
- Production migration applied after implementation: using `.vercel/.env.production.local`, `pnpm prisma migrate deploy` applied `20260522_add_custom_ingest_domain` to the Railway production Postgres database and `pnpm prisma migrate status` then reported the schema up to date.
- Dirava custom-domain setup was removed on 2026-05-23: the unverified `t.dirava.com` workspace setting was cleared, the temporary Vercel `dirava.com` domain entry was removed, and the live Dirava pixel continues using the default TrackClear ingest URL.

## 2026-05-22 - Tracking Quality Sprint 3

- Added workspace-level catalog ID matching settings with migration `20260522_add_catalog_id_settings`: `catalogIdMode`, optional prefix/suffix, and optional custom template. Public PATCH can update catalog settings, but productMode/installType remain internal-only.
- Applied catalog ID settings across generated `/api/pixel/:workspaceId`, legacy `/api/s/:workspaceId`, ingest customData normalization, and Shopify webhook Purchase `content_ids`/`contents`. The browser scripts preserve SKU/GraphQL casing instead of lowercasing catalog IDs.
- Added a safe diagnostics live-validation route, `POST /api/workspaces/:id/diagnostics/test-event`, and `/diagnostics` buttons for AddToCart and InitiateCheckout. Purchase diagnostic events are intentionally rejected to avoid fake order signals.
- Updated Diagnostics event audit UI to label Core vs Optional fields and show optional click/UTM field counts separately, clarifying why one order can be 8/8 while another is 14/14.
- Hardened consent mapping by treating Google Ads as a marketing destination in `shouldSendToDestination()`.
- Added `src/lib/headless-sdk.ts` and `docs/headless-shopify.md` for Hydrogen/custom storefronts: URL click-ID capture, Meta `_fbp`/`_fbc` cookie maintenance, Shopify cart attribution attributes, and TrackClear ingest calls.
- Fixed the previous TypeScript-only top-level-await issue in `meta-event-processor.test.ts`; `pnpm exec tsc --noEmit` now passes cleanly.
- Added/expanded tests for diagnostics test events, headless helper behavior, catalog settings, generated pixels, ingest catalog affixes, webhook catalog IDs, consent mapping, and workspace route validation.
- Validation: targeted tracking-quality tests passed 65/65; `pnpm test -- --run` passed 404/404 unit tests; `pnpm exec tsc --noEmit` passed cleanly; `pnpm lint` passed with existing `<img>` warnings; `pnpm build` completed successfully with existing lint/static-generation warnings. Local `pnpm prisma migrate status` could not complete because `DIRECT_DATABASE_URL` is missing and Docker/Postgres on `127.0.0.1:5433` is not running in this environment.
- Production migration applied after implementation: using `.vercel/.env.production.local`, `pnpm prisma migrate deploy` applied `20260522_add_catalog_id_settings` to the Railway production Postgres database and `pnpm prisma migrate status` then reported the schema up to date.

## 2026-05-22 - Diagnostics Mode-Aware Field Visibility

- Updated `/api/diagnostics` to resolve workspace mode through `getAllowedDestinationsForWorkspace()` and filter destination health, event coverage, matrix, data quality, recent failures, stuck events, and event-audit queries to the workspace's allowed destinations.
- Updated `/diagnostics` so V1 workspaces display only allowed destinations and the event audit field count includes core fields plus optional click/UTM fields only when they were actually captured and are relevant to an allowed destination. This removes misleading missing-field counts for absent campaign click IDs and hidden legacy destinations.
- Added `src/lib/diagnostics-audit-fields.ts` to centralize field visibility rules. Purchase keeps order ID as a core field, while AddToCart and InitiateCheckout hide order ID unless it is actually captured.
- Added tests: `diagnostics-audit-fields.test.ts` and `diagnostics-route-mode.test.ts`.
- Historical validation for this sprint passed; current project-wide validation is recorded in the latest entry above.

## 2026-05-22 - Maximum Tracking Quality Sprint 2

- Implemented the second pass from the TrackClear Maximum Tracking Quality plan, scoped to session/cart attribution recovery, webhook enrichment quality, and Tracking Health visibility.
- Generated `/api/pixel/:workspaceId` and legacy `/api/s/:workspaceId` scripts now create a `_trackclear_session_id`, send it on ingest payloads, and best-effort write `_trackclear_session_id`, click IDs, UTMs, landing page, and consent markers into Shopify cart attributes on add-to-cart and checkout-start.
- Ingest now accepts `trackclearSessionId`, `checkoutToken`, and `cartToken`, and stores browser context under TrackClear session ID, checkout token, cart token, Shopify order ID/name, and email. Session enrichment lookup merges fresh fields across all available identifiers instead of depending only on email.
- Shopify webhook Purchase enrichment now looks up Redis session context with all available identifiers, records sanitized attribution source metadata (`cart_attributes`, `session_enrichment`, `landing_site`, or `none`), includes consent markers, and keeps webhook custom data unchanged for value, currency, num_items, order_id, content_type, content_ids, and contents.
- `/tracking-health` now includes a recent webhook Purchase attribution source breakdown so operators can see whether Purchases are being enriched by cart/order attributes, Redis session enrichment, landing-site fallback, or no attribution source.
- EventLog payload sanitization now redacts `trackclearSessionId` from stored customData alongside checkout/cart tokens.
- Added tests: `session-enrichment.test.ts`, plus expanded `ingest-attribution.test.ts`, `shopify-webhook-attribution.test.ts`, `shopify-webhook-route-mode.test.ts`, `pixel-route.test.ts`, and `event-log-payload.test.ts`.
- Historical validation for this sprint passed; current project-wide validation is recorded in the latest entry above.
- No database migration is required for this sprint.
- Operational note: the cart attribute writer is best-effort inside Shopify's Custom Pixel runtime and should be confirmed on a real Shopify checkout. It is additive and does not change Mizoke/headless legacy mode or destination allowlisting.

## 2026-05-22 - Maximum Tracking Quality Sprint 1

- Implemented the first pass from the TrackClear Maximum Tracking Quality plan, scoped to Purchase identity, catalog content IDs, and TikTok payload quality.
- Added deterministic Shopify Purchase event IDs through `purchase-event-id.ts`. Generated pixel scripts, ingest, and Shopify webhooks now prefer `shopify-purchase:<workspaceId>:<order|checkout|cart>` when Shopify identifiers are available, with safe fallback to the original event ID/random UUID.
- Added `content-id.ts` and applied normalized content IDs across generated pixel payloads, ingest customData, and Shopify webhook line items. Default output is Shopify variant numeric ID with product/SKU fallbacks; helper support exists for product numeric IDs, GraphQL IDs, SKU, and custom template modes.
- Improved TikTok Events API payloads by hashing `customerId` into `external_id` when available and preferring rich `contents` with quantity/item price over flat `content_ids`.
- Sanitized EventLog customData now redacts checkout/cart tokens, so deterministic ID inputs are not persisted as raw tokens after ingestion.
- Dirava production workspace `cmlsa6h1w0001zm8nxuzn7a50` was intentionally reclassified to `SHOPIFY_META_TIKTOK_V1` + `SHOPIFY_CUSTOM_PIXEL`; Mizoke/headless workspace `cmo1hd1x600045r6d9elaw3tg` remains protected as legacy/headless.
- Added tests: `purchase-event-id.test.ts`, `content-id.test.ts`, `tiktok.test.ts`, plus expanded `ingest-attribution.test.ts`, `pixel-route.test.ts`, and `shopify-webhook-route-mode.test.ts`.
- Historical validation for this sprint passed; current project-wide validation is recorded in the latest entry above.
- Remaining roadmap work from the plan after Sprint 3: Shopify Web Pixel app path, custom ingest domain, encrypted short-lived retry payloads, and deeper CMP-specific consent automation if required.

## 2026-05-21 - Mizoke/TrackClear Attribution Hardening

- Implemented TrackClear-side changes from the Mizoke tracking handoff while preserving the existing normal Shopify Custom Pixel contract used by Dirava.
- Ingest now accepts `fbclid`, `gbraid`, and `wbraid`; derives `fbc` as `fb.1.<timestamp_ms>.<fbclid>` when `fbc` is missing; and passes the resolved `fbc` into EventLog rows, Meta queue jobs, and Redis session enrichment.
- Ingest now prefers trusted server-proxy `X-TL-Client-IP` and `X-TL-Client-UA` headers before generic proxy headers. These headers remain out of the CORS allow-list so browser clients cannot send them directly without a deliberate review.
- Meta `_fbp` validation now accepts bounded `fb.1.<timestamp_ms>.<random>` values with 7-20 numeric random digits in the server normalizer and generated pixel scripts.
- Shopify `orders/paid` webhook now reads order/cart attributes (`_fbp`, `_fbc`, `_fbclid`, `_gclid`, `_ttclid`, `_rdt_cid`, `_epik`, `utm_*`) before falling back to session enrichment and landing-site params. Landing-site `fbclid` is synthesized into `fbc` only when order/session/landing `fbc` values are absent. Relative Shopify `landing_site` values are normalized to absolute store URLs before becoming webhook Purchase `event_source_url`; unsafe or unparsable landing values fall back to `https://{shopDomain}`.
- Webhook Purchase custom data now includes `content_type: "product"`, variant-first `content_ids`, and `contents` with quantity and item price when Shopify provides them.
- Snippet Purchase events for webhook-enabled workspaces now store session enrichment before returning `webhook_active`, so checkout context can still enrich the later webhook Purchase.
- Generated `/api/pixel/:workspaceId` and legacy `/api/s/:workspaceId` scripts suppress browser `fbq("track", "Purchase")` when a Shopify webhook secret is configured, while still sending TrackClear Purchase context to ingest.
- Snippet-created EventLog rows now store sanitized `customData`, `userDataFlags`, and `clickIdFlags` instead of raw shopper `userData`; queue jobs still receive transient raw userData for destination delivery.
- Added nullable `Workspace.productMode` and `Workspace.installType`. Runtime fallback treats null/existing workspaces as `LEGACY_ALL_DESTINATIONS` + `HEADLESS_CUSTOM`; new workspaces are created as `SHOPIFY_META_TIKTOK_V1` + `SHOPIFY_CUSTOM_PIXEL`.
- Added mode-aware destination allowlisting for V1 in integrations UI, onboarding, ingest, Shopify webhooks, replay, dashboard analytics, and event views. Legacy/custom workspaces keep all destination behavior, including `onlyDestinations` and `excludeDestinations`.
- Added `LEGACY_WORKSPACE_IDS` emergency bypass support in `workspace-mode.ts`; production must include current headless/custom workspace IDs in that env var before deploy.
- Added `/tracking-health` with operational V1 checks for recent snippet event activity, webhook active/Purchase received, Meta/TikTok connection, dedup status, attribution context, and recent errors. The snippet check is not a heartbeat.
- Updated landing/pricing/OpenGraph copy to describe Shopify purchase tracking for Meta + TikTok and removed the annual pricing toggle, hidden 7-platform claims, and unproven delivery-rate claims from the public V1 path.
- Production database migration `20260521_add_workspace_product_mode` was applied, and production Mizoke workspace `cmo1hd1x600045r6d9elaw3tg` was explicitly set to `LEGACY_ALL_DESTINATIONS` + `HEADLESS_CUSTOM`. Existing null-mode workspaces still resolve to legacy/custom behavior until explicitly migrated.
- Follow-up patch after super-dev review: added idempotent Prisma migration `20260521_add_workspace_product_mode`, removed productMode/installType from public PATCH mutation, made the integrations UI use backend mode resolvers, fixed dashboard TikTok setup detection to require credentials, documented privacy-preserving replay after EventLog sanitization, and added `LEGACY_WORKSPACE_IDS` to `.env.example`.
- Final rollout hardening added `docs/deploy.md`, internal script `scripts/set-workspace-mode.ts`, accurate privacy-cookie wording for `_fbp`/`_fbc`, and visible replay privacy wording in the Events UI.
- Follow-up rollout polish filters the Events page failed-count/replay visibility by the same workspace destination allowlist as the visible event list, preventing V1 workspaces from surfacing old hidden legacy destination failures.
- Added tests: `tracking-context.test.ts`, `shopify-webhook-attribution.test.ts`, `ingest-attribution.test.ts`, `pixel-route.test.ts`, `event-log-payload.test.ts`, `workspace-mode.test.ts`, `workspace-create-mode.test.ts`, `workspace-route-mode.test.ts`, `events-page-mode.test.ts`, `shopify-webhook-route-mode.test.ts`, plus expanded `event-normalizer.test.ts` coverage.
- Historical validation for this sprint passed; current project-wide validation is recorded in the latest entry above.
- Remaining assumption: Meta catalog canonical product ID format is still not confirmed. Webhook Purchases now prefer Shopify `variant_id`, then fall back to `product_id`, then `sku` to match the browser-event variant-ID direction without deleting fallbacks.
- Product-mode rollout note: normal Shopify V1 is now live for newly created workspaces. Existing/null-mode workspaces remain legacy/custom unless explicitly migrated.
