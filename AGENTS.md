# AGENTS.md

This file provides guidance to Codex when working with code in this repository.

**Documentation Rule:** After every implementation, bug fix, or significant change, update this file (AGENTS.md), STATUS.md, and MEMORY.md to reflect the new state. Keep known issues, project structure, and API reference accurate at all times. Stale documentation is worse than no documentation.

**Quality Principle:** Never apply half measures. This is a serious production product and must be fully optimized and professional. Always aim for the best possible solution — no shortcuts, no "good enough", no deferred improvements. Every change should be production-grade from the start.

## Project Overview

**Track Clear** is a standalone SaaS that enables Shopify merchants to send ecommerce events server-side to multiple ad platforms (Meta CAPI, TikTok, GA4, Klaviyo, Reddit, Pinterest, Google Ads). Primary value: "Fix your tracking in 10 minutes."

**This is NOT a Shopify embedded app.** It is a standalone web application with its own auth, dashboard, and billing. Shopify integration is via a JS snippet pasted into Shopify's Custom Pixel feature.

### Why It Exists

Browser-only pixels lose 20-40% of conversion data to ad blockers. Track Clear captures events via a custom JS snippet, sends them to our server (`api.trackclear.io` --- not on any block list), and forwards server-to-server to up to 7 ad/analytics platforms, bypassing ad blockers entirely.

### Target Users

Small-to-mid Shopify stores running ads on Meta and TikTok. Legacy/custom workspaces can still use the broader multi-destination stack. Free plan (50 orders/mo), paid plans $29-$99/mo via Stripe.

## Current State

**Production-ready with multi-destination support, i18n, currency conversion, and security hardening.** All core features + 21 phases of expansion implemented:
- Build: compiles clean
- Unit tests: 439/439 passing (39 test files)
- Integration tests: 45 tests across 5 files (health, signup, ingest, workspaces, stripe-webhook)
- TypeScript: `pnpm exec tsc --noEmit` passes cleanly
- Lint: passes with pre-existing `<img>` optimization warnings
- Production migrations applied: `20260521_add_workspace_product_mode`, `20260522_add_catalog_id_settings`, `20260522_add_custom_ingest_domain`
- 7 destination codepaths retained for legacy/custom workspaces: Meta CAPI, TikTok, GA4, Klaviyo, Reddit, Pinterest, Google Ads
- Shopify Meta+TikTok V1 mode for new normal Shopify workspaces: Custom Pixel, storefront cart attribution helper, Shopify webhook, Meta CAPI, TikTok Events API, tracking health
- Dashboard: mode-aware destination visibility, analytics deduplication, revenue cards with currency conversion, event funnel, delivery stats, campaign performance
- i18n: 6 languages (EN, PT, ES, FR, DE, IT) via next-intl v4
- Security: CSP header, email verification, GDPR account deletion, circuit breaker, env validation
- Extras: event replay, password reset, email alerts (4 alert types), UTM/gclid capture, stale pending auto-requeue, privacy/terms pages, server-proxy attribution hardening, verified custom ingest domains
- Hosting: web app on Vercel (serverless), workers on Railway, Postgres + Redis on Railway with public TCP proxies
- Branching: GitHub default branch is `main`; Vercel production and Railway worker deploy from `main`

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
6. Adds the Cart Attribution Helper script to the Shopify theme (`theme.liquid` before `</head>` or Custom Liquid/theme app block equivalent) for durable cart attributes
7. Snippet captures browser events via Shopify's `analytics.subscribe()` API
8. Snippet sends event data + `event_id` to `/api/events/ingest` with `X-TL-API-Key` header, using a verified workspace custom ingest domain when configured
9. Vercel serverless function validates, checks billing/rate limits/consent, creates EventLog, queues BullMQ job
10. Railway worker decrypts token, hashes PII (SHA-256), normalizes phone (E.164), sends to Meta CAPI
11. EventLog updated to SENT/FAILED, dashboard shows status

### Event Pipeline Detail

```
JS Snippet (browser) --> POST /api/events/ingest (X-TL-API-Key header)
  |-- Validate API key (workspace lookup with product mode + destination flags)
  |-- Check which destinations are enabled + have credentials
  |-- Check order limits (only for Purchase events, Redis monthly counter)
  |-- Check rate limit (100 req/sec/workspace)
  |-- Zod validate payload (includes ttclid, rdtCid, epik, trackclearSessionId, cartToken, checkoutToken)
  |-- Prefer trusted X-TL-Client-IP / X-TL-Client-UA headers from server-side storefront proxies
  |-- Resolve fbc from fbc or fbclid (fb.1.<timestamp_ms>.<fbclid>)
  |-- Store browser context under TrackClear session ID, checkout token, cart token, order ID/name, and email when available
  |-- Check per-event toggle (enablePageView, etc.)
  |-- Check consent (STRICT/LAX mode)
  |-- Fan-out: Create one EventLog per enabled destination (status: PENDING)
  |-- For Shopify Meta+TikTok V1 workspaces, filter fan-out to META/TIKTOK only
  |-- Queue BullMQ jobs per destination (meta-events, tiktok-events, ga4-events, klaviyo-events, reddit-events, pinterest-events, google-ads-events)
  |-- Return { success: true, eventId, destinations: [...] }

Workers (separate process) --> Dequeue from per-destination queues
  |-- Decrypt destination credentials (AES-256-GCM)
  |-- Normalize event to destination format (hash PII where required)
  |-- POST to destination API
  |-- Update EventLog to SENT (or FAILED on error)
  |-- Retry: 3 attempts, exponential backoff (2s, 4s, 8s)

Alert Checker (hourly repeatable job)
  |-- Evaluate tracking health, error rates, order limits
  |-- Send email alerts via Resend (24h cooldown per alert type)

Stale Pending Requeue (every 5 minutes)
  |-- Find PENDING EventLogs older than 5 minutes (up to 100)
  |-- Look up workspace credentials per destination
  |-- Re-queue to appropriate destination queue
  |-- Mark FAILED if workspace inactive or credentials missing
```

### Deduplication Strategy

- JS snippet/pixel events generate `event_id` via `crypto.randomUUID()`.
- For normal snippet events, the TrackClear pixel fires `fbq()` with the same `event_id` that the server sends to Meta CAPI, so Meta can deduplicate browser + server events.
- Purchase events are normalized to deterministic `shopify-purchase:<workspaceId>:<order|checkout|cart>` IDs when Shopify order, checkout, or cart identifiers are available. Order name is preferred when present so browser checkout events with only `order.name` converge with webhook payloads that also include numeric order IDs. GraphQL and numeric order IDs normalize to the same segment. Checkout/cart-token-only browser Purchases are documented fallbacks and cannot share the later order-based webhook ID unless Shopify exposes order identity in the browser event.
- For Shopify webhook Purchase workspaces, the generated `/api/pixel/:workspaceId` and legacy `/api/s/:workspaceId` scripts still send TrackClear Purchase context to ingest, but they suppress browser `fbq("track", "Purchase")`, avoiding browser/server Purchase ID mismatches.

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
      tracking-health/page.tsx        # Operational tracking health for recent snippet activity, webhook, Meta/TikTok, Purchase, dedup, attribution, errors
      events/page.tsx                 # Mode-aware event log table with filters + pagination (50/page) + Source/Campaign columns + event replay
      diagnostics/page.tsx            # Internal mode-aware diagnostics: destination health, matrix, data quality, event audit fields, AddToCart/checkout test events
      integrations/page.tsx           # Mode-aware destination setup; V1 shows Shopify webhook, Meta, TikTok; legacy shows all destination cards
      settings/page.tsx               # Event toggles, consent, catalog ID matching, custom ingest domain, snippet, alerts, language/currency selectors, danger zone
      billing/page.tsx                # Current plan, trial status, plan cards, FAQ
      onboarding/
        page.tsx                      # 3-step wizard: create workspace, install snippet, connect platforms
        layout.tsx                    # Pass-through (page renders as fixed overlay)
    api/
      auth/[...nextauth]/route.ts     # NextAuth handler
      auth/signup/route.ts            # POST: create user (Zod, bcrypt, 409 on dupe), sends verification email
      auth/forgot-password/route.ts   # POST: generate token, send reset email
      auth/reset-password/route.ts    # POST: validate token, update password
      auth/verify-email/route.ts      # GET: token-based email verification, sets emailVerified
      diagnostics/route.ts            # GET: internal mode-aware diagnostics data for active workspace debugging
      events/ingest/route.ts          # POST: multi-destination fan-out pipeline (CORS, X-TL-Client IP/UA, fbclid->fbc, multi-key session enrichment)
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
      snippet/[workspaceId]/route.ts  # GET: generate JS snippet; verified custom domains become the pixel-loader host
      cart-helper/[workspaceId]/route.ts # GET: storefront theme helper JS for durable Shopify cart attribution attributes
      pixel/[workspaceId]/route.ts    # GET: public Shopify Custom Pixel JS (session ID, cart attribution writer, catalog ID settings, verified custom ingest URL, webhook-aware Purchase fbq guard)
      s/[workspaceId]/route.ts        # GET: legacy public pixel JS (same session/cart attribution, catalog ID settings, verified custom ingest URL, and Purchase guard)
      stripe/checkout/route.ts        # POST: create Stripe checkout session
      stripe/portal/route.ts          # POST: create Stripe billing portal session
      stripe/webhook/route.ts         # POST: handle Stripe webhooks (5 event types)
      health/route.ts                 # GET: health check (DB ping)
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
      settings-form.tsx               # Workspace settings: event toggles, consent, catalog IDs, custom ingest domain, snippet, language/currency selectors, danger zone
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
    billing.ts                        # checkOrderLimits + incrementOrderCount + autoUpgrade (Redis, Stripe)
    constants.ts                      # BILLING_PLANS (order-based), AUTO_UPGRADE_MAP, PLAN_PRICE_MAP, RATE_LIMIT, QUEUE_CONFIG, META_API_*
    meta-capi.ts                      # POST to Meta Graph API, MetaCapiError class
    event-normalizer.ts               # SnippetEventPayload -> MetaCapiEvent (handles camelCase+snake_case and bounded Meta cookie validation)
    event-log-payload.ts              # Sanitized EventLog payload builder (customData + flags, no raw userData)
    purchase-event-id.ts              # Deterministic Shopify Purchase event_id helper for ingest and webhooks
    content-id.ts                     # Shopify catalog content ID normalization helpers and workspace catalog settings resolver
    custom-ingest-domain.ts           # Custom ingest domain normalization, validation, verification URL, and endpoint resolvers
    workspace-mode.ts                 # Product mode/install type fallback + destination allowlist helpers
    diagnostics-audit-fields.ts       # Mode-aware diagnostics field visibility/counts for core vs optional click/UTM data
    tracking-health.ts                # Operational health checks for Shopify V1 readiness
    session-enrichment.ts             # Redis browser context store keyed by TrackClear session ID, checkout/cart/order identifiers, and email
    analytics.ts                      # Dashboard analytics with destination deduplication + currency conversion (parallel Prisma queries)
    analytics-cache.ts                # Redis caching wrapper for analytics (60s TTL, keyed by destination+currency)
    tracking-context.ts               # Server-proxy client IP/UA extraction + fbclid-derived fbc helpers
    shopify-webhook-attribution.ts    # Shopify order/cart/landing-site attribution extraction + absolute webhook Purchase URL/content helpers
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
    start-worker.ts                   # Entry point: starts all 10 workers, graceful shutdown
    meta-event-processor.ts           # BullMQ worker: circuit breaker, decrypt, normalize, send to Meta CAPI
    tiktok-event-processor.ts         # BullMQ worker: circuit breaker, TikTok Events API
    ga4-event-processor.ts            # BullMQ worker: circuit breaker, GA4 Measurement Protocol
    klaviyo-event-processor.ts        # BullMQ worker: circuit breaker, Klaviyo Events API
    reddit-event-processor.ts         # BullMQ worker: circuit breaker, Reddit Conversions API
    pinterest-event-processor.ts      # BullMQ worker: circuit breaker, Pinterest Conversions API
    google-ads-event-processor.ts     # BullMQ worker: circuit breaker, Google Ads pixel endpoint
    alert-checker.ts                  # Hourly repeatable job: evaluate alerts, send emails
    stale-pending-requeue.ts          # Every 5min: re-queue stale PENDING events to destination queues
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
    analytics.test.ts                 # 28 tests (dashboard analytics)
    api-key.test.ts                   # 12 tests
    billing.test.ts                   # 22 tests
    consent.test.ts                   # 29 tests
    content-id.test.ts                # 6 tests (Shopify catalog content ID normalization, rich direct-ingest fields, and workspace settings resolver)
    custom-ingest-domain.test.ts      # 4 tests (custom domain normalization, validation, and verified endpoint resolution)
    custom-ingest-domain-verify-route.test.ts # 3 tests (verification route success/failure/missing-domain guard)
    diagnostics-audit-fields.test.ts  # 5 tests (mode-aware captured-field visibility and counts)
    diagnostics-route-mode.test.ts    # 1 test (Diagnostics API uses workspace destination allowlist)
    diagnostics-test-event-route.test.ts # 2 tests (safe AddToCart/InitiateCheckout diagnostics through ingest)
    encryption.test.ts                # 12 tests
    event-log-payload.test.ts         # 2 tests (EventLog payload PII redaction + flags)
    event-normalizer.test.ts          # 50 tests (all 5 event types + camelCase handling + Meta cookie validation)
    events-page-mode.test.ts          # 1 test (Events page failed-count respects workspace destination allowlist)
    extract-custom-data.test.ts       # 27 tests (customData extraction)
    google-ads.test.ts                # 34 tests (email normalization, param building, pixel endpoint)
    hash-pii.test.ts                  # 24 tests
    headless-sdk.test.ts              # 6 tests (headless attribution, Meta cookies, TrackClear session ID, cart attributes, ingest client)
    shopify-cart-attribution-helper.test.ts # 9 tests (helper generation, URL extraction, session ID, cart write/verify/retry, no raw PII)
    ingest-attribution.test.ts        # 8 tests (attribution propagation, session enrichment, V1 filtering, deterministic IDs, SKU/custom catalog normalization)
    meta-capi.test.ts                 # 21 tests
    meta-event-processor.test.ts      # 5 tests (happy path, errors, retry)
    phone-normalizer.test.ts          # 16 tests
    pixel-route.test.ts               # 5 tests (webhook-aware Purchase fbq suppression, catalog settings, and custom ingest URLs in generated pixel scripts)
    purchase-event-id.test.ts         # 8 tests (deterministic Shopify Purchase event IDs, order-name convergence, checkout-token fallback)
    rate-limit.test.ts                # 16 tests
    session-enrichment.test.ts        # 2 tests (multi-key Redis session enrichment lookup)
    shopify-domain-resolver.test.ts   # 28 tests (Shopify domain resolution)
    shopify-webhook-attribution.test.ts # 12 tests (order/landing attribution and catalog-aware content IDs)
    shopify-webhook-route-mode.test.ts # 4 tests (Shopify webhook V1 allowlist, legacy env bypass, SKU/product catalog modes)
    shopify-webhook.test.ts           # 6 tests (HMAC/replay/header verification)
    snippet-route.test.ts             # 3 tests (snippet host uses verified custom domain only after verification)
    tiktok.test.ts                    # 3 tests (external_id hashing and rich contents)
    tracking-context.test.ts          # 6 tests (fbc synthesis and proxy headers)
    workspace-create-mode.test.ts     # 1 test (new workspace V1/custom-pixel defaults)
    workspace-mode.test.ts            # 3 tests (null legacy fallback, V1 destination allowlist, env bypass)
    workspace-route-mode.test.ts      # 5 tests (public PATCH cannot mutate product mode/install type, catalog/custom domain validation)
prisma/
  schema.prisma                       # 11 models, 10 enums (see Data Model below)
docs/
  deploy.md                           # Deployment runbook including required production migrations
  custom-ingest-domain.md             # Custom ingest domain setup, verification, and operational notes
  shopify-cart-attribution-helper.md  # Storefront cart attribution helper install and QA notes
  headless-shopify.md                 # Hydrogen/custom storefront tracking helper usage
  qa/
    dirava-order-5076.md              # Controlled production order QA evidence and remaining proof gaps
```

### shadcn/ui Components (14 installed)

`alert.tsx`, `alert-dialog.tsx`, `accordion.tsx`, `badge.tsx`, `button.tsx` (custom `brand` variant), `card.tsx`, `input.tsx`, `label.tsx`, `radio-group.tsx`, `separator.tsx`, `sheet.tsx`, `sonner.tsx`, `switch.tsx`, `table.tsx`

### Data Model

**Models:** User, Account, Session, VerificationToken (NextAuth), PasswordResetToken, Workspace, EventLog, Subscription, AlertPreference, AlertLog, WebhookDeadLetter

**Key relationships:**
- User has many Workspaces (unlimited), one Subscription, one AlertPreference, many PasswordResetTokens, displayCurrency (default "USD"), language (default "en")
- Workspace has many EventLogs, stores nullable `productMode`/`installType`, workspace-level catalog ID matching settings (`catalogIdMode`, prefix, suffix, template), optional verified custom ingest domain fields, encrypted credentials for all 7 destination codepaths (Meta, TikTok, GA4, Klaviyo, Reddit, Pinterest, Google Ads), and per-destination enable toggles
- EventLog has a `destination` field (META/TIKTOK/GA4/KLAVIYO/REDDIT/PINTEREST/GOOGLE_ADS), one row per event per destination
- EventLog stores monetary data (value, currency, numItems, orderId) extracted from customData
- EventLog stores UTM attribution data (utmSource, utmMedium, utmCampaign, utmContent, utmTerm, gclid)

**Enums:** Platform (SHOPIFY/WOOCOMMERCE/BIGCOMMERCE/CUSTOM), WorkspaceProductMode (SHOPIFY_META_TIKTOK_V1/LEGACY_ALL_DESTINATIONS), WorkspaceInstallType (SHOPIFY_CUSTOM_PIXEL/HEADLESS_CUSTOM), CatalogIdMode (VARIANT_NUMERIC_ID/PRODUCT_NUMERIC_ID/VARIANT_GRAPHQL_ID/PRODUCT_GRAPHQL_ID/SKU/CUSTOM), EventName (6 events including Refund), EventStatus (PENDING/SENT/FAILED/RETRYING), ConsentMode (STRICT/LAX), BillingPlan (FREE/STARTER/GROWTH/SCALE), SubscriptionStatus, Destination (META/TIKTOK/GA4/KLAVIYO/REDDIT/PINTEREST/GOOGLE_ADS)

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

# Build for Vercel (default)
pnpm build

# Build for Railway standalone (Docker)
pnpm build:railway

# Run unit tests (439 tests, 39 files)
pnpm test

# Run a single test file
pnpm vitest run tests/unit/hash-pii.test.ts

# Run integration tests (45 tests, 5 files — requires Docker postgres + redis)
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

## API Reference

### Public Endpoints (no auth)

| Route | Method | Purpose |
|-------|--------|---------|
| `POST /api/events/ingest` | POST | Event ingestion from snippets/proxies. Header: `X-TL-API-Key`. Optional server-only headers: `X-TL-Client-IP`, `X-TL-Client-UA`. CORS: `*` |
| `GET /api/custom-ingest-domain/check` | GET | Public marker route used by server-side custom ingest domain verification |
| `GET /api/cart-helper/:workspaceId` | GET | Public storefront theme helper JS that writes and verifies TrackClear attribution in Shopify cart attributes |
| `POST /api/stripe/webhook` | POST | Stripe webhook handler (signature verified) |
| `GET /api/health` | GET | Health check (DB ping) |
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
| `GET /api/snippet/:workspaceId` | GET | Generate JS snippet (captures ttclid, rdtCid, epik, UTMs, gclid) |
| `POST /api/stripe/checkout` | POST | Create Stripe checkout session |
| `POST /api/stripe/portal` | POST | Create Stripe billing portal session |

### Ingest Endpoint Schema

```
POST /api/events/ingest
Header: X-TL-API-Key: tl_<64 hex chars>
Header: Content-Type: application/json

{
  eventName: "PageView" | "ViewContent" | "AddToCart" | "InitiateCheckout" | "Purchase",
  eventId: string,          // UUID from crypto.randomUUID()
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
- **JS snippet approach:** Merchant pastes our snippet into Shopify Custom Pixel. Our domain isn't on ad-blocker lists.
- **Server-side CAPI:** All Meta CAPI calls happen server-to-server. The snippet bridges browser context (cookies, IP, UA) to our server.
- **E.164 phone normalization:** Country code inferred from billing address (55-country map) before SHA-256 hashing.
- **Token encryption:** Meta access tokens encrypted at rest using AES-256-GCM.
- **Workspace model:** Each merchant has a workspace with a unique API key (unlimited per user, shared order pool).
- **Multi-destination fan-out:** Ingest route creates one EventLog + one BullMQ job per enabled destination. Each destination has its own queue, worker, normalizer, and API client.
- **Product-mode rollout:** `Workspace.productMode` and `Workspace.installType` are nullable for safe migration. Runtime fallback treats missing values as `LEGACY_ALL_DESTINATIONS` + `HEADLESS_CUSTOM`; new workspaces are created as `SHOPIFY_META_TIKTOK_V1` + `SHOPIFY_CUSTOM_PIXEL`. V1 workspaces are allowlisted to Meta/TikTok in UI, ingest, webhook, replay, analytics, and event views, including Events page failed-count/replay visibility. Public workspace PATCH requests cannot mutate product mode/install type. `LEGACY_WORKSPACE_IDS` can force legacy behavior as an emergency bypass.
- **Custom ingest domains:** Workspaces can save a merchant-owned custom ingest domain. TrackClear only uses it after `POST /api/workspaces/:id/custom-ingest-domain/verify` confirms that `https://<domain>/api/custom-ingest-domain/check` returns the TrackClear marker. Unverified workspaces keep the default TrackClear app/ingest endpoints. Vercel may request either a CNAME target or an A record for a specific domain; follow Vercel's per-domain instruction. Dirava is not currently using this feature.
- **Deployment order:** Run `pnpm prisma migrate deploy` against production before deploying app/worker code that depends on new schema fields, including `20260522_add_custom_ingest_domain`. Build scripts only run `prisma generate`; they do not apply migrations. See `docs/deploy.md`.
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
- **Meta fbc/fbp recovery:** Ingest accepts raw `fbclid` and derives `fbc` as `fb.1.<timestamp_ms>.<fbclid>` when `_fbc` is missing. Existing `_fbc` values are preserved. `_fbp` validation accepts bounded Meta-style random IDs from 7 to 20 digits.
- **Shopify session/cart attribution:** Generated pixel scripts create a `_trackclear_session_id`, persist it in a first-party cookie, and best-effort write `_trackclear_session_id`, click IDs, UTMs, landing page, and consent markers into Shopify cart attributes on add-to-cart/checkout-start. The storefront Cart Attribution Helper (`/api/cart-helper/:workspaceId`) is the reliability layer for normal Shopify themes: it runs outside the Custom Pixel sandbox, writes early/repeatedly through same-origin `/cart/update.js`, verifies through `/cart.js`, retries once, stores local diagnostics, and never writes raw shopper PII. Ingest stores browser context under TrackClear session ID, checkout token, cart token, order ID/name, and email so Shopify webhook Purchases can recover attribution even when email is missing or delayed.
- **Controlled production QA artifacts:** Store real-order QA evidence under `docs/qa/` without raw PII or full webhook payloads. Dirava order `#5076` proved webhook Purchase flow and session enrichment for a controlled `0 EUR` order, but did not prove paid revenue propagation or durable cart/order attribute persistence.
- **Deterministic Purchase event IDs:** Snippet, generated pixel, and Shopify webhook Purchase events use deterministic Shopify identifiers when possible (`shopify-purchase:<workspaceId>:<order|checkout|cart>`). Order name is preferred over numeric order ID when both are present so browser checkout events and Shopify webhooks converge on the same order-based ID; numeric and GraphQL order IDs still normalize to the same fallback segment.
- **Catalog content ID normalization:** Generated pixel, legacy script, ingest, and Shopify webhook Purchase payloads normalize Shopify product/variant content IDs through `content-id.ts`. Workspace settings control variant numeric, product numeric, GraphQL, SKU, prefix/suffix, and custom template modes from Settings.
- **Headless storefront helper:** `headless-sdk.ts` gives Hydrogen/custom storefronts a reusable client for URL click-ID capture, Meta `_fbp`/`_fbc` cookie maintenance, `_trackclear_session_id` creation/persistence, Shopify cart attribution attributes, and TrackClear ingest calls.
- **TikTok attribution quality:** TikTok Events API payloads include hashed `external_id` from `customerId` when available and prefer rich `contents` with quantity/item price over flat `content_ids`.
- **EventLog payload privacy:** EventLog rows store sanitized `customData`, `userDataFlags`, and `clickIdFlags` instead of raw shopper `userData`. Raw shopper data is still passed transiently to queue jobs for destination delivery. Replay is privacy-preserving: sanitized rows replay attribution columns and customData, but raw PII is not reconstructed after it has been removed.
- **Tracking health:** `/tracking-health` gives operational readiness for normal Shopify V1: recent snippet event activity, webhook active/Purchase received, Meta/TikTok connected, dedup status, attribution context, attribution source breakdown, and recent errors. It is not a pixel-install heartbeat unless a heartbeat endpoint is added later.
- **Diagnostics visibility:** `/diagnostics` resolves workspace mode with the same backend helper as ingest/webhooks. V1 workspaces show only allowed destinations, and event audit field counts include core fields plus optional click/UTM fields only when those values are actually captured and relevant to an allowed destination.
- **Shopify webhook attribution recovery:** The `orders/paid` webhook parses Shopify cart/order attributes (`_trackclear_session_id`, `_fbp`, `_fbc`, `_fbclid`, `_gclid`, `_gbraid`, `_wbraid`, `_ttclid`, `_rdt_cid`, `_epik`, `utm_*`, `_landing_page`, consent markers) before falling back to Redis session enrichment or landing-site params. Landing-site `fbclid` is converted to `fbc` only when no stronger `fbc` exists. Relative `landing_site` values are normalized to absolute store URLs before becoming webhook Purchase `event_source_url`. Webhook Purchase custom data includes variant-first `content_ids`, `content_type`, `contents`, and sanitized attribution-source metadata.
- **Webhook Purchase browser guard:** If a workspace has a Shopify webhook secret configured, TrackClear generated pixel scripts do not fire browser `fbq("track", "Purchase")`; they still send the TrackClear Purchase to ingest so session context can enrich the webhook Purchase.
- **Stale pending requeue:** BullMQ repeatable job every 5 minutes finds PENDING events older than 5 minutes and re-queues them to the appropriate destination queue, preventing events from getting stuck after Redis restarts.
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

See `STATUS.md` for the full list. Current tracking-quality gaps are operational proof gaps: paid non-zero revenue propagation, real Shopify cart/order attribute persistence using the new storefront helper, catalog mode live QA, headless live QA, and custom ingest staging DNS QA.

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
- Unlimited workspaces on all plans, shared order pool per user
- Redis key: `orders:{userId}:{YYYY-MM}` (per-user, not per-workspace)
- Stripe env vars: `STRIPE_STARTER_PRICE_ID`, `STRIPE_GROWTH_PRICE_ID`, `STRIPE_SCALE_PRICE_ID`

## Plans

- Original plan: `.omc/plans/trackclear-saas-v3.md` (10 phases, all executed)
- MVP fixes plan: `.omc/plans/trackclear-mvp-next-steps.md` (6 phases, all executed)
- UI migration plan: `.omc/plans/shadcn-ui-implementation.md` (9 phases, all executed)
- Billing model plan: `.omc/plans/purchase-based-billing.md` (10 phases, all executed)
- Analytics/Currency/i18n plan: `C:\Users\Marcos\.Codex\plans\jaunty-weaving-lobster.md` (3 workstreams, all executed)
    cart-helper-route.test.ts          # 3 tests (public cart helper route output, missing workspace, CORS)
