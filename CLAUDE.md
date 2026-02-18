# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

**Documentation Rule:** After every implementation, bug fix, or significant change, update this file (CLAUDE.md), STATUS.md, and MEMORY.md to reflect the new state. Keep known issues, project structure, and API reference accurate at all times. Stale documentation is worse than no documentation.

## Project Overview

**TrackingLite** is a standalone SaaS that enables Shopify merchants to send ecommerce events server-side to Meta (Conversions API). Primary value: "Fix your Meta tracking in 10 minutes."

**This is NOT a Shopify embedded app.** It is a standalone web application with its own auth, dashboard, and billing. Shopify integration is via a JS snippet pasted into Shopify's Custom Pixel feature.

### Why It Exists

Browser-only Meta Pixels lose 20-40% of conversion data to ad blockers (which block `connect.facebook.net`). TrackingLite captures events via a custom JS snippet, sends them to our server (`api.trackinglite.com` --- not on any block list), and forwards server-to-server to Meta CAPI, bypassing ad blockers entirely.

### Target Users

Small-to-mid Shopify stores running Meta ads. Free plan (50 orders/mo), paid plans $29-$99/mo via Stripe.

## Current State

**MVP is functionally complete.** All core features are implemented and working:
- Build: 19 routes, compiles clean
- Unit tests: 204/204 passing (11 test files)
- Integration tests: 45 tests across 5 files (health, signup, ingest, workspaces, stripe-webhook)
- TypeScript: 0 errors
- Lint: 0 warnings/errors

See `STATUS.md` for the full audit, known bugs, and remaining work.

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

1. Merchant signs up on **trackinglite.com** (email/password or Google SSO)
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
  |-- Validate API key (workspace lookup)
  |-- Check order limits (only for Purchase events, Redis monthly counter)
  |-- Check rate limit (100 req/sec/workspace)
  |-- Zod validate payload
  |-- Check per-event toggle (enablePageView, etc.)
  |-- Check consent (STRICT/LAX mode)
  |-- Create EventLog (status: PENDING)
  |-- Queue BullMQ job (meta-events queue)
  |-- Return { success: true, eventId }

Worker (separate process) --> Dequeue from meta-events
  |-- Decrypt Meta access token (AES-256-GCM)
  |-- Build SnippetEventPayload
  |-- normalizeToMetaCapiEvent (hash PII, E.164 phone, ms->sec timestamp)
  |-- POST to graph.facebook.com/v21.0/{pixelId}/events
  |-- Update EventLog to SENT (or FAILED on error)
  |-- Retry: 3 attempts, exponential backoff (2s, 4s, 8s)
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
      forgot-password/page.tsx        # STUB - shows success but sends no email
    (dashboard)/
      layout.tsx                      # Auth-gated shell with sidebar nav + mobile nav
      dashboard/page.tsx              # Workspace overview, stats cards, recent events
      events/page.tsx                 # Event log table with filters + pagination (50/page)
      settings/page.tsx               # Meta credentials, toggles, consent, snippet, danger zone
      billing/page.tsx                # Current plan, trial status, plan cards, FAQ
      onboarding/
        page.tsx                      # 3-step wizard: create workspace, copy snippet, test event
        layout.tsx                    # Pass-through (page renders as fixed overlay)
    api/
      auth/[...nextauth]/route.ts     # NextAuth handler
      auth/signup/route.ts            # POST: create user (Zod, bcrypt, 409 on dupe)
      events/ingest/route.ts          # POST: main ingestion (CORS, 12-step pipeline)
      workspaces/route.ts             # GET/POST: list/create workspaces (unlimited)
      workspaces/[id]/route.ts        # GET/PATCH/DELETE: workspace CRUD
      workspaces/[id]/rotate-key/route.ts  # POST: rotate API key
      snippet/[workspaceId]/route.ts  # GET: generate JS snippet for workspace
      stripe/checkout/route.ts        # POST: create Stripe checkout session
      stripe/portal/route.ts          # POST: create Stripe billing portal session
      stripe/webhook/route.ts         # POST: handle Stripe webhooks (5 event types)
      health/route.ts                 # GET: health check (DB ping)
  components/
    ui/                               # 14 shadcn/ui components (see list below)
    dashboard/
      sidebar-nav.tsx                 # Desktop sidebar + MobileNav (Sheet drawer)
      stats-cards.tsx                 # 4 stat cards (total, success rate, failed, last event)
      recent-events.tsx               # Last 10 events mini-table
    settings/
      settings-form.tsx               # All settings in one client component (5 cards)
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
    queue.ts                          # Lazy BullMQ queue (meta-events), MetaEventJob interface
    rate-limit.ts                     # Lazy Redis rate limiter (100 req/sec/workspace)
    api-key-cache.ts                  # Redis-cached workspace lookup (UNUSED - see known issues)
    extract-custom-data.ts            # Extract value/currency/numItems/orderId from customData
  types/
    meta-capi.ts                      # MetaCapiEvent, MetaUserData, MetaCustomData, etc.
    events.ts                         # SnippetEventPayload
    app.ts                            # WorkspaceWithStats, DashboardStats
    next-auth.d.ts                    # Module augmentation (adds id to Session.user)
  workers/
    start-worker.ts                   # Entry point: imports worker, graceful shutdown
    meta-event-processor.ts           # BullMQ worker: decrypt, normalize, send to Meta CAPI
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

**Models:** User, Account, Session, VerificationToken (NextAuth), Workspace, EventLog, Subscription

**Key relationships:**
- User has many Workspaces (unlimited), one Subscription
- Workspace has many EventLogs
- Workspace stores encrypted Meta credentials (metaAccessTokenEncrypted + Iv + Tag)
- EventLog stores monetary data (value, currency, numItems, orderId) extracted from customData

**Enums:** Platform (SHOPIFY/WOOCOMMERCE/BIGCOMMERCE/CUSTOM), EventName (5 events), EventStatus (PENDING/SENT/FAILED/RETRYING), ConsentMode (STRICT/LAX), BillingPlan (FREE/STARTER/GROWTH/SCALE), SubscriptionStatus (TRIALING/ACTIVE/PAST_DUE/CANCELED/UNPAID)

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

# Run unit tests (177 tests, 10 files)
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
| `/api/auth/*` | ALL | NextAuth handlers |

### Protected Endpoints (session required)

| Route | Method | Purpose |
|-------|--------|---------|
| `GET/POST /api/workspaces` | GET, POST | List/create workspaces |
| `GET/PATCH/DELETE /api/workspaces/:id` | GET, PATCH, DELETE | Workspace CRUD |
| `POST /api/workspaces/:id/rotate-key` | POST | Rotate workspace API key |
| `GET /api/snippet/:workspaceId` | GET | Generate JS snippet |
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
- **Lazy Redis connections:** Queue and rate-limit modules use lazy singleton pattern to avoid build-time connection failures.
- **customData dual-format:** Event normalizer accepts both camelCase (from snippet) and snake_case via `pick()` helper.

## Must NOT Have (scope guardrails)

- Shopify OAuth, Shopify session tokens, `@shopify/shopify-app-remix`
- Shopify Polaris components
- Shopify webhooks (for MVP)
- Shopify Web Pixel Extension (we use Custom Pixel JS snippet instead)
- Multi-destination support (only Meta CAPI)
- Custom events beyond the 5 standard ones

## Known Issues

See `STATUS.md` for the full list. Currently:
1. **`api-key-cache.ts` is dead code** --- exists but is never imported
2. **Forgot password is a stub** --- shows honest "not yet available" message
3. **`pnpm build` hangs on Windows** --- pre-existing environment issue, not code-related

All previous critical bugs (billing.ts Redis, rotate key, landing page copy, PII storage) are fixed.

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

- Original plan: `.omc/plans/trackinglite-saas-v3.md` (10 phases, all executed)
- MVP fixes plan: `.omc/plans/trackinglite-mvp-next-steps.md` (6 phases, all executed)
- UI migration plan: `.omc/plans/shadcn-ui-implementation.md` (9 phases, all executed)
- Billing model plan: `.omc/plans/purchase-based-billing.md` (10 phases, all executed)
