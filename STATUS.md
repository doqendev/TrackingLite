# Track Clear --- Project Status & Audit

Last updated: 2026-05-23 (Dirava controlled order QA artifact)

## Build Health

| Metric | Status |
|--------|--------|
| Build (`pnpm build`) | Compiles clean |
| Tests (`pnpm test -- --run`) | 427/427 passing (37 files) |
| Migrations | `20260521_add_workspace_product_mode`, `20260522_add_catalog_id_settings`, and `20260522_add_custom_ingest_domain` applied in production |
| TypeScript | `pnpm exec tsc --noEmit` passes cleanly |
| ESLint | Passes with pre-existing `<img>` optimization warnings |
| Production branch | GitHub default branch is `main`; Vercel production and Railway worker deploy from `main` |

## Production QA Evidence

- Dirava controlled order `#5076` is documented in `docs/qa/dirava-order-5076.md`.
- The order proved the canonical Shopify webhook Purchase path for a controlled `0 EUR` order: deterministic Purchase event ID, one Meta and one TikTok EventLog, Meta API acceptance (`events_received: 1`), TikTok API acceptance (`code: 0`, `message: OK`), attribution through Redis session enrichment plus landing-site fallback, and variant-ID `content_ids`/`contents`.
- The order did not prove paid-order revenue propagation because the final Shopify order total was intentionally `0 EUR` after two discount codes.
- Cart/order attribute persistence remains unproven for the Shopify Custom Pixel `/cart/update.js` writer: `_trackclear_session_id` was not present in webhook/order attribution, and the order was enriched through Redis session enrichment rather than cart attributes.

## What's Implemented

### Pages (14 routes)

| Route | Type | Status | Notes |
|-------|------|--------|-------|
| `/` | Public | Working | Landing page with hero, pricing, features, scroll animations |
| `/login` | Public | Working | Email/password + Google OAuth |
| `/signup` | Public | Working | Registration with auto-login, sends verification email, redirects to onboarding |
| `/forgot-password` | Public | Working | Sends password reset email via Resend |
| `/reset-password` | Public | Working | Token-based password reset with confirmation |
| `/privacy` | Public | Working | Privacy policy (accurate: IP/UA stored, PII hashing, data retention, GDPR rights) |
| `/terms` | Public | Working | Terms of service (billing, acceptable use, liability, termination) |
| `/dashboard` | Protected | Working | Mode-aware analytics with revenue cards (currency conversion), event funnel, delivery stats, order usage, health badge, conversion accuracy, campaign performance, recent events. Full i18n (6 languages) |
| `/tracking-health` | Protected | Working | Operational status for recent snippet activity, Shopify webhook, Meta/TikTok connection, Purchase, dedup, attribution source breakdown, recent errors |
| `/events` | Protected | Working | Mode-aware paginated event log with type/status filters, Source/Campaign columns, retry failed events |
| `/diagnostics` | Protected | Working | Internal mode-aware diagnostics for destination health, event/destination matrix, data quality, event audit fields, and safe non-Purchase test events |
| `/settings` | Protected | Working | Event toggles, consent mode, catalog ID matching, custom ingest domain, snippet, alert preferences, language selector, currency selector, danger zone |
| `/integrations` | Protected | Working | Mode-aware setup: V1 shows Shopify webhook + Meta/TikTok, legacy/custom workspaces show all destination cards |
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
| `/api/diagnostics` | GET | Session | Working | Internal diagnostics data filtered through workspace destination allowlist |
| `/api/events/ingest` | POST, OPTIONS | API Key | Working | Multi-destination fan-out pipeline with CORS, X-Request-ID header, server-proxy shopper IP/UA headers, fbclid-derived fbc, multi-key session enrichment |
| `/api/workspaces` | GET, POST | Session | Working | Unlimited workspaces, encrypts credentials |
| `/api/workspaces/[id]` | GET, PATCH, DELETE | Session | Working | Ownership verified, soft-delete, destination credentials, product mode/install type read-only from public PATCH, catalog ID settings and custom ingest domain editable |
| `/api/workspaces/[id]/custom-ingest-domain/verify` | POST | Session | Working | Verifies a saved custom ingest domain by checking the public TrackClear marker route through that host |
| `/api/workspaces/[id]/rotate-key` | POST | Session | Working | Generates new API key |
| `/api/workspaces/[id]/replay` | POST | Session | Working | Re-queue failed events (max 500, 5min cooldown), all destinations supported; sanitized rows replay without reconstructing raw PII |
| `/api/workspaces/[id]/analytics` | GET | Session | Working | Dashboard analytics (60s Redis cache, destination filter, currency conversion) |
| `/api/workspaces/[id]/diagnostics/test-event` | POST | Session | Working | Sends safe AddToCart/InitiateCheckout diagnostic events through ingest; Purchase is intentionally unsupported |
| `/api/user/preferences` | PATCH | Session | Working | Update user display currency and language |
| `/api/user/account` | DELETE | Session | Working | GDPR account deletion (cancels Stripe, cascades all data) |
| `/api/alerts/preferences` | GET, PUT | Session | Working | Alert notification preferences CRUD |
| `/api/snippet/[workspaceId]` | GET | Session | Working | Generates minified JS snippet and uses a verified custom ingest domain as the pixel-loader host when configured |
| `/api/pixel/[workspaceId]` | GET, OPTIONS | Public | Working | Public Shopify Custom Pixel JS with `_trackclear_session_id`, best-effort cart attribution writer, catalog ID settings, custom ingest URL resolution, bounded `_fbp` validation, and webhook-aware Purchase `fbq` guard |
| `/api/s/[workspaceId]` | GET | Public | Working | Legacy public pixel JS with the same session/cart attribution, catalog ID settings, custom ingest URL resolution, and Purchase guard |
| `/api/custom-ingest-domain/check` | GET | Public | Working | Public no-store marker route used by custom ingest domain verification |
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
| `event-log-payload.ts` | Working | Builds sanitized EventLog payloads with customData, userDataFlags, clickIdFlags, and redacted checkout/cart tokens instead of raw shopper userData |
| `purchase-event-id.ts` | Working | Builds deterministic Shopify Purchase event IDs for snippet, generated pixel, ingest, and webhook paths, preferring order name when available for browser/webhook convergence |
| `content-id.ts` | Working | Normalizes Shopify catalog content IDs across numeric variant/product IDs, GraphQL IDs, SKU, custom templates, rich direct-ingest contents, and workspace catalog settings |
| `custom-ingest-domain.ts` | Working | Normalizes/validates merchant-owned ingest domains and resolves verified pixel-loader and ingest URLs with safe defaults |
| `workspace-mode.ts` | Working | Nullable product mode/install type fallback, V1 destination allowlist, `LEGACY_WORKSPACE_IDS` emergency bypass |
| `diagnostics-audit-fields.ts` | Working | Computes Diagnostics event-audit field visibility and counts: core fields plus captured optional click/UTM fields relevant to allowed destinations |
| `tracking-health.ts` | Working | Computes operational tracking health checks for normal Shopify V1 readiness, including webhook attribution source breakdown; snippet activity is activity-based, not a heartbeat |
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
| `destinations/tiktok.ts` | Working | TikTok normalizer + API client, hashed external_id support, rich contents payloads |
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
| `session-enrichment.ts` | Working | Redis-backed browser context store for webhook Purchase attribution keyed by `_trackclear_session_id`, checkout token, cart token, order ID/name, and email |
| `shopify-webhook.ts` | Working | HMAC-SHA256 signature verification for Shopify webhooks |
| `shopify-domain-resolver.ts` | Working | Resolves and validates Shopify store domains (myshopify.com normalization) |
| `workspace-cache.ts` | Working | Redis-cached workspace lookup by shopifyDomain (used by webhook route) |
| `guide-content.ts` | Working | Setup guide content for all 7 integration platforms + Shopify webhook |
| `tracking-context.ts` | Working | Shared helper for server-proxy client IP/UA extraction and fbclid -> fbc synthesis |
| `shopify-webhook-attribution.ts` | Working | Extracts Shopify order/cart/landing-site attribution, normalizes webhook Purchase URLs, and shapes line-item content IDs/contents |
| `headless-sdk.ts` | Working | Headless/Hydrogen helper for URL attribution capture, Meta `_fbp`/`_fbc` cookies, `_trackclear_session_id` creation, Shopify cart attributes, and TrackClear ingest calls |

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

### Test Coverage (42 files, 472 tests)

#### Unit Tests (37 files, 427 tests)

| Test File | Tests | Covers |
|-----------|-------|--------|
| `shopify-domain-resolver.test.ts` | 28 | Domain resolution, validation, edge cases |
| `tracking-context.test.ts` | 6 | fbclid-derived fbc synthesis and server-proxy client IP/UA header precedence |
| `extract-custom-data.test.ts` | 27 | Custom data extraction from event payloads |
| `encryption.test.ts` | 12 | Round-trip, wrong key/tag/IV, edge cases |
| `meta-capi.test.ts` | 21 | URL construction, request body, error handling |
| `hash-pii.test.ts` | 24 | SHA-256 hashing, all PII fields, edge cases |
| `custom-ingest-domain.test.ts` | 4 | Custom domain normalization, invalid host rejection, verified endpoint resolution, verification URL construction |
| `custom-ingest-domain-verify-route.test.ts` | 3 | Authenticated custom ingest domain verification success, failure clearing, and missing-domain guard |
| `snippet-route.test.ts` | 3 | Snippet route uses default app host until a custom domain is verified, then uses the custom pixel-loader host |
| `pixel-route.test.ts` | 5 | Generated pixel scripts: bounded fbp validation, TrackClear session/cart attribution writer, catalog settings, verified custom ingest URL, and webhook-aware Purchase fbq guard |
| `event-normalizer.test.ts` | 50 | All 5 event types, field mapping, camelCase/snake_case, Meta cookie validation |
| `event-log-payload.test.ts` | 2 | EventLog payload PII redaction, userDataFlags, clickIdFlags |
| `purchase-event-id.test.ts` | 8 | Deterministic Shopify Purchase event ID priority, order-name browser/webhook convergence, GraphQL/numeric order convergence, and checkout-token fallback behavior |
| `content-id.test.ts` | 6 | Shopify catalog content ID normalization for numeric IDs, GIDs, SKU, templates, rich direct-ingest customData, and workspace settings |
| `workspace-mode.test.ts` | 3 | Null-mode legacy fallback with all destinations, Shopify V1 Meta/TikTok allowlist, env bypass |
| `workspace-create-mode.test.ts` | 1 | New normal Shopify workspaces default to V1/custom-pixel mode |
| `workspace-route-mode.test.ts` | 5 | Public workspace PATCH cannot switch normal workspaces to legacy/headless; catalog settings and custom ingest domains can be updated with validation |
| `events-page-mode.test.ts` | 1 | Events page failed-count/replay visibility respects workspace destination allowlist |
| `diagnostics-audit-fields.test.ts` | 5 | Mode-aware Diagnostics captured-field visibility for core, optional click IDs, UTM fields, and non-Purchase events |
| `diagnostics-route-mode.test.ts` | 1 | Diagnostics route returns and queries only destinations allowed by workspace mode |
| `diagnostics-test-event-route.test.ts` | 2 | Safe AddToCart/InitiateCheckout diagnostic events through ingest, Purchase rejection |
| `analytics-cache.test.ts` | 7 | Cache hit/miss, Redis errors, Date restoration |
| `rate-limit.test.ts` | 16 | Allow/reject, Redis key patterns, TTL |
| `billing.test.ts` | 22 | Order limits (all 4 tiers), auto-upgrade, subscription statuses |
| `google-ads.test.ts` | 34 | Google Ads normalizer (email normalization, param building, all 4 events), pixel endpoint (URL construction, error handling) |
| `tiktok.test.ts` | 3 | TikTok external_id hashing, rich contents, and fallback content_ids |
| `analytics.test.ts` | 28 | Health status, revenue aggregation, event breakdown, conversion accuracy |
| `meta-event-processor.test.ts` | 5 | Happy path, Meta error, decrypt failure, test event code |
| `consent.test.ts` | 29 | STRICT/LAX mode, per-destination marketing/analytics mapping, webhook bypass, edge cases |
| `ingest-attribution.test.ts` | 8 | Ingest route uses X-TL-Client headers and resolved fbc in EventLog, stores sanitized payload, queue job, multi-key session enrichment, V1 destination filtering, legacy onlyDestinations preservation, deterministic Purchase IDs, SKU/custom catalog IDs |
| `session-enrichment.test.ts` | 2 | Redis session context storage/lookup across TrackClear session ID, checkout token, cart token, order identifiers, and email |
| `api-key.test.ts` | 12 | Generation, format validation, uniqueness |
| `shopify-webhook-attribution.test.ts` | 12 | Shopify order/landing attribution extraction, absolute landing URL normalization, fbc synthesis, catalog-aware content IDs, Purchase contents |
| `phone-normalizer.test.ts` | 16 | US/UK/DE/FR/AU, E.164, edge cases |
| `shopify-webhook.test.ts` | 6 | HMAC verification, replay protection, header extraction |
| `shopify-webhook-route-mode.test.ts` | 4 | Shopify webhook fan-out filters V1 to Meta/TikTok, preserves legacy env-bypass behavior, and applies SKU/product catalog settings |
| `headless-sdk.test.ts` | 6 | Headless attribution capture, Meta cookie synthesis, TrackClear session ID creation, Shopify cart attributes, TrackClear ingest client |

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

**11 models:** User, Account, Session, VerificationToken, PasswordResetToken, Workspace, EventLog, Subscription, AlertPreference, AlertLog, WebhookDeadLetter

**10 enums:** Platform, WorkspaceProductMode, WorkspaceInstallType, CatalogIdMode, EventName (5 events + Refund), EventStatus, ConsentMode, BillingPlan, SubscriptionStatus, Destination (META/TIKTOK/GA4/KLAVIYO/REDDIT/PINTEREST/GOOGLE_ADS)

**Workspace tracking fields:** product mode/install type, catalog ID mode/prefix/suffix/template, and optional custom ingest domain with verified/last-check/last-error metadata.

**Key indexes:** Workspace on `[userId]`, `[apiKey]`, unique `[customIngestDomain]`. EventLog on `[workspaceId, createdAt]`, `[workspaceId, eventName]`, `[workspaceId, destination]`, `[workspaceId, utmSource, utmCampaign]`, `[workspaceId, status, createdAt]`, `[workspaceId, eventName, destination, createdAt]`, `[eventId]`, `[status, createdAt]`. AlertLog on `[userId, alertType, sentAt]`. WebhookDeadLetter on `[shopDomain, topic, createdAt]`, `[resolvedAt, createdAt]`.

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
1. **Event Replay** - Retry failed events from events page (bulk or per-event, 5min cooldown). Replay is privacy-preserving after EventLog sanitization and does not reconstruct removed raw PII.
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
4. **Webhook Purchase Enrichment** - Shopify `orders/paid` webhook now extracts cart/order attributes such as `_fbp`, `_fbc`, `_fbclid`, `_gclid`, `_ttclid`, `_rdt_cid`, `_epik`, and `utm_*` before falling back to session enrichment or landing-site query params. Landing-site `fbclid` is synthesized into `fbc` only after stronger order/session/landing `fbc` values are absent. Relative `landing_site` values are normalized to absolute store URLs so webhook Purchase `event_source_url` stays Meta-compatible when session context is unavailable.
5. **Richer Purchase Payloads** - Webhook Purchases now include variant-first `content_ids`, `content_type: "product"`, and `contents` with quantity and item price where Shopify provides them.
6. **Session Enrichment Before Webhook Skip** - Snippet Purchase events for webhook-enabled workspaces now store browser context before returning `webhook_active`, so later Shopify webhooks can recover checkout attribution.
7. **Webhook Purchase Dedup Guard** - For workspaces with a Shopify webhook secret configured, generated `/api/pixel/:workspaceId` and legacy `/api/s/:workspaceId` scripts suppress browser `fbq("track", "Purchase")` while still sending TrackClear Purchase context to ingest.
8. **EventLog Payload Privacy** - Snippet-created EventLog rows now store sanitized `customData`, `userDataFlags`, and `clickIdFlags` instead of raw email, phone, name, address, or customer ID. Queue jobs still receive transient raw userData for Meta/TikTok delivery. Replay keeps sanitized custom data and attribution columns but does not reconstruct removed raw PII.
9. **Shopify Meta+TikTok V1 Product Mode** - Added nullable `Workspace.productMode` and `installType`, defaulted new workspaces to `SHOPIFY_META_TIKTOK_V1` + `SHOPIFY_CUSTOM_PIXEL`, treated null/existing workspaces as `LEGACY_ALL_DESTINATIONS` + `HEADLESS_CUSTOM`, and committed an idempotent Prisma migration for the schema change.
10. **Mode-Aware Destination Allowlist** - V1 workspaces are limited to Meta/TikTok in integrations UI, onboarding, ingest, Shopify webhooks, replay, dashboard analytics, and events. Legacy/custom workspaces keep all configured destination behavior including `onlyDestinations` and `excludeDestinations`.
11. **Product Mode Guardrails** - Public workspace PATCH requests reject `productMode` and `installType`, server-rendered UI resolves mode through the same helper as backend fan-out, and `LEGACY_WORKSPACE_IDS` remains available as an emergency bypass.
12. **Tracking Health Page** - Added `/tracking-health` for V1 readiness: recent snippet event activity, webhook active/Purchase received, Meta/TikTok connection, dedup status, attribution context, and recent errors. The snippet check is intentionally named as event activity, not a pixel-install heartbeat.
13. **V1 Product Copy** - Public landing/pricing/OpenGraph copy now describes Shopify purchase tracking for Meta + TikTok and no longer advertises hidden 7-platform, annual-pricing, or unproven delivery-rate claims for new users.
14. **Production Legacy Protection** - Production migration `20260521_add_workspace_product_mode` was applied, `LEGACY_WORKSPACE_IDS` was set in Vercel Production, and Mizoke workspace `cmo1hd1x600045r6d9elaw3tg` was explicitly marked `LEGACY_ALL_DESTINATIONS` + `HEADLESS_CUSTOM`; null existing workspaces still resolve to legacy/custom.
15. **Events Replay Count Filtering** - The Events page failed-count/replay note now uses the same workspace destination allowlist as the visible event table, so V1 workspaces do not surface hidden legacy destination failures.
16. **Regression Tests** - Added focused unit tests for header precedence, fbc synthesis, order/landing attribution extraction, line-item payload shape, ingest propagation, event-normalizer cookie bounds, generated pixel Purchase guards, EventLog payload sanitization, workspace-mode fallback, V1 allowlisting, Shopify webhook fan-out filtering, Events page failed-count filtering, public PATCH mode immutability, and legacy destination preservation.

### Phase 13: Maximum Tracking Quality Sprint 1 (2026-05-22)
1. **Deterministic Shopify Purchase IDs** - Generated pixel scripts, ingest, and Shopify webhooks now use `shopify-purchase:<workspaceId>:<order|checkout|cart>` where Shopify order, checkout, or cart identifiers are available. Order name is preferred when present so browser checkout events with only `order.name` converge with webhook payloads that also include numeric order IDs; GraphQL and numeric order IDs normalize to the same fallback segment.
2. **Normalized Catalog Content IDs** - Added shared content ID helpers and applied them to generated pixel payloads, ingest customData, and Shopify webhook line items. The default is Shopify variant numeric ID, with product numeric ID and SKU fallbacks; helper support exists for GraphQL ID, SKU, and custom template modes.
3. **Richer TikTok Payloads** - TikTok Events API payloads now hash `customerId` into `external_id` when available and prefer rich `contents` with quantity/item price over flat content IDs.
4. **Token-Safe EventLog Payloads** - Sanitized EventLog payloads now redact checkout and cart tokens from stored `customData`; queue jobs still receive transient event data for delivery.
5. **Regression Tests** - Added focused tests for deterministic Purchase IDs, content ID normalization, TikTok external_id/rich contents, generated pixel output, ingest normalization, and Shopify webhook event IDs.

### Phase 14: Maximum Tracking Quality Sprint 2 (2026-05-22)
1. **TrackClear Session ID** - Generated pixel scripts now create and persist `_trackclear_session_id` and include it on ingest payloads, giving webhook Purchases a stable non-PII browser-session join key.
2. **Cart Attribute Attribution Writer** - Generated public and legacy pixel scripts best-effort preserve `_trackclear_session_id`, Meta/TikTok/Google/Reddit/Pinterest click IDs, UTMs, landing page, and consent markers into Shopify cart attributes during add-to-cart and checkout-start. This is intentionally additive and preserves existing cart attributes where the Custom Pixel sandbox allows cart mutation.
3. **Multi-Key Session Enrichment** - Ingest now stores browser context under TrackClear session ID, checkout token, cart token, Shopify order ID/name, and email. The Shopify webhook lookup checks all available identifiers and merges fresh fields, reducing dependency on email-only enrichment.
4. **Webhook Attribution Source Visibility** - Shopify webhook EventLog payloads now record sanitized attribution source metadata (`cart_attributes`, `session_enrichment`, `landing_site`, or `none`), consent markers, and TrackClear session presence without storing raw shopper PII or raw tokens.
5. **Tracking Health Source Breakdown** - `/tracking-health` now reports recent webhook Purchase attribution source counts, making it easier to see whether Purchases are being enriched by cart/order attributes, Redis session enrichment, landing-site fallback, or no attribution source.
6. **Regression Tests** - Added `session-enrichment.test.ts` and expanded ingest, webhook attribution, webhook route, pixel route, and EventLog payload tests for session IDs, cart attributes, consent markers, attribution source metadata, and token redaction.

### Phase 15: Diagnostics Mode-Aware Field Visibility (2026-05-22)
1. **Diagnostics Destination Filtering** - `/api/diagnostics` now selects workspace product mode/install type and applies `getAllowedDestinationsForWorkspace()` to destination health, event coverage, matrix, data quality, failures, stuck events, and audit queries. Shopify V1 workspaces see Meta/TikTok diagnostics only; legacy workspaces retain all allowed destinations.
2. **Captured Field Counts** - `/diagnostics` event audit rows now count core fields plus optional click/UTM fields only when those optional values are actually captured and relevant to an allowed destination. This prevents clean V1 orders from showing misleading missing Reddit/Pinterest/Google or absent campaign-click fields.
3. **Event-Specific Audit Fields** - Order ID remains core for Purchase audits but is hidden for AddToCart/InitiateCheckout unless captured, so non-Purchase event completeness is not penalized by impossible order fields.
4. **Regression Tests** - Added `diagnostics-audit-fields.test.ts` and `diagnostics-route-mode.test.ts`.

### Phase 16: Tracking Quality Sprint 3 (2026-05-22)
1. **Catalog ID Settings** - Added `CatalogIdMode` and workspace catalog ID fields for variant numeric, product numeric, Shopify GraphQL IDs, SKU, prefix/suffix, and custom templates. Settings can update these fields while product mode/install type remain internal-only.
2. **Catalog-Aware Delivery Paths** - Generated `/api/pixel/:workspaceId`, legacy `/api/s/:workspaceId`, ingest normalization, and Shopify webhook Purchase contents all apply the same workspace catalog ID settings.
3. **Diagnostics Live Validation** - `/diagnostics` now includes safe non-Purchase AddToCart and InitiateCheckout validation buttons, backed by `POST /api/workspaces/:id/diagnostics/test-event`. Purchase diagnostics remain blocked to avoid fake order signals.
4. **Diagnostics Field Clarity** - Event audit rows label fields as Core or Optional and show optional click/UTM counts separately so 8/8 vs 14/14 is understandable.
5. **Consent Mapping Hardening** - Google Ads is explicitly treated as a marketing destination for STRICT/LAX consent filtering.
6. **Headless/Hydrogen Helper** - Added `headless-sdk.ts` and `docs/headless-shopify.md` for URL attribution capture, `_fbp`/`_fbc` cookie maintenance, Shopify cart attributes, and TrackClear ingest calls from custom storefronts.
7. **TypeScript Cleanup** - Removed the previous test-only top-level-await TypeScript failure in `meta-event-processor.test.ts`; `pnpm exec tsc --noEmit` now passes cleanly.
8. **Regression Tests** - Added `diagnostics-test-event-route.test.ts` and `headless-sdk.test.ts`, and expanded pixel, content-ID, webhook-attribution, ingest-attribution, consent, workspace route, and Meta worker tests.

### Phase 17: Custom Ingest Domain (2026-05-22)
1. **Workspace Custom Domain Fields** - Added nullable `customIngestDomain`, `customIngestDomainVerifiedAt`, `customIngestDomainLastCheckedAt`, and `customIngestDomainLastError` fields with a unique domain constraint.
2. **Verified Endpoint Resolution** - Generated snippets use `https://<custom-domain>/api/pixel/:workspaceId` only after verification; generated `/api/pixel` and legacy `/api/s` scripts use `https://<custom-domain>/api/events/ingest` only after verification. Unverified and unset workspaces continue using the existing TrackClear defaults.
3. **Domain Verification Route** - Added public `GET /api/custom-ingest-domain/check` and protected `POST /api/workspaces/:id/custom-ingest-domain/verify`; failures clear verification and store the latest error.
4. **Settings UI** - Added a Custom Ingest Domain card with DNS target guidance, status, active endpoint, last checked time, save, and verify controls.
5. **Docs and Tests** - Added `docs/custom-ingest-domain.md`, updated the deployment runbook for the new migration, and added tests for helper behavior, snippet host selection, pixel ingest URL selection, workspace PATCH validation, and verification route behavior.
6. **Production Migration** - Applied `20260522_add_custom_ingest_domain` to the production Railway Postgres database before deployment.
7. **Dirava Managed Setup Removed** - The unverified `t.dirava.com` setting was cleared from Dirava and the temporary Vercel `dirava.com` domain entry was removed. Dirava continues using the default TrackClear ingest URL.

### Phase 18: Purchase ID Convergence Hardening (2026-05-23)
1. **Order-Name-First Purchase Identity** - `purchase-event-id.ts`, generated `/api/pixel/:workspaceId`, and legacy `/api/s/:workspaceId` now prefer Shopify order name before numeric/GraphQL order ID when order name is available. This reduces browser/webhook Purchase ID divergence when Shopify exposes `order.name` in checkout events and both `id` plus `name` in webhooks.
2. **Order ID Normalization Confirmed** - GraphQL order IDs such as `gid://shopify/Order/987654321` and numeric webhook IDs normalize to the same deterministic segment.
3. **Checkout Token Fallback Documented** - Browser Purchases that only have checkout/cart token identity intentionally keep a checkout/cart-token-based event ID. They cannot deduplicate against a later order-name webhook ID unless Shopify exposes order identity in the browser event; webhook-enabled workspaces still suppress browser `fbq("track", "Purchase")` to avoid Meta browser/server mismatches.
4. **Regression Tests** - Expanded `purchase-event-id.test.ts` and `pixel-route.test.ts` to cover order-name convergence, GraphQL/numeric order convergence, checkout-token-only fallback behavior, and generated pixel priority.

### Phase 19: Catalog And Headless Hardening (2026-05-23)
1. **Direct Ingest Catalog Settings** - `normalizeCustomDataContentIds()` now uses rich item/root fields such as `variantId`, `productId`, GraphQL IDs, SKU, and country when applying workspace SKU/custom catalog modes to direct or headless ingest payloads.
2. **Webhook Catalog Regression Coverage** - Shopify webhook Purchase tests now assert workspace SKU and product-numeric catalog modes flow into EventLog payloads and queued destination jobs.
3. **Headless Session Helper** - `headless-sdk.ts` now exposes `ensureTrackClearSessionId()`, which reuses or creates `_trackclear_session_id`, persists it to localStorage and/or cookies when available, and remains safe when called without browser storage.
4. **Headless Docs Updated** - `docs/headless-shopify.md` now uses `ensureTrackClearSessionId()` for TrackClear ingest and Shopify cart attributes instead of assuming each storefront implements its own session ID storage.
5. **Branch Deployment Cleanup** - GitHub default branch is now `main`. Vercel production deployment exposes the `git-main` alias, Railway worker status is attached to `main` commits, and `master` was fast-forwarded to `main` before the default branch was changed.

### Phase 20: Dirava Controlled Order QA (2026-05-23)
1. **Controlled Real Order Evidence** - Added `docs/qa/dirava-order-5076.md` for Dirava order `#5076`, including the test URL, zero-value discount context, deterministic Purchase event ID, EventLog IDs, destination API response summaries, attribution source, content IDs, and limitations.
2. **Canonical Purchase Path Result** - The order proved webhook receipt/processing, deterministic event identity, Meta/TikTok fan-out, destination API acceptance, browser Purchase suppression, session enrichment, landing-site fallback, and default variant-ID Purchase contents for one controlled `0 EUR` order.
3. **Revenue Proof Still Required** - Because the order total was intentionally `0 EUR`, a paid non-zero order is still required before claiming revenue propagation is proven end to end.
4. **Cart Attribute Persistence Still Unproven** - `_trackclear_session_id` was absent from webhook/order attribution for this order. The current `/cart/update.js` writer remains best-effort until a test captures request firing, cart attribute presence before checkout, and final webhook/order attribute persistence.

## Not Yet Implemented

| Feature | Notes |
|---------|-------|
| Team access | Invite members to workspace |
| Batch ingestion | Multiple events per request |
| Paid Shopify revenue QA | A non-zero paid order is still required to prove Shopify total price, TrackClear EventLog value, Meta value, TikTok value, and currency all match |
| Real Shopify cart attribute QA | Controlled Dirava order `#5076` proved session enrichment but did not prove cart/order attribute persistence; `_trackclear_session_id` was absent from webhook/order attribution, so the Custom Pixel `/cart/update.js` writer remains best-effort |
| Custom ingest staging DNS QA | The implementation is in place, but a staging merchant-owned domain should still be verified end-to-end before promoting this as a recommended launch step |
| Webhook consent policy | Add an explicit workspace-level policy for webhook Purchase consent handling before stricter compliance rollouts |
| Tracking Health signal percentages | Add percentages for webhook Purchases with fbp/fbc/fbclid-derived fbc/ttclid/gbraid/wbraid/email/phone/content IDs/value+currency |
