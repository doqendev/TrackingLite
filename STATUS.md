# Track Clear --- Project Status & Audit

Last updated: 2026-05-21 (post Mizoke/TrackClear attribution hardening)

## Build Health

| Metric | Status |
|--------|--------|
| Build (`pnpm build`) | Compiles clean |
| Tests (`pnpm test -- --run`) | 353/353 passing (20 files) |
| TypeScript | 0 source errors (`pnpm exec tsc --noEmit` still reports the pre-existing top-level-await config issue in `tests/unit/meta-event-processor.test.ts`) |
| ESLint | Passes with pre-existing `<img>` optimization warnings |

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
| `/settings` | Protected | Working | 7 destination credential cards, event toggles, consent mode, snippet, alert preferences, language selector, currency selector, danger zone |
| `/billing` | Protected | Working | Current plan, order usage, 4-tier plan cards, FAQ accordion |
| `/onboarding` | Protected | Working | 3-step wizard: create workspace, install snippet, connect platforms |

### API Routes (core endpoints)

| Endpoint | Methods | Auth | Status | Notes |
|----------|---------|------|--------|-------|
| `/api/auth/[...nextauth]` | ALL | - | Working | NextAuth handler |
| `/api/auth/signup` | POST | - | Working | Zod validation, bcrypt, 409 on duplicate, sends verification email |
| `/api/auth/forgot-password` | POST | - | Working | Generates token, sends email via Resend |
| `/api/auth/reset-password` | POST | - | Working | Validates token, updates password |
| `/api/auth/verify-email` | GET | - | Working | Token-based email verification, sets emailVerified on User |
| `/api/events/ingest` | POST, OPTIONS | API Key | Working | Multi-destination fan-out pipeline with CORS, X-Request-ID header, server-proxy shopper IP/UA headers, fbclid-derived fbc |
| `/api/workspaces` | GET, POST | Session | Working | Unlimited workspaces, encrypts credentials |
| `/api/workspaces/[id]` | GET, PATCH, DELETE | Session | Working | Ownership verified, soft-delete, all destinations |
| `/api/workspaces/[id]/rotate-key` | POST | Session | Working | Generates new API key |
| `/api/workspaces/[id]/replay` | POST | Session | Working | Re-queue failed events (max 500, 5min cooldown) — all destinations supported |
| `/api/workspaces/[id]/analytics` | GET | Session | Working | Dashboard analytics (60s Redis cache, destination filter, currency conversion) |
| `/api/user/preferences` | PATCH | Session | Working | Update user display currency and language |
| `/api/user/account` | DELETE | Session | Working | GDPR account deletion (cancels Stripe, cascades all data) |
| `/api/alerts/preferences` | GET, PUT | Session | Working | Alert notification preferences CRUD |
| `/api/snippet/[workspaceId]` | GET | Session | Working | Generates minified JS snippet (captures ttclid, rdtCid, epik, UTMs, gclid) |
| `/api/pixel/[workspaceId]` | GET, OPTIONS | Public | Working | Public Shopify Custom Pixel JS with bounded `_fbp` validation and webhook-aware Purchase `fbq` guard |
| `/api/s/[workspaceId]` | GET | Public | Working | Legacy public pixel JS with bounded `_fbp` validation and webhook-aware Purchase `fbq` guard |
| `/api/stripe/checkout` | POST | Session | Working | Creates Stripe checkout session |
| `/api/stripe/portal` | POST | Session | Working | Opens Stripe billing portal |
| `/api/stripe/webhook` | POST | Stripe sig | Working | Handles 5 Stripe event types |
| `/api/health` | GET | - | Working | Smart liveness probe: DB + Redis ping with 3s timeout, always returns 200, reports ok/degraded |
| `/api/status` | GET | Session | Working | Auth-gated deep health check: DB + Redis ping with 3s timeout, uptime |
| `/api/webhooks/shopify` | POST | HMAC sig | Working | Shopify order webhook: orders/paid + refunds/create, HMAC verification, cart/order attribute attribution, session enrichment, DLQ |

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

### Core Library Modules (26+ files in src/lib/)

| Module | Status | What it does |
|--------|--------|-------------|
| `auth.ts` | Working | NextAuth v5 config (Google + Credentials providers, JWT sessions) |
| `db.ts` | Working | Prisma singleton with hot-reload safety, connection pool limit (configurable via PRISMA_POOL_SIZE), env-aware logging |
| `utils.ts` | Working | `cn()` utility (clsx + tailwind-merge) |
| `encryption.ts` | Working | AES-256-GCM encrypt/decrypt for all credential storage |
| `hash-pii.ts` | Working | SHA-256 hashing for all PII fields, E.164 phone via phone-normalizer |
| `phone-normalizer.ts` | Working | 55-country prefix map, E.164 normalization, 7-15 digit validation |
| `consent.ts` | Working | STRICT (require explicit consent) / LAX (send unless opt-out) |
| `api-key.ts` | Working | Generate `tl_` + 64 hex chars, format validation |
| `stripe.ts` | Working | Stripe client (API version 2024-12-18.acacia), plan constants |
| `billing.ts` | Working | Order limit checking, auto-upgrade, Redis counter. Lazy Redis |
| `constants.ts` | Working | BILLING_PLANS, AUTO_UPGRADE_MAP, PLAN_PRICE_MAP, RATE_LIMIT, QUEUE_CONFIG (7 queues) |
| `meta-capi.ts` | Working | POST to Meta Graph API, MetaCapiError with status/response |
| `event-normalizer.ts` | Working | Converts snippet payload to Meta CAPI format, dual camelCase/snake_case, bounded Meta cookie validation |
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
| `destinations/tiktok.ts` | Working | TikTok normalizer + API client |
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
| `session-enrichment.ts` | Working | Redis-backed browser context store for webhook Purchase attribution (fbp, fbc, ttclid, rdtCid, epik) |
| `shopify-webhook.ts` | Working | HMAC-SHA256 signature verification for Shopify webhooks |
| `shopify-domain-resolver.ts` | Working | Resolves and validates Shopify store domains (myshopify.com normalization) |
| `workspace-cache.ts` | Working | Redis-cached workspace lookup by shopifyDomain (used by webhook route) |
| `guide-content.ts` | Working | Setup guide content for all 7 integration platforms + Shopify webhook |
| `tracking-context.ts` | Working | Shared helper for server-proxy client IP/UA extraction and fbclid -> fbc synthesis |
| `shopify-webhook-attribution.ts` | Working | Extracts Shopify order/cart/landing-site attribution, builds Purchase attribution, and shapes line-item content IDs/contents |

### Workers (10 files in src/workers/)

All 7 destination workers have circuit breaker integration (5 consecutive failures = 60s cooldown).

| File | Status | What it does |
|------|--------|-------------|
| `start-worker.ts` | Working | Entry point, starts all 10 workers, graceful shutdown (30s timeout), Sentry error tracking |
| `meta-event-processor.ts` | Working | Meta CAPI worker: circuit breaker, decrypt, normalize, send, update EventLog |
| `tiktok-event-processor.ts` | Working | TikTok worker: circuit breaker, decrypt, normalize, send, update EventLog |
| `ga4-event-processor.ts` | Working | GA4 worker: circuit breaker, decrypt API secret, normalize, send, update EventLog |
| `klaviyo-event-processor.ts` | Working | Klaviyo worker: circuit breaker, decrypt API key, normalize, send, update EventLog |
| `reddit-event-processor.ts` | Working | Reddit worker: circuit breaker, decrypt Bearer token, normalize, send, update EventLog |
| `pinterest-event-processor.ts` | Working | Pinterest worker: circuit breaker, decrypt Bearer token, normalize, send, update EventLog |
| `google-ads-event-processor.ts` | Working | Google Ads worker: circuit breaker, normalize to pixel params, fire server-side GET, update EventLog |
| `alert-checker.ts` | Working | Hourly repeatable job: evaluates alerts, sends email notifications |
| `stale-pending-requeue.ts` | Working | Every 5min: re-queues stale PENDING events; hourly order count reconciliation; DLQ cleanup (30d resolved, 90d unresolved) |
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

### Test Coverage (25 files, 398 tests)

#### Unit Tests (20 files, 353 tests)

| Test File | Tests | Covers |
|-----------|-------|--------|
| `shopify-domain-resolver.test.ts` | 28 | Domain resolution, validation, edge cases |
| `tracking-context.test.ts` | 6 | fbclid-derived fbc synthesis and server-proxy client IP/UA header precedence |
| `extract-custom-data.test.ts` | 27 | Custom data extraction from event payloads |
| `encryption.test.ts` | 12 | Round-trip, wrong key/tag/IV, edge cases |
| `meta-capi.test.ts` | 21 | URL construction, request body, error handling |
| `hash-pii.test.ts` | 24 | SHA-256 hashing, all PII fields, edge cases |
| `pixel-route.test.ts` | 3 | Generated pixel scripts: bounded fbp validation and webhook-aware Purchase fbq guard |
| `event-normalizer.test.ts` | 50 | All 5 event types, field mapping, camelCase/snake_case, Meta cookie validation |
| `analytics-cache.test.ts` | 7 | Cache hit/miss, Redis errors, Date restoration |
| `rate-limit.test.ts` | 16 | Allow/reject, Redis key patterns, TTL |
| `billing.test.ts` | 22 | Order limits (all 4 tiers), auto-upgrade, subscription statuses |
| `google-ads.test.ts` | 34 | Google Ads normalizer (email normalization, param building, all 4 events), pixel endpoint (URL construction, error handling) |
| `analytics.test.ts` | 28 | Health status, revenue aggregation, event breakdown, conversion accuracy |
| `meta-event-processor.test.ts` | 5 | Happy path, Meta error, decrypt failure, test event code |
| `consent.test.ts` | 28 | STRICT/LAX mode, webhook bypass, edge cases |
| `ingest-attribution.test.ts` | 1 | Ingest route uses X-TL-Client headers and resolved fbc in EventLog, queue job, and session enrichment |
| `api-key.test.ts` | 12 | Generation, format validation, uniqueness |
| `shopify-webhook-attribution.test.ts` | 7 | Shopify order/landing attribution extraction, fbc synthesis, variant-first content IDs, Purchase contents |
| `phone-normalizer.test.ts` | 16 | US/UK/DE/FR/AU, E.164, edge cases |
| `shopify-webhook.test.ts` | 6 | HMAC verification, replay protection, header extraction |

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

**10 models:** User, Account, Session, VerificationToken, PasswordResetToken, Workspace, EventLog, Subscription, AlertPreference, AlertLog, WebhookDeadLetter

**7 enums:** Platform, EventName (5 events + Refund), EventStatus, ConsentMode, BillingPlan, SubscriptionStatus, Destination (META/TIKTOK/GA4/KLAVIYO/REDDIT/PINTEREST/GOOGLE_ADS)

**Key indexes:** Workspace on `[userId]`, `[apiKey]`. EventLog on `[workspaceId, createdAt]`, `[workspaceId, eventName]`, `[workspaceId, destination]`, `[workspaceId, utmSource, utmCampaign]`, `[workspaceId, status, createdAt]`, `[workspaceId, eventName, destination, createdAt]`, `[eventId]`, `[status, createdAt]`. AlertLog on `[userId, alertType, sentAt]`. WebhookDeadLetter on `[shopDomain, topic, createdAt]`, `[resolvedAt, createdAt]`.

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

### Phase 9: Production Hardening (2026-02-23)
1. **Smart Health Check** - `/api/health` now checks DB + Redis with 3s timeouts, always returns HTTP 200 (prevents Railway restart loops), reports `ok`/`degraded` status for monitoring
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
6. **Session Enrichment Store** - Redis hash per workspace+email bridges browser pixel context to server-side webhooks. 24h TTL with per-field staleness tracking.
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
4. **Webhook Purchase Enrichment** - Shopify `orders/paid` webhook now extracts cart/order attributes such as `_fbp`, `_fbc`, `_fbclid`, `_gclid`, `_ttclid`, `_rdt_cid`, `_epik`, and `utm_*` before falling back to session enrichment or landing-site query params. Landing-site `fbclid` is synthesized into `fbc` only after stronger order/session/landing `fbc` values are absent.
5. **Richer Purchase Payloads** - Webhook Purchases now include variant-first `content_ids`, `content_type: "product"`, and `contents` with quantity and item price where Shopify provides them.
6. **Session Enrichment Before Webhook Skip** - Snippet Purchase events for webhook-enabled workspaces now store browser context before returning `webhook_active`, so later Shopify webhooks can recover checkout attribution.
7. **Webhook Purchase Dedup Guard** - For workspaces with a Shopify webhook secret configured, generated `/api/pixel/:workspaceId` and legacy `/api/s/:workspaceId` scripts suppress browser `fbq("track", "Purchase")` while still sending TrackClear Purchase context to ingest.
8. **Regression Tests** - Added focused unit tests for header precedence, fbc synthesis, order/landing attribution extraction, line-item payload shape, ingest propagation, event-normalizer cookie bounds, and generated pixel Purchase guards.

## Not Yet Implemented

| Feature | Notes |
|---------|-------|
| Team access | Invite members to workspace |
| Custom ingest domain | e.g., `t.mystore.com` |
| Batch ingestion | Multiple events per request |
