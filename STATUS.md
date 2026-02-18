# TrackingLite --- Project Status & Audit

Last updated: 2026-02-18 (post billing model migration)

## Build Health

| Metric | Status |
|--------|--------|
| Build (`pnpm build`) | 19 routes, compiles clean |
| Tests (`pnpm test`) | 177/177 passing (10 files) |
| TypeScript | 0 errors |
| ESLint | 0 warnings/errors |

## What's Implemented

### Pages (9 routes)

| Route | Type | Status | Notes |
|-------|------|--------|-------|
| `/` | Public | Working | Landing page with hero, pricing, features |
| `/login` | Public | Working | Email/password + Google OAuth |
| `/signup` | Public | Working | Registration with auto-login, redirects to onboarding |
| `/forgot-password` | Public | **Stub** | Honest "not yet available" message, links to login/signup |
| `/dashboard` | Protected | Working | Stats cards, recent events, setup banner if Meta not configured |
| `/events` | Protected | Working | Paginated event log with type/status filters (50/page) |
| `/settings` | Protected | Working | Meta credentials, event toggles, consent mode, snippet display |
| `/billing` | Protected | Working | Current plan, order usage, 4-tier plan cards, FAQ accordion |
| `/onboarding` | Protected | Working | 3-step wizard: create workspace, copy snippet, test event |

### API Routes (11 endpoints)

| Endpoint | Methods | Auth | Status | Notes |
|----------|---------|------|--------|-------|
| `/api/auth/[...nextauth]` | ALL | - | Working | NextAuth handler |
| `/api/auth/signup` | POST | - | Working | Zod validation, bcrypt, 409 on duplicate |
| `/api/events/ingest` | POST, OPTIONS | API Key | Working | Full 12-step pipeline with CORS |
| `/api/workspaces` | GET, POST | Session | Working | Unlimited workspaces, encrypts Meta token |
| `/api/workspaces/[id]` | GET, PATCH, DELETE | Session | Working | Ownership verified, soft-delete |
| `/api/workspaces/[id]/rotate-key` | POST | Session | Working | Generates new API key |
| `/api/snippet/[workspaceId]` | GET | Session | Working | Generates minified JS snippet |
| `/api/stripe/checkout` | POST | Session | Working | Creates Stripe checkout (no trial, free plan instead) |
| `/api/stripe/portal` | POST | Session | Working | Opens Stripe billing portal |
| `/api/stripe/webhook` | POST | Stripe sig | Working | Handles 5 Stripe event types |
| `/api/health` | GET | - | Working | DB ping, returns status + uptime |

### Core Library Modules (15 files in src/lib/)

| Module | Status | What it does |
|--------|--------|-------------|
| `auth.ts` | Working | NextAuth v5 config (Google + Credentials providers, JWT sessions) |
| `db.ts` | Working | Prisma singleton with hot-reload safety |
| `utils.ts` | Working | `cn()` utility (clsx + tailwind-merge) |
| `encryption.ts` | Working | AES-256-GCM encrypt/decrypt for Meta access tokens |
| `hash-pii.ts` | Working | SHA-256 hashing for all PII fields, E.164 phone via phone-normalizer |
| `phone-normalizer.ts` | Working | 55-country prefix map, E.164 normalization, 7-15 digit validation |
| `consent.ts` | Working | STRICT (require explicit consent) / LAX (send unless opt-out) |
| `api-key.ts` | Working | Generate `tl_` + 64 hex chars, format validation |
| `stripe.ts` | Working | Stripe client (API version 2024-12-18.acacia), plan constants |
| `billing.ts` | Working | Order limit checking, auto-upgrade, Redis counter. Lazy Redis via `getRedis()` |
| `constants.ts` | Working | BILLING_PLANS (4 tiers), AUTO_UPGRADE_MAP, PLAN_PRICE_MAP, RATE_LIMIT, QUEUE_CONFIG, META_API |
| `meta-capi.ts` | Working | POST to Meta Graph API, MetaCapiError with status/response |
| `event-normalizer.ts` | Working | Converts snippet payload to Meta CAPI format, dual camelCase/snake_case |
| `queue.ts` | Working | Lazy BullMQ queue, MetaEventJob interface, 3 retries with backoff |
| `rate-limit.ts` | Working | Lazy Redis, 100 req/sec/workspace, 2s TTL keys |
| `api-key-cache.ts` | **Dead code** | Redis-cached workspace lookup, never imported anywhere |

### Worker (2 files in src/workers/)

| File | Status | What it does |
|------|--------|-------------|
| `start-worker.ts` | Working | Entry point, graceful shutdown (SIGTERM/SIGINT) |
| `meta-event-processor.ts` | Working | BullMQ worker, concurrency 10: decrypt -> normalize -> send to Meta -> update EventLog |

### Test Coverage (15 files, 222 tests)

#### Unit Tests (10 files, 177 tests)

| Test File | Tests | Covers |
|-----------|-------|--------|
| `event-normalizer.test.ts` | 40 | All 5 event types, field mapping, camelCase/snake_case |
| `hash-pii.test.ts` | 25 | SHA-256 hashing, all PII fields, edge cases |
| `billing.test.ts` | 22 | Order limits (all 4 tiers), auto-upgrade, subscription statuses, Redis key format, incrementOrderCount, getOrderCount |
| `meta-capi.test.ts` | 21 | URL construction, request body, error handling |
| `phone-normalizer.test.ts` | 16 | US/UK/DE/FR/AU, E.164, edge cases |
| `rate-limit.test.ts` | 16 | Allow/reject, Redis key patterns, TTL |
| `api-key.test.ts` | 12 | Generation, format validation, uniqueness |
| `encryption.test.ts` | 12 | Round-trip, wrong key/tag/IV, edge cases |
| `consent.test.ts` | 10 | STRICT/LAX mode combinations |
| `meta-event-processor.test.ts` | 5 | Happy path, Meta error, decrypt failure, test event code |

#### Integration Tests (5 files, 45 tests)

Run with: `pnpm test:integration` (requires Docker postgres + redis)

| Test File | Tests | Covers |
|-----------|-------|--------|
| `ingest.test.ts` | 15 | Full ingest pipeline: auth, billing limits, event toggles, consent, CORS, queue job shape |
| `workspaces.test.ts` | 15 | Workspace CRUD: list, create, get, update, delete, rotate-key, ownership isolation |
| `stripe-webhook.test.ts` | 8 | Stripe webhooks: invalid sig, checkout.session.completed, subscription.updated, subscription.deleted, invoice events |
| `signup.test.ts` | 5 | Signup: creates user, duplicate email 409, missing name 422, invalid email 422, short password 422 |
| `health.test.ts` | 2 | Health check: 200 with DB connected, response shape |

**Not tested:** React components, onboarding flow, snippet generation endpoint.

### UI Components

**14 shadcn/ui components:** alert, alert-dialog, accordion, badge, button (custom `brand` variant: `bg-brand-600`), card, input, label, radio-group, separator, sheet, sonner, switch, table

**Custom components:**
- `dashboard/sidebar-nav.tsx` --- Desktop sidebar + Sheet-based mobile nav with active state
- `dashboard/stats-cards.tsx` --- 4 stat cards (total/success rate/failed/last event)
- `dashboard/recent-events.tsx` --- Last 10 events mini-table
- `settings/settings-form.tsx` --- All settings in one component (5 cards)
- `billing/plan-cards.tsx` --- 4-tier plan comparison (FREE/STARTER/GROWTH/SCALE) with subscribe buttons

### Database Schema

**6 models:** User, Account, Session, VerificationToken, Workspace, EventLog, Subscription

**6 enums:** Platform, EventName, EventStatus, ConsentMode, BillingPlan (FREE/STARTER/GROWTH/SCALE), SubscriptionStatus

**Indexes:** Workspace on `[userId]` and `[apiKey]`. EventLog on `[workspaceId, createdAt]`, `[workspaceId, eventName]`, `[eventId]`.

### Infrastructure

- `docker-compose.yml` --- PostgreSQL 16 (port 5433) + Redis 7 (port 6379)
- `Dockerfile` --- Production Next.js app container
- `Dockerfile.worker` --- Production BullMQ worker container
- `.env.example` --- All 15 required env vars documented

---

## Known Bugs

None currently tracked. All previously identified bugs have been fixed (see below).

---

## Fixed Bugs (2026-02-18)

### Bug 1: Eager Redis connection in billing.ts --- FIXED

**File:** `src/lib/billing.ts`
Converted module-scope `new Redis(...)` to lazy `getRedis()` singleton pattern with `lazyConnect: true`, matching all other Redis-using modules.

### Bug 2: Settings "Rotate API Key" button --- FIXED

**File:** `src/components/settings/settings-form.tsx`
Changed `handleRotateKeyConfirmed()` from calling broken `PATCH /api/workspaces/:id` with `{ rotateApiKey: true }` to correctly calling `POST /api/workspaces/${workspace.id}/rotate-key`. Page reloads on success to show new snippet.

### Bug 3: Forgot password honest stub --- FIXED

**File:** `src/app/(auth)/forgot-password/page.tsx`
Removed fake form that showed false "link sent" success. Replaced with honest "Password reset is not yet available" message with links to login and signup. Converted from client to server component.

### Bug 4: Landing page pricing copy --- FIXED

**File:** `src/app/page.tsx`
Corrected all mismatched values to match `BILLING_PLANS` in constants.ts:
- Starter: "50,000 events/mo" -> "5,000 events/mo", "30-day log" -> "7-day log"
- Growth: "Unlimited events" -> "Up to 50,000 events/mo", "90-day log" -> "30-day log", "Up to 5 stores" -> "Up to 3 stores"

### Bug 5: Raw PII storage in EventLog.payload --- FIXED

**File:** `src/app/api/events/ingest/route.ts`
Changed EventLog payload from storing raw `userData` (email, phone, name, address) to storing only `hasUserData: boolean`. PII is still passed in-memory to the BullMQ job for hashing, but no longer persisted in PostgreSQL.

---

## Dead Code & Unused Dependencies

### Dead Code

| File | Issue |
|------|-------|
| `src/lib/api-key-cache.ts` | Redis-cached workspace lookup. Never imported anywhere. The ingest route does a direct `db.workspace.findUnique` instead. |

### Unused Enums

| Enum Value | Issue |
|------------|-------|
| `EventStatus.RETRYING` | Exists in schema but no code ever sets it. BullMQ retries keep status as FAILED until success sets it to SENT. |

### Unused npm Dependencies

| Package | Installed Version | Issue |
|---------|-------------------|-------|
| `@radix-ui/react-dropdown-menu` | ^2.0.6 | No component file, not imported |
| `@radix-ui/react-select` | ^2.0.0 | No component file, not imported |
| `@radix-ui/react-tabs` | ^1.0.4 | No component file, not imported |
| `@radix-ui/react-toast` | ^1.1.5 | No component file (Sonner used instead), not imported |
| `next-themes` | ^0.4.6 | No ThemeProvider rendered, not imported |

These add ~200KB to `node_modules` but don't affect bundle size (tree-shaking removes them).

---

## Billing Model

**Order-based billing** (migrated 2026-02-18 from event-count model)

| Plan | Price | Monthly Orders | Auto-Upgrade To |
|------|-------|---------------|-----------------|
| FREE | $0 | 50 | — (blocked at limit) |
| Starter | $29 | 500 | Growth |
| Growth | $49 | 1,000 | Scale |
| Scale | $99 | 5,000 | — (contact us) |

- Only **Purchase** events count toward limits. All other events (PageView, ViewContent, AddToCart, InitiateCheckout) are free and unlimited.
- Free plan: no credit card required. Purchase forwarding blocked at limit.
- Paid plans: auto-upgrade to next tier via Stripe subscription update when limit exceeded.
- Unlimited workspaces on all plans, shared order pool per user.
- Redis key format: `orders:{userId}:{YYYY-MM}`

## Missing Features (vs. v3 Plan Acceptance Criteria)

| # | Criteria | Status |
|---|----------|--------|
| 1-4 | Signup, login, workspace creation, snippet install | Done |
| 5-9 | All 5 event types flow through pipeline | Done |
| 10 | Deduplication (shared event_id) | Done (by design in snippet) |
| 11 | Consent (STRICT/LAX) | Done |
| 12 | Retry (3 attempts, exponential backoff) | Done |
| 13-14 | Dashboard stats + event logs | Done |
| 15 | Settings (credentials, toggles, snippet) | Done |
| 16 | Billing (subscribe, manage, 4 tiers) | Done |
| 17 | Monthly order limits enforcement | Done (Redis counter in billing.ts, only Purchase events) |
| 18 | Rate limiting (100 req/sec) | Done |
| 19 | Security (encrypted tokens, hashed passwords, rate limiting) | Done |
| 20 | E.164 phone normalization | Done (55 countries) |
| 21 | Health check endpoint | Done |
| 22 | Onboarding wizard | Done |
| 23 | Monthly order usage display | Done (billing page progress bar) |
| 24 | Auto-upgrade on limit exceeded | Done (Stripe subscription update) |

### Not Yet Implemented (from v3 plan)

| Feature | v3 Plan Section | Notes |
|---------|-----------------|-------|
| Actual forgot-password flow | Phase 2 | Stub only, no email service |
| Event log retention cleanup | Acceptance criteria 14 | No scheduled job to purge old EventLog records per plan retention (7/30 days) |

---

## Post-MVP Roadmap (out of scope)

1. Shopify webhook integration (optional server-side fallback)
2. WooCommerce / BigCommerce support (different snippets)
3. Google Analytics / GA4 destination
4. TikTok Events API destination
5. Team access (invite members to workspace)
6. Advanced analytics (funnel visualization, attribution)
7. Custom ingest domain (`t.mystore.com`)
8. Email alerts (error rate threshold)
9. Batch ingestion (multiple events per request)
10. Event replay (re-send failed events on demand)
