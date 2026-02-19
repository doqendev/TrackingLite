# Track Clear --- Project Status & Audit

Last updated: 2026-02-19 (post feature expansion: Phases 1-3)

## Build Health

| Metric | Status |
|--------|--------|
| Build (`pnpm build`) | Compiles clean |
| Tests (`pnpm test`) | 239/239 passing (13 files) |
| TypeScript | 0 source errors (2 pre-existing test file errors) |
| ESLint | 0 warnings/errors |

## What's Implemented

### Pages (11 routes)

| Route | Type | Status | Notes |
|-------|------|--------|-------|
| `/` | Public | Working | Landing page with hero, pricing, features |
| `/login` | Public | Working | Email/password + Google OAuth |
| `/signup` | Public | Working | Registration with auto-login, redirects to onboarding |
| `/forgot-password` | Public | Working | Sends password reset email via Resend |
| `/reset-password` | Public | Working | Token-based password reset with confirmation |
| `/dashboard` | Protected | Working | Rich analytics: revenue cards, event funnel, delivery stats, order usage, health badge, EMQ score, conversion accuracy, recent events |
| `/events` | Protected | Working | Paginated event log with type/status filters, retry failed events |
| `/settings` | Protected | Working | 6 destination credential cards (Meta, Google Ads, TikTok, GA4, Klaviyo), event toggles, consent mode, snippet, alert preferences, danger zone |
| `/billing` | Protected | Working | Current plan, order usage, 4-tier plan cards, FAQ accordion |
| `/onboarding` | Protected | Working | 3-step wizard: create workspace, copy snippet, test event |

### API Routes (14 endpoints)

| Endpoint | Methods | Auth | Status | Notes |
|----------|---------|------|--------|-------|
| `/api/auth/[...nextauth]` | ALL | - | Working | NextAuth handler |
| `/api/auth/signup` | POST | - | Working | Zod validation, bcrypt, 409 on duplicate |
| `/api/auth/forgot-password` | POST | - | Working | Generates token, sends email via Resend |
| `/api/auth/reset-password` | POST | - | Working | Validates token, updates password |
| `/api/events/ingest` | POST, OPTIONS | API Key | Working | Multi-destination fan-out pipeline with CORS |
| `/api/workspaces` | GET, POST | Session | Working | Unlimited workspaces, encrypts credentials |
| `/api/workspaces/[id]` | GET, PATCH, DELETE | Session | Working | Ownership verified, soft-delete, all destinations |
| `/api/workspaces/[id]/rotate-key` | POST | Session | Working | Generates new API key |
| `/api/workspaces/[id]/replay` | POST | Session | Working | Re-queue failed events (max 500, 5min cooldown) |
| `/api/workspaces/[id]/analytics` | GET | Session | Working | Dashboard analytics (60s Redis cache) |
| `/api/alerts/preferences` | GET, PUT | Session | Working | Alert notification preferences CRUD |
| `/api/snippet/[workspaceId]` | GET | Session | Working | Generates minified JS snippet (captures ttclid) |
| `/api/stripe/checkout` | POST | Session | Working | Creates Stripe checkout session |
| `/api/stripe/portal` | POST | Session | Working | Opens Stripe billing portal |
| `/api/stripe/webhook` | POST | Stripe sig | Working | Handles 5 Stripe event types |
| `/api/health` | GET | - | Working | DB ping, returns status + uptime |

### Multi-Destination Event Pipeline

Track Clear supports 5 ad/analytics destinations with server-side event forwarding:

| Destination | Events Supported | Auth Method | API |
|-------------|-----------------|-------------|-----|
| Meta CAPI | All 5 | Pixel ID + Access Token | Graph API v21.0 |
| Google Ads | AddToCart, InitiateCheckout, Purchase | Customer ID + OAuth + Developer Token | Ads API v18 |
| TikTok | All 5 | Pixel ID + Access Token | Events API v1.3 |
| GA4 | All 5 | Measurement ID + API Secret | Measurement Protocol |
| Klaviyo | ViewContent, AddToCart, InitiateCheckout, Purchase | API Key | Events API |

Each destination has:
- Normalizer + API client in `src/lib/destinations/`
- BullMQ worker in `src/workers/`
- Dedicated queue with 3 retries (exponential backoff)
- Encrypted credential storage (AES-256-GCM)
- Settings UI card with enable toggle

### Core Library Modules (25+ files in src/lib/)

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
| `constants.ts` | Working | BILLING_PLANS, AUTO_UPGRADE_MAP, PLAN_PRICE_MAP, RATE_LIMIT, QUEUE_CONFIG (5 queues) |
| `meta-capi.ts` | Working | POST to Meta Graph API, MetaCapiError with status/response |
| `event-normalizer.ts` | Working | Converts snippet payload to Meta CAPI format, dual camelCase/snake_case |
| `queue.ts` | Working | Lazy BullMQ queues (5 destinations), MetaEventJob + DestinationEventJob interfaces |
| `rate-limit.ts` | Working | Lazy Redis, 100 req/sec/workspace, 2s TTL keys |
| `analytics.ts` | Working | Dashboard analytics: health, revenue, event breakdown, billing, EMQ, conversion accuracy |
| `analytics-cache.ts` | Working | Redis caching wrapper for analytics (60s TTL, lazy connection) |
| `email.ts` | Working | Resend client for password reset + alert emails |
| `alerts.ts` | Working | Alert evaluation: tracking down, high error rate, order limit warnings, EMQ drop |
| `replay-rate-limit.ts` | Working | Redis cooldown for event replay (5min per workspace) |
| `extract-custom-data.ts` | Working | Extract value/currency/numItems/orderId from customData |
| `destinations/index.ts` | Working | DESTINATION_EVENT_MAP for all 5 platforms |
| `destinations/google-ads.ts` | Working | Google Ads normalizer + API client |
| `destinations/tiktok.ts` | Working | TikTok normalizer + API client |
| `destinations/ga4.ts` | Working | GA4 Measurement Protocol normalizer + API client |
| `destinations/klaviyo.ts` | Working | Klaviyo normalizer + API client (raw email, not hashed) |
| `api-key-cache.ts` | **Dead code** | Redis-cached workspace lookup, never imported anywhere |

### Workers (8 files in src/workers/)

| File | Status | What it does |
|------|--------|-------------|
| `start-worker.ts` | Working | Entry point, starts all 6 workers, graceful shutdown |
| `meta-event-processor.ts` | Working | Meta CAPI worker: decrypt, normalize, send, update EventLog |
| `google-event-processor.ts` | Working | Google Ads worker: decrypt, normalize, send, update EventLog |
| `tiktok-event-processor.ts` | Working | TikTok worker: decrypt, normalize, send, update EventLog |
| `ga4-event-processor.ts` | Working | GA4 worker: decrypt API secret, normalize, send, update EventLog |
| `klaviyo-event-processor.ts` | Working | Klaviyo worker: decrypt API key, normalize, send, update EventLog |
| `alert-checker.ts` | Working | Hourly repeatable job: evaluates alerts, sends email notifications |

### Dashboard Analytics Components

| Component | What it shows |
|-----------|-------------|
| `emq-score.tsx` | Event Match Quality score (0-10), data field coverage breakdown, tips |
| `conversion-accuracy.tsx` | Purchase delivery accuracy (7d/30d), sent/failed counts |
| `revenue-cards.tsx` | 3 revenue cards (AddToCart, Checkout, Purchase) with yesterday delta |
| `event-funnel.tsx` | 5-row event funnel with horizontal bars |
| `delivery-stats.tsx` | 24h delivery metrics: success rate, delivered/failed |
| `order-usage-bar.tsx` | Order usage progress bar with plan badge |
| `recent-events.tsx` | Last 10 events mini-table with value column |

### Test Coverage (17 files, 284 tests)

#### Unit Tests (13 files, 239 tests)

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
| `analytics.test.ts` | 28 | Health status, revenue aggregation, event breakdown, EMQ, conversion accuracy |
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

**7 enums:** Platform, EventName, EventStatus, ConsentMode, BillingPlan, SubscriptionStatus, Destination (META/GOOGLE_ADS/TIKTOK/GA4/KLAVIYO)

**Key indexes:** Workspace on `[userId]`, `[apiKey]`. EventLog on `[workspaceId, createdAt]`, `[workspaceId, eventName]`, `[workspaceId, destination]`, `[eventId]`. AlertLog on `[userId, alertType, sentAt]`.

---

## Known Bugs

None currently tracked.

---

## Dead Code & Unused Dependencies

### Dead Code

| File | Issue |
|------|-------|
| `src/lib/api-key-cache.ts` | Redis-cached workspace lookup. Never imported anywhere. |

### Unused Enums

| Enum Value | Issue |
|------------|-------|
| `EventStatus.RETRYING` | Exists in schema but no code ever sets it. |

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
1. **EMQ Score Display** - Event Match Quality gauge on dashboard with field coverage breakdown
2. **Event Replay** - Retry failed events from events page (bulk or per-event, 5min cooldown)
3. **Conversion Accuracy** - Purchase delivery accuracy dashboard (7d/30d)
4. **Password Reset** - Working password reset via Resend email service

### Phase 2: Multi-Destination (2026-02-19)
1. **Architecture Refactoring** - Fan-out pipeline, per-destination queues, Destination enum
2. **Google Ads** - Conversion API integration with offline upload
3. **TikTok** - Events API integration with ttclid capture in snippet

### Phase 3: Ecosystem (2026-02-19)
1. **GA4** - Measurement Protocol integration for server-side Google Analytics
2. **Klaviyo** - Server-side events for email/SMS automation (raw email, not hashed)
3. **Email Alerts** - Proactive notifications for tracking health, error rates, order limits, EMQ drops

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

## Not Yet Implemented

| Feature | Notes |
|---------|-------|
| Event log retention cleanup | No scheduled job to purge old EventLog records per plan retention (7/30 days) |
| Google Ads OAuth flow | Currently manual token entry; needs OAuth callback route for token refresh |
| Pinterest destination | Deferred to post-Phase 3 |
| Team access | Invite members to workspace |
| Custom ingest domain | e.g., `t.mystore.com` |
| Batch ingestion | Multiple events per request |
