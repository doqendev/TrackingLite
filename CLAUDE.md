# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

**Documentation Rule:** After every implementation, bug fix, or significant change, update this file (CLAUDE.md), STATUS.md, and MEMORY.md to reflect the new state. Keep known issues, project structure, and API reference accurate at all times. Stale documentation is worse than no documentation.

## Project Overview

**Track Clear** is a standalone SaaS that enables Shopify merchants to send ecommerce events server-side to multiple ad platforms (Meta CAPI, Google Ads, TikTok, GA4, Klaviyo). Primary value: "Fix your tracking in 10 minutes."

**This is NOT a Shopify embedded app.** It is a standalone web application with its own auth, dashboard, and billing. Shopify integration is via a JS snippet pasted into Shopify's Custom Pixel feature.

### Why It Exists

Browser-only pixels lose 20-40% of conversion data to ad blockers. Track Clear captures events via a custom JS snippet, sends them to our server (`api.trackclear.io` --- not on any block list), and forwards server-to-server to up to 5 ad/analytics platforms, bypassing ad blockers entirely.

### Target Users

Small-to-mid Shopify stores running ads on Meta, Google, TikTok, and more. Free plan (50 orders/mo), paid plans $29-$99/mo via Stripe.

## Current State

**Feature-complete with multi-destination support.** All core features + 4 phases of feature expansion implemented:
- Build: compiles clean
- Unit tests: 239/239 passing (13 test files)
- Integration tests: 45 tests across 5 files (health, signup, ingest, workspaces, stripe-webhook)
- TypeScript: 0 source errors
- Lint: 0 warnings/errors
- 5 destinations: Meta CAPI, Google Ads, TikTok, GA4, Klaviyo
- Dashboard: conversion accuracy, revenue cards, event funnel, delivery stats, campaign performance
- Extras: event replay, password reset, email alerts (4 alert types), UTM/gclid capture, stale pending auto-requeue

See `STATUS.md` for the full audit and remaining work.

## Tech Stack (Actual Versions)

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router, TypeScript, Server Components) | 14.2.20 |
| Auth | NextAuth.js v5 (email/password + Google OAuth, JWT sessions) | 5.0.0-beta.16 |
| Database | PostgreSQL 16 + Prisma ORM | Prisma 5.11.0 |
| Queue | BullMQ + ioredis | BullMQ 5.4.0, ioredis 5.3.2 |
| Billing | Stripe Subscriptions (Free $0, Starter $29, Growth $49, Scale $99 — order-based) | stripe 14.18.0 |
| UI | Tailwind CSS 3.4 + shadcn/ui (new-york style, 14 components) | |
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
6. Snippet captures browser events via Shopify's `analytics.subscribe()` API
7. Snippet sends event data + `event_id` to `/api/events/ingest` with `X-TL-API-Key` header
8. Server validates, checks billing/rate limits/consent, creates EventLog, queues BullMQ job
9. Worker decrypts token, hashes PII (SHA-256), normalizes phone (E.164), sends to Meta CAPI
10. EventLog updated to SENT/FAILED, dashboard shows status

### Event Pipeline Detail

```
JS Snippet (browser) --> POST /api/events/ingest (X-TL-API-Key header)
  |-- Validate API key (workspace lookup with all destination fields)
  |-- Check which destinations are enabled + have credentials
  |-- Check order limits (only for Purchase events, Redis monthly counter)
  |-- Check rate limit (100 req/sec/workspace)
  |-- Zod validate payload (includes ttclid for TikTok)
  |-- Check per-event toggle (enablePageView, etc.)
  |-- Check consent (STRICT/LAX mode)
  |-- Fan-out: Create one EventLog per enabled destination (status: PENDING)
  |-- Queue BullMQ jobs per destination (meta-events, google-events, tiktok-events, ga4-events, klaviyo-events)
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

- JS snippet generates `event_id` via `crypto.randomUUID()`
- If merchant also has Meta's browser pixel, snippet fires `fbq()` with same `event_id`
- Server sends to Meta CAPI with that `event_id`
- Meta deduplicates browser pixel event + server CAPI event by matching `event_id`

## Project Structure

```
src/
  app/
    page.tsx                          # Landing page (public marketing)
    layout.tsx                        # Root layout (Inter font, Sonner Toaster, dark mode)
    globals.css                       # Tailwind + CSS variable tokens (dark/light)
    (auth)/
      layout.tsx                      # Centered card layout
      login/page.tsx                  # Email/password + Google OAuth login
      signup/page.tsx                 # Name + email + password signup, auto-login
      forgot-password/page.tsx        # Sends password reset email via Resend
      reset-password/page.tsx         # Token-based password reset with confirmation
    (dashboard)/
      layout.tsx                      # Auth-gated shell with sidebar nav + mobile nav
      dashboard/page.tsx              # Rich analytics: revenue, conversion accuracy, event funnel, delivery, campaign performance, recent events
      events/page.tsx                 # Event log table with filters + pagination (50/page) + Source/Campaign columns + event replay
      settings/page.tsx               # 6 destination cards, event toggles, consent, snippet, alerts, danger zone
      billing/page.tsx                # Current plan, trial status, plan cards, FAQ
      onboarding/
        page.tsx                      # 3-step wizard: create workspace, copy snippet, test event
        layout.tsx                    # Pass-through (page renders as fixed overlay)
    api/
      auth/[...nextauth]/route.ts     # NextAuth handler
      auth/signup/route.ts            # POST: create user (Zod, bcrypt, 409 on dupe)
      auth/forgot-password/route.ts   # POST: generate token, send reset email
      auth/reset-password/route.ts    # POST: validate token, update password
      events/ingest/route.ts          # POST: multi-destination fan-out pipeline (CORS)
      workspaces/route.ts             # GET/POST: list/create workspaces (unlimited)
      workspaces/[id]/route.ts        # GET/PATCH/DELETE: workspace CRUD
      workspaces/[id]/rotate-key/route.ts  # POST: rotate API key
      workspaces/[id]/analytics/route.ts   # GET: dashboard analytics (cached 60s)
      workspaces/[id]/replay/route.ts # POST: re-queue failed events (500 max, 5min cooldown)
      alerts/preferences/route.ts     # GET/PUT: alert notification preferences
      snippet/[workspaceId]/route.ts  # GET: generate JS snippet (captures ttclid, UTMs, gclid)
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
      settings-form.tsx               # All settings: 6 destination cards + toggles + consent + snippet + danger zone
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
    event-normalizer.ts               # SnippetEventPayload -> MetaCapiEvent (handles camelCase+snake_case)
    analytics.ts                      # Dashboard analytics computation (parallel Prisma queries, campaign performance)
    analytics-cache.ts                # Redis caching wrapper for analytics (60s TTL)
    queue.ts                          # Lazy BullMQ queues (5 destinations), MetaEventJob + DestinationEventJob interfaces
    rate-limit.ts                     # Lazy Redis rate limiter (100 req/sec/workspace)
    replay-rate-limit.ts              # Redis cooldown for event replay (5min per workspace)
    email.ts                          # Resend client for password reset + alert emails
    alerts.ts                         # Alert evaluation: health, errors, limits
    api-key-cache.ts                  # Redis-cached workspace lookup (UNUSED - see known issues)
    extract-custom-data.ts            # Extract value/currency/numItems/orderId from customData
    destinations/
      index.ts                        # DESTINATION_EVENT_MAP for all 5 platforms
      google-ads.ts                   # Google Ads normalizer + Conversion Upload API client
      tiktok.ts                       # TikTok normalizer + Events API client
      ga4.ts                          # GA4 normalizer + Measurement Protocol client
      klaviyo.ts                      # Klaviyo normalizer + Events API client (raw email)
  types/
    meta-capi.ts                      # MetaCapiEvent, MetaUserData, MetaCustomData, etc.
    events.ts                         # SnippetEventPayload
    app.ts                            # WorkspaceWithStats, DashboardStats
    next-auth.d.ts                    # Module augmentation (adds id to Session.user)
  workers/
    start-worker.ts                   # Entry point: starts all 7 workers, graceful shutdown
    meta-event-processor.ts           # BullMQ worker: decrypt, normalize, send to Meta CAPI
    google-event-processor.ts         # BullMQ worker: Google Ads Conversion Upload
    tiktok-event-processor.ts         # BullMQ worker: TikTok Events API
    ga4-event-processor.ts            # BullMQ worker: GA4 Measurement Protocol
    klaviyo-event-processor.ts        # BullMQ worker: Klaviyo Events API
    alert-checker.ts                  # Hourly repeatable job: evaluate alerts, send emails
    stale-pending-requeue.ts          # Every 5min: re-queue stale PENDING events to destination queues
  middleware.ts                       # Auth redirect for protected routes
tests/
  unit/
    hash-pii.test.ts                  # 25 tests
    phone-normalizer.test.ts          # 16 tests
    encryption.test.ts                # 12 tests
    api-key.test.ts                   # 12 tests
    consent.test.ts                   # 10 tests
    meta-capi.test.ts                 # 21 tests
    rate-limit.test.ts                # 16 tests
    event-normalizer.test.ts          # 40 tests (all 5 event types + camelCase handling)
    meta-event-processor.test.ts      # 5 tests (happy path, errors, retry)
prisma/
  schema.prisma                       # 6 models, 6 enums (see Data Model below)
```

### shadcn/ui Components (14 installed)

`alert.tsx`, `alert-dialog.tsx`, `accordion.tsx`, `badge.tsx`, `button.tsx` (custom `brand` variant), `card.tsx`, `input.tsx`, `label.tsx`, `radio-group.tsx`, `separator.tsx`, `sheet.tsx`, `sonner.tsx`, `switch.tsx`, `table.tsx`

### Data Model

**Models:** User, Account, Session, VerificationToken (NextAuth), PasswordResetToken, Workspace, EventLog, Subscription, AlertPreference, AlertLog

**Key relationships:**
- User has many Workspaces (unlimited), one Subscription, one AlertPreference, many PasswordResetTokens
- Workspace has many EventLogs, stores encrypted credentials for all 5 destinations
- EventLog has a `destination` field (META/GOOGLE_ADS/TIKTOK/GA4/KLAVIYO), one row per event per destination
- EventLog stores monetary data (value, currency, numItems, orderId) extracted from customData
- EventLog stores UTM attribution data (utmSource, utmMedium, utmCampaign, utmContent, utmTerm, gclid)

**Enums:** Platform (SHOPIFY/WOOCOMMERCE/BIGCOMMERCE/CUSTOM), EventName (5 events), EventStatus (PENDING/SENT/FAILED/RETRYING), ConsentMode (STRICT/LAX), BillingPlan (FREE/STARTER/GROWTH/SCALE), SubscriptionStatus, Destination (META/GOOGLE_ADS/TIKTOK/GA4/KLAVIYO)

## Development Commands

```bash
# Local services (PostgreSQL on port 5433, Redis on 6379)
docker compose up -d

# Install dependencies
pnpm install

# Push schema to DB (no migration files)
pnpm prisma db push

# Run development server (port 3000)
pnpm dev

# Run the BullMQ worker (separate terminal, required for event processing)
pnpm worker

# Build for production
pnpm build

# Run unit tests (239 tests, 13 files)
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
- `DATABASE_URL` - PostgreSQL (port 5433 to match docker-compose)
- `REDIS_URL` - Redis connection
- `NEXTAUTH_SECRET` - JWT signing
- `ENCRYPTION_KEY` - 64 hex chars (32 bytes) for AES-256-GCM
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` - Stripe integration
- `STRIPE_STARTER_PRICE_ID`, `STRIPE_GROWTH_PRICE_ID`, `STRIPE_SCALE_PRICE_ID` - Stripe product prices
- `NEXT_PUBLIC_INGEST_URL` - **Required for local dev** (defaults to production URL if unset)
- `NEXT_PUBLIC_APP_URL` - Base URL for Stripe redirect callbacks

## API Reference

### Public Endpoints (no auth)

| Route | Method | Purpose |
|-------|--------|---------|
| `POST /api/events/ingest` | POST | Event ingestion from JS snippet. Header: `X-TL-API-Key`. CORS: `*` |
| `POST /api/stripe/webhook` | POST | Stripe webhook handler (signature verified) |
| `GET /api/health` | GET | Health check (DB ping) |
| `POST /api/auth/signup` | POST | User registration |
| `POST /api/auth/forgot-password` | POST | Generate reset token, send email |
| `POST /api/auth/reset-password` | POST | Validate token, update password |
| `/api/auth/*` | ALL | NextAuth handlers |

### Protected Endpoints (session required)

| Route | Method | Purpose |
|-------|--------|---------|
| `GET/POST /api/workspaces` | GET, POST | List/create workspaces |
| `GET/PATCH/DELETE /api/workspaces/:id` | GET, PATCH, DELETE | Workspace CRUD |
| `POST /api/workspaces/:id/rotate-key` | POST | Rotate workspace API key |
| `POST /api/workspaces/:id/replay` | POST | Re-queue failed events (500 max, 5min cooldown) |
| `GET /api/workspaces/:id/analytics` | GET | Dashboard analytics (health, revenue, events, billing, accuracy, campaigns) |
| `GET/PUT /api/alerts/preferences` | GET, PUT | Alert notification preferences |
| `GET /api/snippet/:workspaceId` | GET | Generate JS snippet (captures ttclid, UTMs, gclid) |
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
  fbp?: string | null,      // _fbp cookie
  fbc?: string | null,      // _fbc cookie
  ttclid?: string | null,   // TikTok click ID
  utmSource?: string | null,
  utmMedium?: string | null,
  utmCampaign?: string | null,
  utmContent?: string | null,
  utmTerm?: string | null,
  gclid?: string | null,    // Google Click ID
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
- **Lazy Redis connections:** Queue and rate-limit modules use lazy singleton pattern to avoid build-time connection failures.
- **customData dual-format:** Event normalizer accepts both camelCase (from snippet) and snake_case via `pick()` helper.
- **Analytics caching:** Dashboard analytics cached in Redis for 60 seconds (`analytics:{workspaceId}` key). All queries run in parallel via `Promise.all()`. Cache miss falls back to direct DB computation.
- **Klaviyo raw email:** Klaviyo requires unhashed email for profile matching, unlike Meta/Google/TikTok which all use SHA-256.
- **Email alerts:** Hourly BullMQ repeatable job evaluates tracking health, error rates, and order limits. 24h cooldown per alert type per user.
- **UTM attribution:** Snippet captures UTM params + gclid once at IIFE init (landing page URL) and passes with every event. Stored on EventLog for campaign performance analytics.
- **Stale pending requeue:** BullMQ repeatable job every 5 minutes finds PENDING events older than 5 minutes and re-queues them to the appropriate destination queue, preventing events from getting stuck after Redis restarts.

## Style Rules

- **No emojis** — never use emojis in code, UI text, commit messages, or comments

## Must NOT Have (scope guardrails)

- Shopify OAuth, Shopify session tokens, `@shopify/shopify-app-remix`
- Shopify Polaris components
- Shopify webhooks
- Shopify Web Pixel Extension (we use Custom Pixel JS snippet instead)
- Custom events beyond the 5 standard ones

## Known Issues

See `STATUS.md` for the full list. Currently:
1. **`api-key-cache.ts` is dead code** --- exists but is never imported
2. **`pnpm build` hangs on Windows** --- pre-existing environment issue, not code-related

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
