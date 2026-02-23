# Track Clear --- Project Status & Audit

Last updated: 2026-02-21 (post production readiness improvements)

## Build Health

| Metric | Status |
|--------|--------|
| Build (`pnpm build`) | Compiles clean |
| Tests (`pnpm test`) | 263/263 passing (14 files) |
| TypeScript | 0 source errors (2 pre-existing test file errors) |
| ESLint | 0 warnings/errors |

## What's Implemented

### Pages (13 routes)

| Route | Type | Status | Notes |
|-------|------|--------|-------|
| `/` | Public | Working | Landing page with hero, pricing, features, scroll animations |
| `/login` | Public | Working | Email/password + Google OAuth |
| `/signup` | Public | Working | Registration with auto-login, sends verification email, redirects to onboarding |
| `/forgot-password` | Public | Working | Sends password reset email via Resend |
| `/reset-password` | Public | Working | Token-based password reset with confirmation |
| `/privacy` | Public | Working | Privacy policy (accurate: IP/UA stored, PII hashing, data retention, GDPR rights) |
| `/terms` | Public | Working | Terms of service (billing, acceptable use, liability, termination) |
| `/dashboard` | Protected | Working | Rich analytics with per-destination tabs, revenue cards (currency conversion), event funnel, delivery stats, order usage, health badge, conversion accuracy, campaign performance, recent events. Full i18n (6 languages) |
| `/events` | Protected | Working | Paginated event log with type/status filters, Source/Campaign columns, retry failed events |
| `/settings` | Protected | Working | 6 destination credential cards, event toggles, consent mode, snippet, alert preferences, language selector, currency selector, danger zone |
| `/billing` | Protected | Working | Current plan, order usage, 4-tier plan cards, FAQ accordion |
| `/onboarding` | Protected | Working | 3-step wizard: create workspace, install snippet, connect platforms |

### API Routes (18 endpoints)

| Endpoint | Methods | Auth | Status | Notes |
|----------|---------|------|--------|-------|
| `/api/auth/[...nextauth]` | ALL | - | Working | NextAuth handler |
| `/api/auth/signup` | POST | - | Working | Zod validation, bcrypt, 409 on duplicate, sends verification email |
| `/api/auth/forgot-password` | POST | - | Working | Generates token, sends email via Resend |
| `/api/auth/reset-password` | POST | - | Working | Validates token, updates password |
| `/api/auth/verify-email` | GET | - | Working | Token-based email verification, sets emailVerified on User |
| `/api/events/ingest` | POST, OPTIONS | API Key | Working | Multi-destination fan-out pipeline with CORS, X-Request-ID header |
| `/api/workspaces` | GET, POST | Session | Working | Unlimited workspaces, encrypts credentials |
| `/api/workspaces/[id]` | GET, PATCH, DELETE | Session | Working | Ownership verified, soft-delete, all destinations |
| `/api/workspaces/[id]/rotate-key` | POST | Session | Working | Generates new API key |
| `/api/workspaces/[id]/replay` | POST | Session | Working | Re-queue failed events (max 500, 5min cooldown) — all destinations supported |
| `/api/workspaces/[id]/analytics` | GET | Session | Working | Dashboard analytics (60s Redis cache, destination filter, currency conversion) |
| `/api/user/preferences` | PATCH | Session | Working | Update user display currency and language |
| `/api/user/account` | DELETE | Session | Working | GDPR account deletion (cancels Stripe, cascades all data) |
| `/api/alerts/preferences` | GET, PUT | Session | Working | Alert notification preferences CRUD |
| `/api/snippet/[workspaceId]` | GET | Session | Working | Generates minified JS snippet (captures ttclid, rdtCid, epik, UTMs, gclid) |
| `/api/stripe/checkout` | POST | Session | Working | Creates Stripe checkout session |
| `/api/stripe/portal` | POST | Session | Working | Opens Stripe billing portal |
| `/api/stripe/webhook` | POST | Stripe sig | Working | Handles 5 Stripe event types |
| `/api/health` | GET | - | Working | DB + Redis ping, queue depth metrics, uptime |

### Multi-Destination Event Pipeline

Track Clear supports 6 ad/analytics destinations with server-side event forwarding:

| Destination | Events Supported | Auth Method | API |
|-------------|-----------------|-------------|-----|
| Meta CAPI | All 5 | Pixel ID + Access Token | Graph API v21.0 |
| TikTok | All 5 | Pixel ID + Access Token | Events API v1.3 |
| GA4 | All 5 | Measurement ID + API Secret | Measurement Protocol |
| Klaviyo | ViewContent, AddToCart, InitiateCheckout, Purchase | API Key | Events API |
| Reddit | All 5 | Account ID + Bearer Token | Conversions API v1 |
| Pinterest | All 5 | Ad Account ID + Bearer Token | Conversions API v5 |

Each destination has:
- Normalizer + API client in `src/lib/destinations/`
- BullMQ worker in `src/workers/`
- Dedicated queue with 3 retries (exponential backoff)
- Encrypted credential storage (AES-256-GCM)
- Settings UI card with enable toggle

### Core Library Modules (26+ files in src/lib/)

| Module | Status | What it does |
|--------|--------|-------------|
| `auth.ts` | Working | NextAuth v5 config (Google + Credentials providers, JWT sessions) |
| `db.ts` | Working | Prisma singleton with hot-reload safety |
| `utils.ts` | Working | `cn()` utility (clsx + tailwind-merge) |
| `encryption.ts` | Working | AES-256-GCM encrypt/decrypt for all credential storage |
| `hash-pii.ts` | Working | SHA-256 hashing for all PII fields, E.164 phone via phone-normalizer |
| `phone-normalizer.ts` | Working | 55-country prefix map, E.164 normalization, 7-15 digit validation |
| `consent.ts` | Working | STRICT (require explicit consent) / LAX (send unless opt-out) |
| `api-key.ts` | Working | Generate `tl_` + 64 hex chars, format validation |
| `stripe.ts` | Working | Stripe client (API version 2024-12-18.acacia), plan constants |
| `billing.ts` | Working | Order limit checking, auto-upgrade, Redis counter. Lazy Redis |
| `constants.ts` | Working | BILLING_PLANS, AUTO_UPGRADE_MAP, PLAN_PRICE_MAP, RATE_LIMIT, QUEUE_CONFIG (6 queues) |
| `meta-capi.ts` | Working | POST to Meta Graph API, MetaCapiError with status/response |
| `event-normalizer.ts` | Working | Converts snippet payload to Meta CAPI format, dual camelCase/snake_case |
| `queue.ts` | Working | Lazy BullMQ queues (6 destinations), MetaEventJob + DestinationEventJob interfaces |
| `rate-limit.ts` | Working | Lazy Redis, 100 req/sec/workspace, 2s TTL keys |
| `analytics.ts` | Working | Dashboard analytics with destination deduplication, currency conversion, health, revenue, event breakdown, billing, conversion accuracy, campaign performance |
| `analytics-cache.ts` | Working | Redis caching wrapper for analytics (60s TTL, lazy connection, keyed by destination+currency) |
| `currency.ts` | Working | Exchange rate fetcher (frankfurter.app), Redis-cached 24h, convertCurrency helper |
| `email.ts` | Working | Resend client for password reset, alert emails, and email verification |
| `alerts.ts` | Working | Alert evaluation: tracking down, high error rate, order limit warnings |
| `replay-rate-limit.ts` | Working | Redis cooldown for event replay (5min per workspace) |
| `extract-custom-data.ts` | Working | Extract value/currency/numItems/orderId from customData |
| `destinations/index.ts` | Working | DESTINATION_EVENT_MAP for all 6 platforms |
| `destinations/tiktok.ts` | Working | TikTok normalizer + API client |
| `destinations/ga4.ts` | Working | GA4 Measurement Protocol normalizer + API client |
| `destinations/klaviyo.ts` | Working | Klaviyo normalizer + API client (raw email, not hashed) |
| `destinations/reddit.ts` | Working | Reddit Conversions API normalizer + API client (Bearer token, SHA-256 hashed PII, rdt_cid click ID) |
| `destinations/pinterest.ts` | Working | Pinterest Conversions API normalizer + API client (Bearer token, SHA-256 hashed PII in arrays, epik click ID, value as string) |
| `api-key-cache.ts` | Working | Redis-cached workspace lookup (used by ingest route) |
| `circuit-breaker.ts` | Working | Redis-based circuit breaker for destination APIs (5 failures = 60s cooldown) |
| `env-validation.ts` | Working | Validates required env vars at startup, warns for optional ones |

### Workers (10 files in src/workers/)

All 6 destination workers have circuit breaker integration (5 consecutive failures = 60s cooldown).

| File | Status | What it does |
|------|--------|-------------|
| `start-worker.ts` | Working | Entry point, starts all 9 workers, graceful shutdown (30s timeout) |
| `meta-event-processor.ts` | Working | Meta CAPI worker: circuit breaker, decrypt, normalize, send, update EventLog |
| `tiktok-event-processor.ts` | Working | TikTok worker: circuit breaker, decrypt, normalize, send, update EventLog |
| `ga4-event-processor.ts` | Working | GA4 worker: circuit breaker, decrypt API secret, normalize, send, update EventLog |
| `klaviyo-event-processor.ts` | Working | Klaviyo worker: circuit breaker, decrypt API key, normalize, send, update EventLog |
| `reddit-event-processor.ts` | Working | Reddit worker: circuit breaker, decrypt Bearer token, normalize, send, update EventLog |
| `pinterest-event-processor.ts` | Working | Pinterest worker: circuit breaker, decrypt Bearer token, normalize, send, update EventLog |
| `alert-checker.ts` | Working | Hourly repeatable job: evaluates alerts, sends email notifications |
| `stale-pending-requeue.ts` | Working | Every 5min: finds stale PENDING events, re-queues to destination queues |
| `event-log-cleanup.ts` | Working | Hourly: deletes expired EventLogs per plan retention (7d Free/Starter, 30d Growth/Scale) |

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

### Test Coverage (17 files, 308 tests)

#### Unit Tests (13 files, 263 tests)

| Test File | Tests | Covers |
|-----------|-------|--------|
| `event-normalizer.test.ts` | 40 | All 5 event types, field mapping, camelCase/snake_case |
| `extract-custom-data.test.ts` | 27 | Custom data extraction from event payloads |
| `hash-pii.test.ts` | 25 | SHA-256 hashing, all PII fields, edge cases |
| `billing.test.ts` | 22 | Order limits (all 4 tiers), auto-upgrade, subscription statuses |
| `meta-capi.test.ts` | 21 | URL construction, request body, error handling |
| `phone-normalizer.test.ts` | 16 | US/UK/DE/FR/AU, E.164, edge cases |
| `rate-limit.test.ts` | 16 | Allow/reject, Redis key patterns, TTL |
| `api-key.test.ts` | 12 | Generation, format validation, uniqueness |
| `encryption.test.ts` | 12 | Round-trip, wrong key/tag/IV, edge cases |
| `consent.test.ts` | 10 | STRICT/LAX mode combinations |
| `analytics.test.ts` | 28 | Health status, revenue aggregation, event breakdown, conversion accuracy |
| `analytics-cache.test.ts` | 7 | Cache hit/miss, Redis errors, Date restoration |
| `meta-event-processor.test.ts` | 5 | Happy path, Meta error, decrypt failure, test event code |

#### Integration Tests (5 files, 45 tests)

Run with: `pnpm test:integration` (requires Docker postgres + redis)

| Test File | Tests | Covers |
|-----------|-------|--------|
| `ingest.test.ts` | 15 | Full ingest pipeline: auth, billing, event toggles, consent, CORS |
| `workspaces.test.ts` | 15 | Workspace CRUD: list, create, get, update, delete, rotate-key |
| `stripe-webhook.test.ts` | 8 | Stripe webhooks: invalid sig, checkout, subscription events |
| `signup.test.ts` | 5 | Signup: creates user, duplicate email, validation |
| `health.test.ts` | 2 | Health check: 200 with DB connected, response shape |

### Database Schema

**9 models:** User, Account, Session, VerificationToken, PasswordResetToken, Workspace, EventLog, Subscription, AlertPreference, AlertLog

**7 enums:** Platform, EventName, EventStatus, ConsentMode, BillingPlan, SubscriptionStatus, Destination (META/TIKTOK/GA4/KLAVIYO/REDDIT/PINTEREST)

**Key indexes:** Workspace on `[userId]`, `[apiKey]`. EventLog on `[workspaceId, createdAt]`, `[workspaceId, eventName]`, `[workspaceId, destination]`, `[workspaceId, utmSource, utmCampaign]`, `[workspaceId, status, createdAt]`, `[workspaceId, eventName, destination, createdAt]`, `[eventId]`, `[status, createdAt]`. AlertLog on `[userId, alertType, sentAt]`.

---

## Known Bugs

None currently tracked.

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
1. **Event Replay** - Retry failed events from events page (bulk or per-event, 5min cooldown)
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
- Unlimited workspaces on all plans, shared order pool per user.

### Phase 8: Production Readiness (2026-02-21)
1. **Content-Security-Policy** - CSP header added to next.config.mjs (script-src, connect-src for all 6 platforms + Stripe)
2. **Account Deletion API** - DELETE /api/user/account endpoint for GDPR compliance (cancels Stripe, cascades all data)
3. **Email Verification** - Verification email sent on signup, GET /api/auth/verify-email endpoint, VerificationToken model
4. **Circuit Breaker** - Redis-based circuit breaker for all 6 destination workers (5 consecutive failures = 60s cooldown)
5. **Privacy & Terms Pages** - /privacy and /terms pages with accurate legal content (IP/UA storage, PII hashing, data retention)
6. **Database Indexes** - Added composite indexes for dashboard and analytics query performance
7. **Request ID Tracking** - X-Request-ID header on ingest success responses for observability
8. **Env Validation** - Extended to validate NEXTAUTH_SECRET, warn for optional vars (Stripe, Resend, App URL)

## Not Yet Implemented

| Feature | Notes |
|---------|-------|
| Team access | Invite members to workspace |
| Custom ingest domain | e.g., `t.mystore.com` |
| Batch ingestion | Multiple events per request |
