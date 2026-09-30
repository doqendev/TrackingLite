# ChatGPT Ads for standard Shopify stores

Released 2026-09-30 at `e9ff8c7bf566c02c3be2c5fc2f3ef3dceab1294d` (PRs #19/#20).
Vercel `dpl_4pQTgYYx87aQphu61uh3m7N3Mxv6` and Railway
`7f54c9ef-621d-4e0d-8f25-5fb09c2b122f` report that exact commit. The Shopify
installation is saved; live browser, ad delivery and attribution checks remain open.

## Store setup

1. Create a standard Shopify workspace using the store's domain. The server resolves
   the canonical `myshopify.com` domain. Install both generated Custom Pixel and
   Cart Attribution Helper snippets.
2. Configure the signed Shopify `orders/paid` webhook. A saved secret is not proof:
   Tracking Health must observe a verified Shopify delivery.
3. Connect whichever destinations the store uses: Meta, TikTok, and/or ChatGPT Ads.
   ChatGPT Ads requires its own web data source Pixel ID and Conversions API key.
   The key is encrypted; the API/UI exposes only a saved-key flag.
4. Select **Save and validate**. The API uses `validate_only: true`, with no shopper
   identity and no recorded conversion. If requested, delivery enables after this
   validation succeeds. Saved credentials, validated credentials, successful event
   delivery, and campaign attribution are distinct states.
5. In OpenAI Ads Manager, create/select the conversion event settings and configure
   the campaign to optimize for `order_created`. Track Clear does not create ads,
   campaigns, budgets, billing accounts, or conversion settings automatically.
6. Verify the five commerce events and one controlled Purchase in Tracking Health,
   the event log, and the provider's event diagnostics. Check consent denial, repeat
   delivery, returning visitors, and direct checkout before relying on reporting.

Adding another store does not require a code change. Internal account owners may
be listed once in `UNLIMITED_WORKSPACE_USER_IDS` on Vercel and Railway. This changes
only the workspace allowance, not Stripe or monthly order entitlements.

The first live verification store selected by the owner is `www.infinitelayers.shop`
(`afd09a.myshopify.com`). Its own ChatGPT Ads account/source and credentials must be
configured; the currently connected Ads Manager exposes only Mizoke.

## Delivery contract

- Destination enum `OPENAI`; queue `openai-events`; disabled by default. Standard
  Shopify's existing persisted mode name remains `SHOPIFY_META_TIKTOK_V1` for
  compatibility. It now allows Meta, TikTok, and OpenAI. Headless installs cannot
  enable OpenAI: Mizoke's existing direct integration remains owned by Mizoke.
- `POST https://bzr.openai.com/v1/events?pid=<Pixel ID>` with a bearer CAPI key,
  `integration_source: trackclear`, and one event per request.
- PageView → `page_viewed`, ViewContent → `contents_viewed`, AddToCart →
  `items_added`, InitiateCheckout → `checkout_started`, Purchase → `order_created`.
  Refund is unsupported. All five use `data.type: contents`.
- Values use decimal arithmetic and ISO currency minor units. Shopper hashes use
  OpenAI's normalization rules. Phone country metadata comes from libphonenumber-js;
  no country is guessed from length and historical unverified phone hashes are omitted.
  Arbitrary custom data and personalized product names are never forwarded.
- `oppref` retains its opaque value and its URL-capture timestamp. Reading it on a
  later page cannot extend its 30-day lifetime. Both Shopify scripts use the same
  tested capture function. It travels through cart attributes, session aliases,
  and encrypted retry envelopes. Consent denial clears this marketing context.
- No OpenAI browser SDK or synthetic `obref` is introduced. The Custom Pixel is
  the Shopify event collector; the Track Clear worker makes the ad API request.
- Original occurrence time and destination pixel are persisted on EventLog.
  Retry never substitutes replay time or routes an old event to a replacement pixel.
  The worker requires an unexpired encrypted envelope (72 hours) and rechecks
  workspace status, destination/event enablement, target, consent, and tombstones
  after the final delivery claim. Redis failure fails closed for this check.
- Shopify canonical Purchase ownership and the 90-second browser fallback apply
  to OpenAI too. Checkout contact enrichment uses the same ID and original time.
- HTTP 408/425/429/5xx and network failures retry. Terminal validation/configuration
  failures remain failed. Retry-After is honored by durable recovery. Ambiguous
  network outcomes retain delivery ownership. Only safe response metadata is saved.

Commerce reporting elects one logical event across destinations instead of assuming
the first historical destination always receives every event. Purchase aliases
deduplicate across browser/webhook IDs; campaign revenue counts only Purchases.
Delivery health measures every destination independently and excludes superseded rows.

## Release and verification

Two additive migrations append `OPENAI` in its own migration and then add workspace
credentials plus original-time/target columns. Existing workspaces remain disabled.
There are now 12 workers/listeners. The runtime, worker-container, and migration
readiness checks must agree. CI covers Node 20 with PostgreSQL 16/Redis 7 and Node 24
with PostgreSQL 17/Redis 8.2; container and migration rehearsal use production versions.

Follow `docs/deploy.md` exact-SHA/database-identity gates, backups, drain, and
single-worker cutover. Do not deploy migrations or run an old worker concurrently
with a partially upgraded delivery fleet. Check Railway volume headroom first.
Configure the optional internal store allowance using `--skip-deploys` for Railway
variables; setting variables without that flag triggers a worker deployment.

Local validation: 752 unit tests and 70 integration tests pass. The latter use
isolated loopback PostgreSQL 17 and Redis 8.8, including signed-webhook/browser
Purchase reconciliation. The generated Custom Pixel executes in a browser-API
harness covering original timestamps, click lifetime, contact enrichment and denial.
TypeScript and lint pass (existing image warnings); the initial production build
passed. Exact-merge CI `36759317445` passed all five gates. Production schema and
12-listener health passed; existing Meta/TikTok queues drained successfully.
Infinite Layers uses existing IL workspace `cmlseil1700029vaisp5tkn5k` under
`infinitelayersshop@gmail.com`, as selected by the user. The empty duplicate under the
Mizoke account is inactive. Shopify and Track Clear access are working under the correct
account. The current bridge is saved in connected Custom Pixel `276791629`; its full
editor readback matches the generated snippet. The remote script returns HTTP 200 and
both scripts parse. The Cart Helper appears on the live storefront after theme PR #1
(`f1059e41ae74eee82b64faa8d20c5cbee7d383b8`), a one-line async include.
An orders/paid webhook uses JSON/API 2026-07 and the encrypted Shopify signing secret.
Shopify's Send test passed HMAC verification at 18:56 UTC and created no destination
conversion. This proves signed delivery, not a real paid Purchase or attribution.

The user confirmed Infinite Layers has no ChatGPT Ads account/data source yet. It needs
its own Pixel ID/CAPI key and conversion configuration before OpenAI can be enabled.
Native Facebook & Instagram and wetracked pixels already exist. Track Clear Meta is
paused with its saved credentials retained; TikTok/OpenAI are disabled. Agree on one
owner per platform before enabling delivery. No OpenAI conversion is claimed as verified.

Official contract: https://developers.openai.com/ads/conversions-api and
https://developers.openai.com/ads/supported-events (checked 2026-09-30).
