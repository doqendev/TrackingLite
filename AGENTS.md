# AGENTS.md

This file provides guidance to Codex when working with code in this repository.

**Documentation Rule:** After every implementation, bug fix, or significant change, update this file (AGENTS.md), STATUS.md, and MEMORY.md to reflect the new state. Keep known issues, project structure, and API reference accurate at all times. Stale documentation is worse than no documentation.

**Quality Principle:** Never apply half measures. This is a serious production product and must be fully optimized and professional. Always aim for the best possible solution — no shortcuts, no "good enough", no deferred improvements. Every change should be production-grade from the start.

## Project Overview

**Track Clear** is a standalone SaaS that enables Shopify merchants to send ecommerce events server-side to multiple ad platforms (Meta CAPI, TikTok, GA4, Klaviyo, Reddit, Pinterest, Google Ads). Primary value: "Fix your tracking in 10 minutes."

**This is NOT a Shopify embedded app.** It is a standalone web application with its own auth, dashboard, and billing. Shopify integration is via a JS snippet pasted into Shopify's Custom Pixel feature.

### Why It Exists

Browser-only pixels can lose conversion data to browser restrictions and blockers. Track Clear captures events through the Shopify pixel, sends them to the working default app host (`www.trackclear.io`) or a verified workspace ingest domain, and forwards them server-to-server to the enabled ad/analytics platforms.

### Target Users

Small-to-mid Shopify stores running ads on Meta and TikTok. Legacy/custom workspaces can still use the broader multi-destination stack. Free plan (50 orders/mo), paid plans $29-$99/mo via Stripe.

## Current State

**The 2026-08-01 location-aware consent and sale/sharing release is live in production at exact Track Clear release SHA `0a2c19e16baa73ece24c39137c091fa6d0b8a582`.** PR #6 was merged to `main`, then deployed through a controlled Vercel/Railway cutover with the old worker stopped until both runtimes were ready. Current state:
- Track Clear and the Mizoke Hydrogen storefront now use Shopify's computed Customer Privacy permissions for location-aware defaults and carry `saleOfDataAllowed` end to end. When Shopify allows tracking before a decision, Mizoke can track without forcing an opt-in; where Shopify requires opt-in, it stays off and shows the consent UI. Any explicit rejection, GPC, or sale/sharing opt-out remains authoritative: Meta/TikTok browser and server delivery are blocked, advertising identifiers are removed from cart/session enrichment, and only the existing privacy-minimized `INTERNAL` path may record an event when analytics is explicitly allowed. Mizoke is live at exact SHA `2b802ee9ac2f32de2321ca17fd073b98e930246c` after its AddToCart/InitiateCheckout analytics-only dispatch and strict Track Clear proxy payload contract were repaired.
- Build: compiles cleanly on local Node 22; the release workflow enforces Node 20 standalone and Node 24 builds; lint passes with pre-existing `<img>` optimization warnings
- Unit suite: 685/685 passing across 58 files on local Node 22 and in the release CI Node 20/24 gates
- Integration suite: 62/62 passing across 7 files in the release CI PostgreSQL 16/Redis 7 gates; the local PostgreSQL/Redis rerun remained unavailable after the workstation restart
- TypeScript and Prisma schema validation pass cleanly
- All 17 repository migrations are applied in production, including `20260730_add_internal_analytics_destination`. Production verification reports 11/11 required indexes valid and zero Prisma drift.
- 7 destination codepaths retained for legacy/custom workspaces: Meta CAPI, TikTok, GA4, Klaviyo, Reddit, Pinterest, Google Ads
- Shopify Meta+TikTok V1 mode for new normal Shopify workspaces: Custom Pixel, required storefront cart attribution helper, Shopify webhook, Meta CAPI, TikTok Events API, actionable tracking health
- Dashboard: mode-aware destination visibility, analytics deduplication, revenue cards with currency conversion, event funnel, delivery stats, campaign performance
- i18n: 6 languages (EN, PT, ES, FR, DE, IT) via next-intl v4
- Security: CSP header, email verification, GDPR account deletion, circuit breaker, env validation
- Extras: event replay, password reset, email alerts (4 alert types), UTM/gclid capture, stale pending auto-requeue, privacy/terms pages, server-proxy attribution hardening, verified custom ingest domains
- Tracking hardening: synchronous bounded `bridge-v1` startup FIFO with seven Shopify-validator-compatible literal event subscriptions, lossless encrypted webhook inbox with capture-only acknowledgement, atomic destination outbox, verified-webhook gating, cross-source Purchase alias reconciliation, final delivery claims, encrypted 72-hour retry envelopes, scoped circuit breakers, deterministic retries, timestamped consent tombstones, opt-in Meta/TikTok browser ownership, latest-touch browser identity, alias-aware Purchase usage reservation/reconciliation, and live privacy-minimized `INTERNAL` attribution for explicitly analytics-allowed/marketing-denied events
- Worker lifecycle: all 11 BullMQ listeners are constructed with `autorun: false`; required recovery schedules register first, every listener must pass `waitUntilReady()`, and only then does the latched `/health` readiness gate open. Startup failure and signals use one cleanup path. Outbound requests are capped at 30 seconds, application drain at 45 seconds, and Railway drain at 60 seconds.
- Hosting: web app on Vercel (serverless), workers on Railway, Postgres + Redis on Railway with public TCP proxies
- Release control: GitHub default/source branch is `main`; Vercel Git deployment and Railway autodeploy remain disabled. Vercel production deployment `D1NVfuLHUYdoSP8AuGPpsCjvgiHa` and Railway deployment `23e538aa-bf26-44f5-aebb-f80bdc729689` run the approved SHA. Railway uses `/railway.worker.toml` and `/Dockerfile.worker` with a 60-second drain.
- Dirava bridge rollout: Shopify custom pixel `325222664` is connected with the corrected `bridge-v1` loader. Shopify accepted the seven literal subscriptions with no editor error or no-subscription warning, and Pixel Helper observed `page_viewed` plus `product_viewed` on a real product page. The attempted product AddToCart did not change the cart, so it is not counted as AddToCart proof.
- 2026-07-30 live QA: one anonymous Mizoke AddToCart with analytics allowed and marketing denied created exactly one `INTERNAL`/`SENT` row with sanitized TikTok campaign attribution, null IP/UA/browser/click identifiers, and zero platform rows. No Purchase was created.
- 2026-08-02 Mizoke funnel repair: storefront components dispatch AddToCart and InitiateCheckout when either analytics or advertising is allowed, while both-denied remains blocked and browser/platform delivery remains advertising-gated. The same-origin proxy now sends only the strict Track Clear ingest payload; client IP and user agent remain in supported `X-TL-Client-*` headers instead of invalid JSON fields. Mizoke validation passed typecheck, production build, 344/344 tests across 82 files, and lint with zero errors plus 25 existing warnings. Oxygen workflow `30766182444` deployed exact SHA `2b802ee9ac2f32de2321ca17fd073b98e930246c`.
- 2026-08-02 live QA: one analytics-allowed/marketing-denied One Piece custom-sign AddToCart and one InitiateCheckout each created exactly one `INTERNAL`/`SENT` row, zero Meta/TikTok rows, and null IP/UA/fbp/fbc/ttclid; no Purchase was attempted and the test cart was emptied. A separate real `39.01 EUR` signed-webhook Purchase reached both Meta and TikTok as `SENT`. US geolocation/GPC behavior remains open live QA.

See `STATUS.md` for the full audit and remaining work.

## Tech Stack (Actual Versions)

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router, TypeScript, Server Components) | 14.2.35 |
| Auth | NextAuth.js v5 (email/password + Google OAuth, JWT sessions) | 5.0.0-beta.16 |
| Database | PostgreSQL 16 + Prisma ORM | Prisma 5.22.0 |
| Queue | BullMQ + ioredis | BullMQ 5.4.0, ioredis 5.3.2 |
| Billing | Stripe Subscriptions (Free $0, Starter $29, Growth $49, Scale $99 — order-based) | stripe 14.18.0 |
| UI | Tailwind CSS 3.4 + shadcn/ui (new-york style, 14 components) | |
| i18n | next-intl (cookie-based locale, 6 languages) | 4.8.3 |
| Icons | react-icons (brand icons) | 5.5.0 |
| Validation | Zod | 3.22.0 |
| Testing | Vitest + MSW | Vitest 4.0.18, MSW 2.2.0 |
| Runtime | Node.js >= 20 | |
| Package Manager | pnpm | |

## Architecture

### How It Works

1. Merchant signs up on **trackclear.io** (email/password or Google SSO)
2. Creates a "workspace" for their store
3. Enters Meta Pixel ID + Conversions API access token (encrypted at rest with AES-256-GCM)
4. Gets a unique **JS snippet** with embedded API key
5. Pastes snippet into Shopify Admin > Settings > Customer Events > Add Custom Pixel
6. Adds the required Cart Attribution Helper script to the Shopify theme (`theme.liquid` before `</head>` or Custom Liquid/theme app block equivalent) for durable cart attributes
7. The pasted `bridge-v1` snippet uses seven explicit literal `analytics.subscribe()` calls accepted by Shopify's Custom Pixel validator, buffers at most 100 early events in order, and activates the remote tracker after all handlers register
8. Snippet sends event data + `event_id` to `/api/events/ingest` with `X-TL-API-Key` header, using a verified workspace custom ingest domain when configured
9. Vercel serverless function validates, checks billing/rate limits/consent, creates EventLog, queues BullMQ job
10. Railway worker decrypts token, hashes PII (SHA-256), normalizes phone (E.164), sends to Meta CAPI
11. EventLog updated to SENT/FAILED, dashboard shows status

### Event Pipeline Detail

```
JS Snippet (browser) --> POST /api/events/ingest (X-TL-API-Key header)
  |-- Validate API key (workspace lookup with product mode + destination flags)
  |-- Zod validate the bounded payload
  |-- Apply the isolated revocation budget, then persist anchored privacy-minimized revocations before delivery-state gates and return with no destinations
  |-- Check workspace is active
  |-- Check which destinations are enabled + have credentials
  |-- Check rate limit (100 req/sec/workspace)
  |-- Check order limits (only for Purchase events, Redis monthly counter)
  |-- Prefer trusted X-TL-Client-IP / X-TL-Client-UA headers from server-side storefront proxies
  |-- Resolve fbc from fbc or fbclid (fb.1.<timestamp_ms>.<fbclid>)
  |-- Store browser context under TrackClear session ID, checkout token, cart token, order ID/name, and email when available
  |-- Check per-event toggle (enablePageView, etc.)
  |-- Check consent (STRICT/LAX mode); explicit sale/sharing opt-out blocks every marketing destination in either mode
  |-- If analytics=true and advertising is denied by marketing or sale/sharing consent, and no eligible external analytics destination exists: persist one privacy-minimized INTERNAL row and return without billing or queue work
  |-- Fan-out: atomically persist one EventLog per enabled destination (status: PENDING)
  |-- For Shopify Meta+TikTok V1 workspaces, filter fan-out to META/TIKTOK only
  |-- Queue deterministic event-<EventLog.id> BullMQ jobs per destination
  |-- Return { success: true, eventId, destinations: [...] }

Shopify webhook --> verify HMAC before any state change
  |-- Persist AES-256-GCM body in ShopifyWebhookInbox before acknowledging
  |-- Only signed orders/paid marks the workspace webhook as verified
  |-- Return the live acknowledgement immediately after durable capture
  |-- One-minute inbox worker processes canonical Purchase/refund and defers with backoff on failure
  |-- Analytics-allowed/advertising-denied Purchase persists only sanitized INTERNAL attribution; analytics-denied persists nothing
  |-- Erase payload after successful processing; retain payload-free receipt

Workers (separate process) --> Dequeue from per-destination queues
  |-- Decrypt destination credentials (AES-256-GCM)
  |-- Normalize event to destination format (hash PII where required)
  |-- Acquire final database delivery ownership and load the latest retry envelope
  |-- Skip SENT/SUPERSEDED or canonical-webhook-owned browser fallbacks
  |-- POST to destination API
  |-- Update EventLog to SENT (or FAILED on error)
  |-- Retry: 3 attempts, exponential backoff (2s, 4s, 8s)

Alert Checker (hourly repeatable job)
  |-- Evaluate tracking health, error rates, order limits
  |-- Send email alerts via Resend (24h cooldown per alert type)

Delivery Recovery (every 5 minutes)
  |-- Find stale PENDING/RETRYING and scheduled transient FAILED EventLogs
  |-- Look up workspace credentials per destination
  |-- Re-queue with the same deterministic job ID
  |-- Stop terminal configuration failures; back off transient queue/API failures

Shopify Inbox Recovery (every 1 minute)
  |-- Claim encrypted PENDING/stale PROCESSING deliveries with compare-and-set ownership
  |-- Replay through the same HMAC-verified route and canonical reconciliation
  |-- Expire unprocessed encrypted bodies after 30 days; keep payload-free receipts bounded
```

### Deduplication Strategy

- JS snippet/pixel events generate `event_id` via `crypto.randomUUID()`.
- Server-side Meta CAPI and TikTok Events API delivery is the default. TrackClear browser Meta/TikTok modes are separate persisted workspace opt-ins and remain off by default.
- When one of those browser modes is enabled, the generated script loads that platform SDK only after consent permits it and sends the same `event_id` used by TrackClear's server event. TrackClear must be the only browser owner for that dataset/Pixel ID; browser/server deduplication cannot repair two independent browser integrations.
- Purchase events normalize to `shopify-purchase:<workspaceId>:<order|checkout|cart>`. Order name wins when available; numeric and GraphQL IDs converge; generated scripts include `checkout.orderName` in both browser and server identity inputs.
- Different deterministic IDs are reconciled through normalized order name/ID plus checkout/cart aliases per destination. Canonical Shopify webhook rows reserve SENT/PENDING/RETRYING/FAILED ownership; obsolete browser rows become `SUPERSEDED` and cannot be resurrected by retained jobs.
- `INTERNAL` attribution uses a workspace-scoped SHA-256 event key instead of retaining raw event/order/session aliases. If a consented external row already exists, the internal duplicate is not created; if external delivery becomes eligible later, the matching internal row becomes `SUPERSEDED` and reporting excludes it.
- Verified-webhook browser fallbacks are delayed 90 seconds, longer than the one-minute inbox scan, then take a final database delivery claim immediately before external I/O. The webhook and worker use complementary ownership checks so whichever path claims first is the only sender; same-ID workers load the newest encrypted canonical envelope after claiming.
- Generated `/api/pixel/:workspaceId` and legacy `/api/s/:workspaceId` scripts always send Track Clear Purchase context. They suppress browser `fbq("track", "Purchase")` only after a signed `orders/paid` webhook has proven the canonical path; a saved secret alone is not proof.

## Project Structure

```
src/
  app/
    page.tsx                          # Landing page (public marketing)
    layout.tsx                        # Root layout (Inter font, Sonner Toaster, dark mode, NextIntlClientProvider)
    globals.css                       # Tailwind + CSS variable tokens (dark/light)
    privacy/page.tsx                  # Privacy policy (GDPR-compliant, accurate data disclosures)
    terms/page.tsx                    # Terms of service
    (auth)/
      layout.tsx                      # Centered card layout
      login/page.tsx                  # Email/password + Google OAuth login
      signup/page.tsx                 # Name + email + password signup, auto-login, sends verification email
      forgot-password/page.tsx        # Sends password reset email via Resend
      reset-password/page.tsx         # Token-based password reset with confirmation
    (dashboard)/
      layout.tsx                      # Auth-gated shell with sidebar nav + mobile nav
      dashboard/page.tsx              # Mode-aware analytics: revenue (currency conversion), conversion accuracy, event funnel, delivery, campaign performance, recent events
      tracking-health/page.tsx        # Operational tracking health for recent snippet activity, webhook, Meta/TikTok, Purchase, dedup, cart-helper attribution, errors
      events/page.tsx                 # Mode-aware event log table with filters + pagination (50/page) + Source/Campaign columns + event replay
      diagnostics/page.tsx            # Internal mode-aware diagnostics: destination health, matrix, data quality, event audit fields, AddToCart/checkout test events
      integrations/page.tsx           # Mode-aware destination setup; V1 shows Shopify webhook, Meta, TikTok; legacy shows all destination cards
      settings/page.tsx               # Event toggles, consent, catalog ID matching, custom ingest domain, snippet, alerts, language/currency selectors, danger zone
      billing/page.tsx                # Current plan, trial status, plan cards, FAQ
      onboarding/
        page.tsx                      # 3-step wizard: create workspace, install Custom Pixel + Cart Helper snippets, connect platforms
        layout.tsx                    # Pass-through (page renders as fixed overlay)
    api/
      auth/[...nextauth]/route.ts     # NextAuth handler
      auth/signup/route.ts            # POST: create user (Zod, bcrypt, 409 on dupe), sends verification email
      auth/forgot-password/route.ts   # POST: generate token, send reset email
      auth/reset-password/route.ts    # POST: validate token, update password
      auth/verify-email/route.ts      # GET: token-based email verification, sets emailVerified
      diagnostics/route.ts            # GET: internal mode-aware diagnostics data for active workspace debugging
      events/ingest/route.ts          # POST: consent-aware external fan-out plus privacy-minimized internal analytics fallback
      custom-ingest-domain/check/route.ts # GET: public marker route used to verify merchant-owned custom ingest domains
      workspaces/route.ts             # GET/POST: list/create workspaces (unlimited)
      workspaces/[id]/route.ts        # GET/PATCH/DELETE: workspace CRUD; product mode/install type are read-only to client PATCH requests; catalog ID matching and custom ingest domain are merchant-editable
      workspaces/[id]/custom-ingest-domain/verify/route.ts # POST: checks saved custom domain routes to TrackClear before enabling it
      workspaces/[id]/diagnostics/test-event/route.ts # POST: authenticated non-Purchase diagnostic AddToCart/InitiateCheckout through ingest
      workspaces/[id]/rotate-key/route.ts  # POST: rotate API key
      workspaces/[id]/analytics/route.ts   # GET: dashboard analytics (cached 60s)
      workspaces/[id]/replay/route.ts # POST: re-queue failed events (500 max, 5min cooldown, privacy-preserving replay)
      alerts/preferences/route.ts     # GET/PUT: alert notification preferences
      user/preferences/route.ts      # PATCH: update display currency and language
      user/account/route.ts          # DELETE: GDPR account deletion (cancels Stripe, cascades all data)
      snippet/[workspaceId]/route.ts  # GET: generate versioned bridge-v1 loader with bounded ordered early-event buffering
      cart-helper/[workspaceId]/route.ts # GET: storefront theme helper JS for durable Shopify cart attribution attributes
      pixel/[workspaceId]/route.ts    # GET: 30s-cached Custom Pixel JS (bridge activation, consent, browser owners, session/catalog/Purchase guard)
      s/[workspaceId]/route.ts        # GET: 30s-cached legacy public pixel JS with matching tracking behavior
      stripe/checkout/route.ts        # POST: create Stripe checkout session
      stripe/portal/route.ts          # POST: create Stripe billing portal session
      stripe/webhook/route.ts         # POST: handle Stripe webhooks (5 event types)
      health/route.ts                 # GET: fail-closed DB/schema/Redis readiness check (200 ready, 503 degraded)
  components/
    ui/                               # 14 shadcn/ui components (see list below)
    dashboard/
      sidebar-nav.tsx                 # Desktop sidebar + MobileNav (Sheet drawer)
      order-usage-bar.tsx             # Order usage progress bar with plan badge
      revenue-cards.tsx               # 3 revenue cards with yesterday delta
      event-funnel.tsx                # 5-row event funnel with horizontal bars
      delivery-stats.tsx              # 24h delivery metrics: success rate, delivered/failed
      conversion-accuracy.tsx         # Purchase delivery accuracy (7d/30d toggle)
      recent-events.tsx               # Last 10 events mini-table with value column
      replay-button.tsx               # Retry failed events button (bulk + per-event)
      campaign-performance.tsx        # Top campaigns by revenue with per-platform tabs (30d)
    settings/
      settings-form.tsx               # Workspace settings: event toggles, consent, catalog IDs, custom ingest domain, required Cart Helper install card, snippet, language/currency selectors, danger zone
      alert-preferences.tsx           # Email alert notification toggles
    billing/
      plan-cards.tsx                  # Starter/Growth plan comparison + subscribe buttons
  lib/
    auth.ts                           # NextAuth config (Google + Credentials providers)
    db.ts                             # Prisma singleton
    utils.ts                          # cn() - clsx + tailwind-merge
    encryption.ts                     # AES-256-GCM encrypt/decrypt
    hash-pii.ts                       # SHA-256 hashing for Meta user_data fields
    phone-normalizer.ts               # E.164 normalization (55 country prefixes)
    consent.ts                        # STRICT/LAX consent checking
    api-key.ts                        # Generate/validate tl_ API keys
    stripe.ts                         # Stripe client + STRIPE_PLANS constants
    billing.ts                        # atomic alias-aware Purchase reservations/reconciliation + plan limits/auto-upgrade
    constants.ts                      # BILLING_PLANS (order-based), AUTO_UPGRADE_MAP, PLAN_PRICE_MAP, RATE_LIMIT, QUEUE_CONFIG, META_API_*
    meta-capi.ts                      # POST to Meta Graph API, MetaCapiError class
    event-normalizer.ts               # SnippetEventPayload -> MetaCapiEvent (handles camelCase+snake_case and bounded Meta cookie validation)
    event-log-payload.ts              # Sanitized EventLog payload builder (customData + flags, no raw userData)
    internal-attribution.ts           # Anonymous first-party attribution records for analytics-allowed/marketing-denied events; never queued externally
    event-delivery-guard.ts           # final alias election and token-checked outbound ownership/settlement
    event-replay-queue.ts             # deterministic destination replay job construction
    event-retry-envelope.ts           # short-lived encrypted full-fidelity event envelope
    deployment-database-identity.ts   # runtime/direct writable-primary match plus approved database/schema/system-ID pin
    deployment-schema.ts              # required migration/index runtime readiness assertion
    production-release-gate.ts        # exact provider environment and full-SHA production approval gates
    purchase-event-id.ts              # Deterministic Shopify Purchase event_id helper for ingest and webhooks
    content-id.ts                     # Shopify catalog content ID normalization helpers and workspace catalog settings resolver
    custom-ingest-domain.ts           # Custom ingest domain normalization, validation, verification URL, and endpoint resolvers
    workspace-mode.ts                 # Product mode/install type fallback + destination allowlist helpers
    diagnostics-audit-fields.ts       # Mode-aware diagnostics field visibility/counts for core vs optional click/UTM data
    tracking-health.ts                # Operational health checks for Shopify V1 readiness, including actionable cart-helper attribution status
    session-enrichment.ts             # Redis browser context store keyed by TrackClear session ID, checkout/cart/order identifiers, and email
    analytics.ts                      # Dashboard analytics with external fan-out deduplication, internal attribution reporting, and currency conversion
    analytics-cache.ts                # Redis caching wrapper for analytics (60s TTL, keyed by destination+currency)
    tracking-context.ts               # Server-proxy client IP/UA extraction + fbclid-derived fbc helpers
    shopify-webhook-attribution.ts    # Shopify order/cart/landing-site attribution extraction + absolute webhook Purchase URL/content helpers
    shopify-webhook-inbox.ts          # encrypted HMAC-verified capture, claims, replay backoff, retention, timing constants
    shopify-cart-attribution-helper.ts # Storefront cart attribution helper generator + pure cart attribute extraction/write/verify helpers
    headless-sdk.ts                   # Headless/Hydrogen helper for click attribution, _fbp/_fbc cookies, _trackclear_session_id, cart attributes, and ingest calls
    currency.ts                       # Exchange rate fetcher (frankfurter.app API), Redis-cached 24h
    queue.ts                          # Lazy BullMQ queues (7 destinations), MetaEventJob + DestinationEventJob interfaces
    rate-limit.ts                     # Lazy Redis rate limiter (100 req/sec/workspace)
    replay-rate-limit.ts              # Redis cooldown for event replay (5min per workspace)
    email.ts                          # Resend client for password reset, alert emails, and email verification
    alerts.ts                         # Alert evaluation: health, errors, limits
    api-key-cache.ts                  # Redis-cached workspace lookup by API key (used by ingest route)
    circuit-breaker.ts                # Redis-based circuit breaker for destination APIs (5 failures = 60s cooldown)
    env-validation.ts                 # Validates required env vars at startup, warns for optional
    extract-custom-data.ts            # Extract value/currency/numItems/orderId from customData
    destinations/
      index.ts                        # DESTINATION_EVENT_MAP for all 7 platforms
      tiktok.ts                       # TikTok normalizer + Events API client, external_id hashing, rich contents
      ga4.ts                          # GA4 normalizer + Measurement Protocol client
      klaviyo.ts                      # Klaviyo normalizer + Events API client (raw email)
      reddit.ts                       # Reddit normalizer + Conversions API client (rdtCid click ID)
      pinterest.ts                    # Pinterest normalizer + Conversions API client (epik click ID, value as string)
      google-ads.ts                   # Google Ads pixel endpoint normalizer + client (server-side GET, Enhanced Conversions, Gmail normalization)
  types/
    meta-capi.ts                      # MetaCapiEvent, MetaUserData, MetaCustomData, etc.
    events.ts                         # SnippetEventPayload
    app.ts                            # WorkspaceWithStats, DashboardStats
    next-auth.d.ts                    # Module augmentation (adds id to Session.user)
  workers/
    start-worker.ts                   # Paused 11-worker startup, readiness latch, failure cleanup, 45s drain
    worker-health.ts                  # 11-listener + startup-latch + PostgreSQL/Redis readiness evaluation
    meta-event-processor.ts           # BullMQ worker: circuit breaker, decrypt, normalize, send to Meta CAPI
    tiktok-event-processor.ts         # BullMQ worker: circuit breaker, TikTok Events API
    ga4-event-processor.ts            # BullMQ worker: circuit breaker, GA4 Measurement Protocol
    klaviyo-event-processor.ts        # BullMQ worker: circuit breaker, Klaviyo Events API
    reddit-event-processor.ts         # BullMQ worker: circuit breaker, Reddit Conversions API
    pinterest-event-processor.ts      # BullMQ worker: circuit breaker, Pinterest Conversions API
    google-ads-event-processor.ts     # BullMQ worker: circuit breaker, Google Ads pixel endpoint
    alert-checker.ts                  # Hourly repeatable job: evaluate alerts, send emails
    stale-pending-requeue.ts          # deterministic delivery recovery + hourly alias-aware usage reconciliation
    shopify-webhook-inbox-worker.ts   # one-minute encrypted Shopify inbox processing/replay
    event-log-cleanup.ts              # bounded EventLog/inbox/envelope retention cleanup
  i18n/
    request.ts                        # next-intl config (cookie-based locale resolution)
  middleware.ts                       # Auth redirect for protected routes
messages/
  en.json                             # English translations (~250 keys)
  pt.json                             # Portuguese translations
  es.json                             # Spanish translations
  fr.json                             # French translations
  de.json                             # German translations
  it.json                             # Italian translations
tests/
  unit/
    analytics-cache.test.ts           # 7 tests (Redis analytics cache behavior)
    analytics.test.ts                 # 29 tests (dashboard analytics, including internal-reporting/external-health separation)
    api-key.test.ts                   # 12 tests
    billing.test.ts                   # 28 tests (atomic reservations, aliases, reconciliation markers)
    cart-helper-route.test.ts         # 3 tests
    circuit-breaker.test.ts           # 15 tests (workspace-scoped transient/terminal behavior)
    consent.test.ts                   # 29 tests
    content-id.test.ts                # 6 tests (Shopify catalog content ID normalization, rich direct-ingest fields, and workspace settings resolver)
    custom-ingest-domain.test.ts      # 5 tests (custom domain normalization, validation, and verified endpoint resolution)
    custom-ingest-domain-verify-route.test.ts # 3 tests (verification route success/failure/missing-domain guard)
    delivery-claim-workers.test.ts    # 7 tests (all destination workers honor final ownership)
    deployment-database-identity.test.ts # 4 tests (runtime/direct writable-primary identity checks)
    deployment-schema.test.ts         # 4 tests (required migration/index readiness and sanitized failures)
    diagnostics-audit-fields.test.ts  # 5 tests (mode-aware captured-field visibility and counts)
    diagnostics-route-mode.test.ts    # 1 test (Diagnostics API uses workspace destination allowlist)
    diagnostics-test-event-route.test.ts # 2 tests (safe AddToCart/InitiateCheckout diagnostics through ingest)
    encryption.test.ts                # 12 tests
    event-delivery-guard.test.ts      # 14 tests (alias election, attempting/accepted claims, settlement)
    event-log-cleanup.test.ts         # 2 tests (retention and accepted/attempting protection)
    event-log-payload.test.ts         # 2 tests (EventLog payload PII redaction + flags)
    event-normalizer.test.ts          # 50 tests (all 5 event types + camelCase handling + Meta cookie validation)
    event-replay-queue.test.ts        # 6 tests (deterministic recovery queueing)
    event-retry-envelope.test.ts      # 3 tests (encrypted short-lived replay payload)
    events-page-mode.test.ts          # 1 test (Events page failed-count respects workspace destination allowlist)
    extract-custom-data.test.ts       # 29 tests (bounded customData extraction)
    google-ads.test.ts                # 34 tests (email normalization, param building, pixel endpoint)
    hash-pii.test.ts                  # 24 tests
    headless-sdk.test.ts              # 20 tests (consent, revocation replay/serialization, fallback session anchors, attribution, cookies/session, cart attributes, ingest client)
    ingest-attribution.test.ts        # 30 tests (outbox, attribution, explicit internal-only consent path, tombstones, billing aliases, fallback delay, checkout enrichment)
    internal-attribution.test.ts      # 6 tests (sanitization, hashed identity, no external delivery fields, consent-transition supersession)
    ingest-validation.test.ts         # 9 tests (strict bounded payload validation and minimized revocation exception)
    meta-capi.test.ts                 # 21 tests
    meta-event-processor.test.ts      # 8 tests (delivery ownership, acceptance, errors, retry)
    middleware-public-routes.test.ts  # 7 tests (public routes plus fail-closed production release middleware)
    phone-normalizer.test.ts          # 16 tests
    pixel-route.test.ts               # 11 tests (browser ownership, consent revocation replay/serialization, exact IDs, cache and Purchase guard)
    production-release-gate.test.ts   # 11 tests (exact provider environment and full-SHA production gates)
    purchase-event-id.test.ts         # 10 tests (deterministic IDs and cross-source aliases)
    rate-limit.test.ts                # 17 tests (delivery plus isolated consent-revocation budgets)
    replay-route.test.ts              # 3 tests (privacy-preserving deterministic manual replay)
    session-enrichment.test.ts        # 12 tests (multi-key context, atomic value-aware tombstones, cross-alias denial)
    shopify-cart-attribution-helper.test.ts # 13 tests (consent, URL/session/cart write/verify/retry, no raw PII)
    shopify-domain-resolver.test.ts   # 28 tests (Shopify domain resolution)
    shopify-webhook.test.ts           # 6 tests (HMAC/replay/header verification)
    shopify-webhook-attribution.test.ts # 15 tests (order/landing attribution, consent freshness, catalog IDs)
    shopify-webhook-inbox.test.ts     # 12 tests (durable encrypted capture/claim/backoff/retention)
    shopify-webhook-inbox-worker.test.ts # 5 tests (internal replay and failure handling)
    shopify-webhook-route-mode.test.ts # 21 tests (capture-only ACK, canonical reconciliation, explicit-consent internal attribution, allowlists/catalogs)
    snippet-route.test.ts             # 5 tests (verified host and bounded ordered bridge-v1 startup)
    stale-pending-requeue.test.ts     # 8 tests (deterministic retries and alias-aware usage reconciliation)
    tiktok.test.ts                    # 3 tests (external_id hashing and rich contents)
    tiktok-event-processor.test.ts    # 7 tests (claim-token settlement and retry semantics)
    tracking-context.test.ts          # 6 tests (fbc synthesis and proxy headers)
    tracking-health.test.ts           # 4 tests (attribution states and SENT-only duplicate health)
    worker-health.test.ts             # 10 tests (startup latch, 11-listener readiness, dependency health, exact commit)
    workspace-create-mode.test.ts     # 1 test (new workspace V1/custom-pixel defaults)
    workspace-mode.test.ts            # 3 tests (null legacy fallback, V1 destination allowlist, env bypass)
    workspace-route-mode.test.ts      # 12 tests (mode guards, catalog/domain validation, browser owner flags)
prisma/
  schema.prisma                       # 12 models, 11 enums (see Data Model below)
docs/
  deploy.md                           # Deployment runbook including required production migrations
  custom-ingest-domain.md             # Custom ingest domain setup, verification, and operational notes
  shopify-cart-attribution-helper.md  # Storefront cart attribution helper install and QA notes
  headless-shopify.md                 # Hydrogen/custom storefront tracking helper usage
  qa/
    dirava-order-5076.md              # Controlled production order QA evidence and remaining proof gaps
    dirava-cart-helper-test.md        # Paid Dirava cart-helper QA evidence for cart_attributes attribution
    dirava-buy-now-flow.md            # Pending buy-now/direct-checkout QA evidence template
    dirava-returning-visitor-flow.md  # Pending returning-visitor QA evidence template
    dirava-delayed-checkout-flow.md   # Pending delayed-checkout QA evidence template
    dirava-catalog-modes.md           # Pending non-default catalog mode QA evidence template
```

### shadcn/ui Components (14 installed)

`alert.tsx`, `alert-dialog.tsx`, `accordion.tsx`, `badge.tsx`, `button.tsx` (custom `brand` variant), `card.tsx`, `input.tsx`, `label.tsx`, `radio-group.tsx`, `separator.tsx`, `sheet.tsx`, `sonner.tsx`, `switch.tsx`, `table.tsx`

### Data Model

**Models:** User, Account, Session, VerificationToken (NextAuth), PasswordResetToken, Workspace, EventLog, ShopifyWebhookInbox, Subscription, AlertPreference, AlertLog, WebhookDeadLetter

**Key relationships:**
- User has many Workspaces subject to the active plan limit (Scale is unlimited), one Subscription, one AlertPreference, many PasswordResetTokens, displayCurrency (default "USD"), language (default "en")
- Workspace has many EventLogs and ShopifyWebhookInbox receipts, stores nullable `productMode`/`installType`, signed-webhook verification timestamps, workspace-level catalog ID matching settings (`catalogIdMode`, prefix, suffix, template), optional verified custom ingest domain fields, encrypted credentials for all 7 destination codepaths, per-destination enable toggles, and explicit-off-by-default Meta/TikTok browser tracking flags
- EventLog has a `destination` field (META/TIKTOK/GA4/KLAVIYO/REDDIT/PINTEREST/GOOGLE_ADS/INTERNAL); external fan-out uses one row per eligible platform and privacy-minimized first-party attribution uses one terminal INTERNAL row
- EventLog stores monetary data, normalized Purchase aliases, retry scheduling/claim metadata, and an optional short-lived encrypted retry envelope
- EventLog stores UTM attribution data (utmSource, utmMedium, utmCampaign, utmContent, utmTerm, gclid)
- ShopifyWebhookInbox stores a verified delivery encrypted until processing succeeds, then keeps a payload-free operational receipt for bounded cleanup

**Enums:** Platform, WorkspaceProductMode, WorkspaceInstallType, CatalogIdMode, EventName (6 events including Refund), EventStatus (PENDING/SENT/FAILED/RETRYING/SUPERSEDED), ConsentMode, BillingPlan, SubscriptionStatus, Destination (8 values including INTERNAL), ShopifyWebhookInboxStatus (PENDING/PROCESSING/PROCESSED/EXPIRED)

## Development Commands

```bash
# Local services (PostgreSQL on port 5433, Redis on 6379)
docker compose up -d

# Install dependencies
pnpm install

# Apply local database migrations
pnpm prisma migrate dev

# Apply committed migrations in production/CI
pnpm prisma migrate deploy

# Internal-only workspace mode classification
pnpm tsx scripts/set-workspace-mode.ts <workspaceId> <productMode> <installType>

# Run development server (port 3000)
pnpm dev

# Run the BullMQ worker (separate terminal, required for event processing)
pnpm worker

# Build locally/CI without the provider release assertion
pnpm build

# Build a Vercel deployment (production runs the read-only release/schema gate)
pnpm build:vercel

# Build for Railway standalone (Docker)
pnpm build:railway

# Run unit tests (see STATUS.md for the latest verified count)
pnpm test

# Run a single test file
pnpm vitest run tests/unit/hash-pii.test.ts

# Run integration tests (62 tests, 7 files; isolated loopback PostgreSQL + Redis DB 15)
pnpm test:integration

# Run all tests (unit + integration)
pnpm test:all

# Lint
pnpm lint

# Open Prisma Studio (DB browser)
pnpm prisma studio
```

### Environment Variables

All documented in `.env.example`. Critical ones:
- `DATABASE_URL` - PostgreSQL pooled/runtime connection (port 5433 to match docker-compose)
- `DIRECT_DATABASE_URL` - PostgreSQL direct migration connection; required by Prisma migrate/status
- `REDIS_URL` - Redis connection
- `NEXTAUTH_SECRET` - JWT signing
- `ENCRYPTION_KEY` - 64 hex chars (32 bytes) for AES-256-GCM
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` - Stripe integration
- `STRIPE_STARTER_PRICE_ID`, `STRIPE_GROWTH_PRICE_ID`, `STRIPE_SCALE_PRICE_ID` - Stripe product prices
- `NEXT_PUBLIC_INGEST_URL` - **Required for local dev** (defaults to production URL if unset)
- `NEXT_PUBLIC_APP_URL` - Base URL for Stripe redirect callbacks
- `NEXT_PUBLIC_CUSTOM_INGEST_CNAME_TARGET` - DNS target shown in Settings for custom ingest domains (default `cname.vercel-dns.com`)
- `LEGACY_WORKSPACE_IDS` - comma-separated emergency bypass list; matching workspace IDs always resolve to legacy/headless mode
- `TRACKCLEAR_PRODUCTION_RELEASE_SHA` - exact approved 40-character commit SHA required by Vercel and Railway production gates
- `TRACKCLEAR_PRODUCTION_RAILWAY_ENVIRONMENT_ID` - exact Railway production environment ID required before migration or worker startup
- `TRACKCLEAR_PRODUCTION_DATABASE_NAME` - verified production PostgreSQL database name
- `TRACKCLEAR_PRODUCTION_DATABASE_SCHEMA` - verified production schema (normally `public`)
- `TRACKCLEAR_PRODUCTION_DATABASE_SYSTEM_IDENTIFIER` - verified numeric PostgreSQL cluster identifier; not a credential, but a physical clone can retain it

## API Reference

### Public Endpoints (no auth)

| Route | Method | Purpose |
|-------|--------|---------|
| `POST /api/events/ingest` | POST | Event ingestion from snippets/proxies. Header: `X-TL-API-Key`. Optional server-only headers: `X-TL-Client-IP`, `X-TL-Client-UA`. CORS: `*` |
| `GET /api/custom-ingest-domain/check` | GET | Public marker route used by server-side custom ingest domain verification |
| `GET /api/cart-helper/:workspaceId` | GET | Public storefront theme helper JS that writes and verifies TrackClear attribution in Shopify cart attributes |
| `GET /api/pixel/:workspaceId` | GET | 30-second shared-cache Custom Pixel tracker loaded by `bridge-v1` |
| `GET /api/s/:workspaceId` | GET | 30-second shared-cache legacy direct tracker |
| `POST /api/webhooks/shopify` | POST | HMAC verification and encrypted durable capture; live requests acknowledge before inbox processing |
| `POST /api/stripe/webhook` | POST | Stripe webhook handler (signature verified) |
| `GET /api/health` | GET | Release approval, pinned DB identity, migration/index, and Redis readiness; HTTP 200 when ready and 503 when degraded |
| `POST /api/auth/signup` | POST | User registration, sends verification email |
| `GET /api/auth/verify-email` | GET | Token-based email verification |
| `POST /api/auth/forgot-password` | POST | Generate reset token, send email |
| `POST /api/auth/reset-password` | POST | Validate token, update password |
| `/api/auth/*` | ALL | NextAuth handlers |

### Protected Endpoints (session required)

| Route | Method | Purpose |
|-------|--------|---------|
| `GET /api/diagnostics` | GET | Internal diagnostics data filtered by workspace mode/destination allowlist |
| `GET/POST /api/workspaces` | GET, POST | List/create workspaces |
| `GET/PATCH/DELETE /api/workspaces/:id` | GET, PATCH, DELETE | Workspace CRUD; product mode/install type are read-only to client PATCH requests; catalog ID matching and custom ingest domain settings are editable |
| `POST /api/workspaces/:id/custom-ingest-domain/verify` | POST | Verify saved custom ingest domain by checking the TrackClear marker route through that host |
| `POST /api/workspaces/:id/rotate-key` | POST | Rotate workspace API key |
| `POST /api/workspaces/:id/replay` | POST | Re-queue failed events (500 max, 5min cooldown, privacy-preserving after EventLog sanitization) |
| `POST /api/workspaces/:id/diagnostics/test-event` | POST | Authenticated non-Purchase AddToCart/InitiateCheckout diagnostic event through ingest |
| `GET /api/workspaces/:id/analytics` | GET | Dashboard analytics with destination filter + currency conversion |
| `PATCH /api/user/preferences` | PATCH | Update user display currency and language |
| `DELETE /api/user/account` | DELETE | GDPR account deletion (cancels Stripe, cascades all data) |
| `GET/PUT /api/alerts/preferences` | GET, PUT | Alert notification preferences |
| `GET /api/snippet/:workspaceId` | GET | Generate versioned `bridge-v1` with synchronous bounded early-event buffering |
| `POST /api/stripe/checkout` | POST | Create Stripe checkout session |
| `POST /api/stripe/portal` | POST | Create Stripe billing portal session |

### Ingest Endpoint Schema

```
POST /api/events/ingest
Header: X-TL-API-Key: tl_<64 hex chars>
Header: Content-Type: application/json

{
  eventName: "PageView" | "ViewContent" | "AddToCart" | "InitiateCheckout" | "Purchase",
  eventId: string,          // browser UUID or deterministic Shopify Purchase identity
  timestamp: number,        // milliseconds
  url?: string,
  referrer?: string,
  trackclearSessionId?: string | null, // _trackclear_session_id cookie generated by TrackClear pixel
  checkoutToken?: string | null,       // Shopify checkout token when available
  cartToken?: string | null,           // Shopify cart token when available
  fbp?: string | null,      // _fbp cookie
  fbc?: string | null,      // _fbc cookie
  fbclid?: string | null,   // raw Meta click ID; server derives fbc if fbc is missing
  gbraid?: string | null,
  wbraid?: string | null,
  ttclid?: string | null,   // TikTok click ID
  rdtCid?: string | null,   // Reddit click ID
  epik?: string | null,     // Pinterest click ID
  utmSource?: string | null,
  utmMedium?: string | null,
  utmCampaign?: string | null,
  utmContent?: string | null,
  utmTerm?: string | null,
  gclid?: string | null,    // Google click ID (captured for attribution, not forwarded)
  gaClientId?: string | null,
  consent?: { analyticsAllowed?: boolean, marketingAllowed?: boolean },
  userData?: { email?, phone?, firstName?, lastName?, city?, state?, zip?, countryCode? },
  customData?: Record<string, unknown>  // camelCase keys (contentIds, numItems, etc.)
}
```

## Key Design Decisions

- **Standalone SaaS, NOT Shopify app:** Own auth, own billing (Stripe), own dashboard. No `@shopify/*` packages.
- **JS snippet approach:** Merchant pastes `bridge-v1` into Shopify Custom Pixel. It uses a literal `analytics.subscribe("event_name", ...)` call for each of the seven used Shopify events so Shopify's editor can validate the subscriptions, preserves up to 100 early events in one FIFO, then activates the versioned remote tracker after all handlers register. Remote tracker changes auto-update; loader-bridge changes require repasting every store.
- **Server-side CAPI:** All Meta CAPI calls happen server-to-server. The snippet bridges browser context (cookies, IP, UA) to our server.
- **E.164 phone normalization:** Country code inferred from billing address (55-country map) before SHA-256 hashing.
- **Token encryption:** Meta access tokens encrypted at rest using AES-256-GCM.
- **Workspace model:** Each merchant has workspaces with unique API keys, subject to the active plan's workspace limit and shared order pool.
- **Multi-destination fan-out:** Ingest route creates one EventLog + one BullMQ job per enabled destination. Each destination has its own queue, worker, normalizer, and API client.
- **Product-mode rollout:** `Workspace.productMode` and `Workspace.installType` are nullable for safe migration. Runtime fallback treats missing values as `LEGACY_ALL_DESTINATIONS` + `HEADLESS_CUSTOM`; new workspaces are created as `SHOPIFY_META_TIKTOK_V1` + `SHOPIFY_CUSTOM_PIXEL`. V1 workspaces are allowlisted to Meta/TikTok in UI, ingest, webhook, replay, analytics, and event views, including Events page failed-count/replay visibility. Public workspace PATCH requests cannot mutate product mode/install type. `LEGACY_WORKSPACE_IDS` can force legacy behavior as an emergency bypass.
- **Custom ingest domains:** Workspaces can save a merchant-owned custom ingest domain. TrackClear only uses it after `POST /api/workspaces/:id/custom-ingest-domain/verify` confirms that `https://<domain>/api/custom-ingest-domain/check` returns the TrackClear marker. Unverified workspaces keep the default TrackClear app/ingest endpoints. Vercel may request either a CNAME target or an A record for a specific domain; follow Vercel's per-domain instruction. Dirava is not currently using this feature.
- **Deployment order:** Pin the verified production database name/schema/system identifier, apply all committed migrations and verify eleven indexes, stop/drain all old workers, deploy the new web build while delivery is paused, wait for zero old Vercel invocations plus the configured duration buffer, then start exactly one new worker fleet. Never run mixed old/new workers or use a prebuilt production Vercel deployment. After new-version traffic, an older worker that does not understand current inbox/claim/enum state is not a safe rollback. See `docs/deploy.md`.
- **Lazy Redis connections:** Queue and rate-limit modules use lazy singleton pattern to avoid build-time connection failures.
- **customData dual-format:** Event normalizer accepts both camelCase (from snippet) and snake_case via `pick()` helper.
- **Analytics deduplication:** Multi-destination fan-out creates one EventLog per destination per event. Dashboard "All" view deduplicates by filtering to a canonical destination (first enabled). Per-destination tabs show filtered stats. Cache key: `analytics:{workspaceId}:{destination|all}:{currency|default}`.
- **Currency conversion:** Users set `displayCurrency` on their profile. Revenue values converted via frankfurter.app API (free, no key). Exchange rates cached in Redis for 24h. Fallback: show unconverted if API fails.
- **Internationalization:** next-intl v4 with cookie-based locale (no URL prefixes). 6 languages: EN, PT, ES, FR, DE, IT. ~250 translation keys per language in `messages/*.json`. Server components use `getTranslations`, client components use `useTranslations`. Language preference stored on User model, synced to `locale` cookie on login/change.
- **Analytics caching:** Dashboard analytics cached in Redis for 60 seconds (`analytics:{workspaceId}:{dest}:{currency}` key). All queries run in parallel via `Promise.all()`. Cache miss falls back to direct DB computation.
- **Klaviyo raw email:** Klaviyo requires unhashed email for profile matching, unlike Meta/TikTok/Reddit/Pinterest which all use SHA-256.
- **Email alerts:** Hourly BullMQ repeatable job evaluates tracking health, error rates, and order limits. 24h cooldown per alert type per user.
- **UTM attribution:** Snippet captures UTM params + gclid + rdtCid + epik once at IIFE init (landing page URL) and passes with every event. Stored on EventLog for campaign performance analytics.
- **Server-proxy shopper context:** Headless storefront proxies can pass real shopper IP/UA with `X-TL-Client-IP` and `X-TL-Client-UA`. These headers are intentionally not exposed in the public CORS allow-list.
- **Meta fbc/fbp recovery:** Ingest accepts raw `fbclid` and derives `fbc` as `fb.1.<timestamp_ms>.<fbclid>` when `_fbc` is missing. Existing `_fbc` values are preserved. `_fbp`/`_fbc` validation accepts any numeric subdomain index (`fb.<n>.`), and `_fbp` random IDs from 7 to 20 digits, so real Meta cookies set at other domain depths are never discarded or overwritten.
- **Checkout contact enrichment (Meta + TikTok):** `checkout_started` queues the initial InitiateCheckout job for META and TIKTOK with a 90-second delay (`CHECKOUT_ENRICHMENT_DELAY_MS`). Shopify's `checkout_contact_info_submitted` re-sends the same event ID with email/phone via `onlyDestinations: ["META","TIKTOK"]`; ingest refreshes only unclaimed PENDING rows so the delayed worker sends one enriched event per destination. Rows already claimed or terminal are never reopened.
- **Anonymous external_id:** Marketing-consented events carry `trackclearSessionId` through jobs and retry envelopes. Meta receives `external_id` as an array (hashed `customerId` plus hashed session ID); TikTok receives one `external_id`, preferring hashed `customerId` and falling back to the hashed session ID. This stitches anonymous funnel events to the identified webhook Purchase.
- **Shopify session/cart attribution:** Generated pixel scripts create a `_trackclear_session_id`, persist it in a first-party cookie, and best-effort write `_trackclear_session_id`, click IDs, UTMs, landing page, and consent markers into Shopify cart attributes on add-to-cart/checkout-start. The storefront Cart Attribution Helper (`/api/cart-helper/:workspaceId`) is the reliability layer for normal Shopify themes: it runs outside the Custom Pixel sandbox, writes early/repeatedly through same-origin `/cart/update.js`, verifies through `/cart.js`, retries once, stores local diagnostics, and never writes raw shopper PII. Ingest stores browser context under TrackClear session ID, checkout token, cart token, order ID/name, and email so Shopify webhook Purchases can recover attribution even when email is missing or delayed.
- **Controlled production QA artifacts:** Store real-order QA evidence under `docs/qa/` without raw PII or full webhook payloads. Dirava order `#5076` proved webhook Purchase flow and session enrichment for a controlled `0 EUR` order. Dirava order `#5077` proved the storefront Cart Attribution Helper and paid revenue propagation for one normal paid `0.5 EUR` order with `cart_attributes` attribution.
- **Deterministic Purchase event IDs:** Snippet, generated pixel, and Shopify webhook Purchase events use deterministic Shopify identifiers when possible (`shopify-purchase:<workspaceId>:<order|checkout|cart>`). Order name is preferred over numeric order ID when both are present so browser checkout events and Shopify webhooks converge on the same order-based ID; numeric and GraphQL order IDs still normalize to the same fallback segment.
- **Catalog content ID normalization:** Generated pixel, legacy script, ingest, and Shopify webhook Purchase payloads normalize Shopify product/variant content IDs through `content-id.ts`. Workspace settings control variant numeric, product numeric, GraphQL, SKU, prefix/suffix, and custom template modes from Settings.
- **Headless storefront helper:** `headless-sdk.ts` gives Hydrogen/custom storefronts a reusable client for consent-mode-aware URL click-ID capture, Meta `_fbp`/`_fbc` and TikTok `_ttp` cookie maintenance, `_trackclear_session_id` creation/persistence, Shopify cart attribution attributes, and TrackClear ingest calls. STRICT mode requires an explicit grant; denial strips marketing identifiers and raw shopper identity before ingest.
- **TikTok attribution quality:** TikTok Events API payloads include hashed `external_id` from `customerId` (session-ID fallback for anonymous events) and prefer rich `contents` with quantity/item price over flat `content_ids`. Generated pixel and legacy scripts now build `contents` arrays with per-unit prices for ViewContent, AddToCart, and InitiateCheckout, and InitiateCheckout `numItems` sums line-item quantities instead of counting lines.
- **EventLog payload privacy:** Normal EventLog payloads store sanitized `customData`, `userDataFlags`, and `clickIdFlags` instead of raw shopper `userData`. A separate AES-256-GCM retry envelope may retain the original event for at most 72 hours, is cleared on success/expiry/terminal skip, and is disclosed in the privacy page. Signed webhook bodies follow the same encrypted-until-processed rule.
- **Normal Shopify V1 install standard:** A normal Shopify workspace is not considered live until the Custom Pixel, Shopify webhook, Cart Attribution Helper, Meta credentials, TikTok credentials, test AddToCart, and test webhook Purchase are all verified. The Cart Helper is required for reliable purchase attribution, not optional dashboard polish.
- **Tracking health:** `/tracking-health` gives operational readiness for normal Shopify V1: recent snippet event activity, webhook active/Purchase received, Meta/TikTok connected, dedup status, actionable cart-helper attribution status, attribution source breakdown, and recent errors. Duplicate delivery health counts only `SENT` Purchase rows and excludes `SUPERSEDED` aliases. It reports `cart_attributes` as excellent, session/landing-only attribution as warning, and missing attribution context as error. It is not a pixel-install heartbeat unless a heartbeat endpoint is added later.
- **Diagnostics visibility:** `/diagnostics` resolves workspace mode with the same backend helper as ingest/webhooks. V1 workspaces show only allowed destinations, and event audit field counts include core fields plus optional click/UTM fields only when those values are actually captured and relevant to an allowed destination.
- **Shopify webhook attribution recovery:** The `orders/paid` webhook parses Shopify cart/order attributes (`_trackclear_session_id`, `_fbp`, `_fbc`, `_fbclid`, `_gclid`, `_gbraid`, `_wbraid`, `_ttclid`, `_rdt_cid`, `_epik`, `utm_*`, `_landing_page`, consent markers) before falling back to Redis session enrichment or landing-site params. Landing-site `fbclid` is converted to `fbc` only when no stronger `fbc` exists. Relative `landing_site` values are normalized to absolute store URLs before becoming webhook Purchase `event_source_url`. Webhook Purchase custom data includes variant-first `content_ids`, `content_type`, `contents`, and sanitized attribution-source metadata.
- **Webhook Purchase browser guard:** Browser `fbq("track", "Purchase")` is suppressed only after a signed `orders/paid` delivery sets `shopifyWebhookVerifiedAt`; secret/domain changes clear verification. Track Clear ingest remains a 90-second safety fallback after verification so the one-minute durable inbox normally establishes the canonical path first.
- **Consent revocation:** Redis session enrichment stores field/category observation times, hashed-key alias links, and denial tombstones atomically. After API-key authentication and strict bounded validation, a privacy-minimized no-destination revocation must carry a session, checkout, or cart anchor and pass isolated 120/minute plus 5,000/day workspace budgets before it is persisted ahead of workspace-active, destination-credential, and generic delivery-rate gates. Exactly one opaque anchor starts alias traversal; predictable order aliases are never direct fast-path deletion keys. The request cannot enqueue an event or carry attribution/PII, and rate-limit failures remain queued client-side. Headless clients generate and reuse a fallback session anchor when none is configured. A newer denial propagates through previously associated session/checkout/cart/order/email keys and prevents delayed older events from resurrecting identifiers; webhook Purchase uses the newest bounded consent snapshot from cart attributes or Redis. Custom Pixel, legacy, and headless clients retain at most 20 privacy-minimized revocations for 30 days and retry from 5 seconds up to 5 minutes. A stable `trackclear-consent-revocation-v1` Web Lock serializes cross-tab sends where Web Locks exist; browsers without that API retain per-client serialization but cross-tab ordering is best-effort. Browser/headless touch context is capped at 90 days, Redis enrichment at 30 days, consent grants at 24 hours, and explicit denials at 30 days.
- **Browser pixel ownership:** `metaBrowserTrackingEnabled` and `tiktokBrowserTrackingEnabled` are independent from server-destination enables and default to false. When explicitly enabled, generated scripts load the standard SDK once, honor grant/revoke updates, avoid TikTok auto-PageView, and pair browser/server sends with the exact same event ID. Public scripts use browser revalidation plus a 30-second shared cache. Disable the old browser owner, wait at least 30 seconds, and start a fresh session before enabling a replacement for the same dataset/Pixel ID.
- **Delivery ownership and recovery:** Every destination worker takes a final database claim before outbound I/O and writes SENT/FAILED with claim-token compare-and-set semantics. A five-minute scheduler repairs stale PENDING/RETRYING rows and scheduled transient FAILED rows with deterministic job IDs; terminal configuration failures are not retried forever.
- **Billing idempotency:** Purchase usage uses hashed Redis seen-keys plus an atomic Lua reservation keyed by workspace and every normalized event/order/checkout/cart alias. Hourly reconciliation builds transitive workspace-scoped components from durable rows, covers users without Subscription rows, and restores the non-decreasing count floor plus every marker atomically. Duplicate concurrent ingests are allowed without another increment, while unseen events at the plan limit remain blocked. The rare UTC month-rollover double-unit edge needs persisted billing-period ownership and must not be "fixed" by decrementing a live counter.
- **enableMeta toggle:** Added for consistency with other destinations. Defaults to `true` for backward compatibility with existing workspaces.
- **Reddit click ID (rdtCid):** Snippet captures `rdt_cid` URL param and passes as `rdtCid`. Forwarded to Reddit Conversions API for attribution matching.
- **Pinterest click ID (epik):** Snippet captures `epik` URL param and passes as `epik`. Pinterest Conversions API requires `value` as a string (not number) — normalizer handles the conversion.
- **Google Ads pixel endpoint:** Server-side GET to `googleadservices.com/pagead/conversion/{ID}/`. No OAuth or developer token needed — Conversion ID and Labels are public values stored plaintext (not encrypted). Supports 4 events (Purchase, AddToCart, InitiateCheckout, ViewContent). Enhanced Conversions via `em` parameter with SHA-256 hashed PII. Gmail-specific normalization strips dots and +suffix before hashing. Order deduplication via `oid` parameter matches browser gtag.js.
- **Vercel hosting:** Web app runs on Vercel (serverless). Workers stay on Railway. Redis and PostgreSQL on Railway with public TCP proxies for Vercel connectivity. Railway-specific code (keepalive, self-ping, cgroup reader, signal handlers) conditionally disabled via `process.env.VERCEL`.

## Style Rules

- **No emojis** — never use emojis in code, UI text, commit messages, or comments

## Must NOT Have (scope guardrails)

- Shopify OAuth, Shopify session tokens, `@shopify/shopify-app-remix`
- Shopify Polaris components
- Shopify Web Pixel Extension (we use Custom Pixel JS snippet instead)
- Custom events beyond the 5 standard ones

## Known Issues

See `STATUS.md` for the full list. Current tracking-quality gaps are operational: the literal-subscription generator correction is live, but stores other than Dirava still need the corrected `bridge-v1` repaste; Dirava AddToCart destination proof, buy-now/direct checkout, returning visitor, delayed checkout, catalog mode, headless, custom-ingest DNS, and Meta/TikTok Events Manager proof remain open. The documented UTC month-boundary billing-unit edge remains outside this tracking-only release.

Note: `pnpm build` previously hung on Windows but this is no longer an issue — the Vercel build command is `prisma generate && next build` (no standalone output). A `build:railway` script exists for Railway/Docker deployments that sets `STANDALONE=true` before building.

All previous critical bugs (billing.ts Redis, rotate key, landing page copy, PII storage, forgot password) are fixed.

## Billing Model

**Order-based pricing** — only Purchase events count toward billing limits. All other events (PageView, ViewContent, AddToCart, InitiateCheckout) are free and unlimited.

| Plan | Price | Orders/mo | Auto-Upgrade |
|------|-------|-----------|--------------|
| FREE | $0 | 50 | Blocked (no card) |
| Starter | $29 | 500 | → Growth |
| Growth | $49 | 1,000 | → Scale |
| Scale | $99 | 5,000 | Blocked (contact us) |

- Free plan: no credit card required, Purchase forwarding blocked at limit
- Paid plans: auto-upgrade to next tier via Stripe when limit exceeded
- Active workspace limits are 1/3/5/unlimited for Free/Starter/Growth/Scale; the order pool is shared per user
- Redis key: `orders:{userId}:{YYYY-MM}` (per-user, not per-workspace)
- Stripe env vars: `STRIPE_STARTER_PRICE_ID`, `STRIPE_GROWTH_PRICE_ID`, `STRIPE_SCALE_PRICE_ID`

## Plans

- Original plan: `.omc/plans/trackclear-saas-v3.md` (10 phases, all executed)
- MVP fixes plan: `.omc/plans/trackclear-mvp-next-steps.md` (6 phases, all executed)
- UI migration plan: `.omc/plans/shadcn-ui-implementation.md` (9 phases, all executed)
- Billing model plan: `.omc/plans/purchase-based-billing.md` (10 phases, all executed)
- Analytics/Currency/i18n plan: `C:\Users\Marcos\.Codex\plans\jaunty-weaving-lobster.md` (3 workstreams, all executed)
