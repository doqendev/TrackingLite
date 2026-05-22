# MEMORY.md

## 2026-05-22 - Custom Ingest Domain Sprint

- Added migration `20260522_add_custom_ingest_domain` with nullable workspace fields for `customIngestDomain`, verification timestamp, last checked timestamp, and last error. The domain is unique when present.
- Added `src/lib/custom-ingest-domain.ts` for hostname normalization/validation, default endpoint fallback, verification URL construction, and verified custom pixel/ingest URL resolution.
- Added public marker route `GET /api/custom-ingest-domain/check` and protected verification route `POST /api/workspaces/:id/custom-ingest-domain/verify`. Verification failure clears `customIngestDomainVerifiedAt` and stores a concise error.
- Updated workspace PATCH/GET to support merchant-editable custom ingest domains while keeping productMode/installType internal-only. Changing or clearing the domain clears prior verification.
- Updated generated snippets so verified custom domains become the pixel-loader host, and updated generated `/api/pixel/:workspaceId` plus legacy `/api/s/:workspaceId` so verified custom domains become the ingest endpoint. Unverified domains continue to use existing TrackClear defaults.
- Added a Settings card for Custom Ingest Domain with DNS target guidance, status, active endpoint, last checked time, save, and verify controls.
- Added `docs/custom-ingest-domain.md`, updated deployment docs for the new migration, and added `NEXT_PUBLIC_CUSTOM_INGEST_CNAME_TARGET` to `.env.example`.
- Added/expanded tests for custom domain helpers, verification route behavior, snippet host selection, generated pixel ingest URL selection, and workspace PATCH validation.
- Validation: focused custom-domain tests passed 20/20; `pnpm test -- --run` passed 417/417 unit tests; `pnpm prisma validate` passed when `DIRECT_DATABASE_URL` was supplied; `pnpm exec tsc --noEmit --pretty false` passed cleanly; `pnpm lint` passed with existing `<img>` warnings; `pnpm build` completed successfully with existing lint/static-generation warnings.
- Production migration applied after implementation: using `.vercel/.env.production.local`, `pnpm prisma migrate deploy` applied `20260522_add_custom_ingest_domain` to the Railway production Postgres database and `pnpm prisma migrate status` then reported the schema up to date.
- Dirava operational setup started on 2026-05-23: `t.dirava.com` was added to the TrackClear Vercel project and saved on Dirava workspace `cmlsa6h1w0001zm8nxuzn7a50` as unverified. Vercel requested DNS `A t.dirava.com 76.76.21.21`; live Dirava pixel still uses the default TrackClear ingest URL until verification succeeds.

## 2026-05-22 - Tracking Quality Sprint 3

- Added workspace-level catalog ID matching settings with migration `20260522_add_catalog_id_settings`: `catalogIdMode`, optional prefix/suffix, and optional custom template. Public PATCH can update catalog settings, but productMode/installType remain internal-only.
- Applied catalog ID settings across generated `/api/pixel/:workspaceId`, legacy `/api/s/:workspaceId`, ingest customData normalization, and Shopify webhook Purchase `content_ids`/`contents`. The browser scripts preserve SKU/GraphQL casing instead of lowercasing catalog IDs.
- Added a safe diagnostics live-validation route, `POST /api/workspaces/:id/diagnostics/test-event`, and `/diagnostics` buttons for AddToCart and InitiateCheckout. Purchase diagnostic events are intentionally rejected to avoid fake order signals.
- Updated Diagnostics event audit UI to label Core vs Optional fields and show optional click/UTM field counts separately, clarifying why one order can be 8/8 while another is 14/14.
- Hardened consent mapping by treating Google Ads as a marketing destination in `shouldSendToDestination()`.
- Added `src/lib/headless-sdk.ts` and `docs/headless-shopify.md` for Hydrogen/custom storefronts: URL click-ID capture, Meta `_fbp`/`_fbc` cookie maintenance, Shopify cart attribution attributes, and TrackClear ingest calls.
- Fixed the previous TypeScript-only top-level-await issue in `meta-event-processor.test.ts`; `pnpm exec tsc --noEmit` now passes cleanly.
- Added/expanded tests for diagnostics test events, headless helper behavior, catalog settings, generated pixels, ingest catalog affixes, webhook catalog IDs, consent mapping, and workspace route validation.
- Validation: targeted tracking-quality tests passed 65/65; `pnpm test -- --run` passed 404/404 unit tests; `pnpm exec tsc --noEmit` passed cleanly; `pnpm lint` passed with existing `<img>` warnings; `pnpm build` completed successfully with existing lint/static-generation warnings. Local `pnpm prisma migrate status` could not complete because `DIRECT_DATABASE_URL` is missing and Docker/Postgres on `127.0.0.1:5433` is not running in this environment.
- Production migration applied after implementation: using `.vercel/.env.production.local`, `pnpm prisma migrate deploy` applied `20260522_add_catalog_id_settings` to the Railway production Postgres database and `pnpm prisma migrate status` then reported the schema up to date.

## 2026-05-22 - Diagnostics Mode-Aware Field Visibility

- Updated `/api/diagnostics` to resolve workspace mode through `getAllowedDestinationsForWorkspace()` and filter destination health, event coverage, matrix, data quality, recent failures, stuck events, and event-audit queries to the workspace's allowed destinations.
- Updated `/diagnostics` so V1 workspaces display only allowed destinations and the event audit field count includes core fields plus optional click/UTM fields only when they were actually captured and are relevant to an allowed destination. This removes misleading missing-field counts for absent campaign click IDs and hidden legacy destinations.
- Added `src/lib/diagnostics-audit-fields.ts` to centralize field visibility rules. Purchase keeps order ID as a core field, while AddToCart and InitiateCheckout hide order ID unless it is actually captured.
- Added tests: `diagnostics-audit-fields.test.ts` and `diagnostics-route-mode.test.ts`.
- Historical validation for this sprint passed; current project-wide validation is recorded in the latest entry above.

## 2026-05-22 - Maximum Tracking Quality Sprint 2

- Implemented the second pass from the TrackClear Maximum Tracking Quality plan, scoped to session/cart attribution recovery, webhook enrichment quality, and Tracking Health visibility.
- Generated `/api/pixel/:workspaceId` and legacy `/api/s/:workspaceId` scripts now create a `_trackclear_session_id`, send it on ingest payloads, and best-effort write `_trackclear_session_id`, click IDs, UTMs, landing page, and consent markers into Shopify cart attributes on add-to-cart and checkout-start.
- Ingest now accepts `trackclearSessionId`, `checkoutToken`, and `cartToken`, and stores browser context under TrackClear session ID, checkout token, cart token, Shopify order ID/name, and email. Session enrichment lookup merges fresh fields across all available identifiers instead of depending only on email.
- Shopify webhook Purchase enrichment now looks up Redis session context with all available identifiers, records sanitized attribution source metadata (`cart_attributes`, `session_enrichment`, `landing_site`, or `none`), includes consent markers, and keeps webhook custom data unchanged for value, currency, num_items, order_id, content_type, content_ids, and contents.
- `/tracking-health` now includes a recent webhook Purchase attribution source breakdown so operators can see whether Purchases are being enriched by cart/order attributes, Redis session enrichment, landing-site fallback, or no attribution source.
- EventLog payload sanitization now redacts `trackclearSessionId` from stored customData alongside checkout/cart tokens.
- Added tests: `session-enrichment.test.ts`, plus expanded `ingest-attribution.test.ts`, `shopify-webhook-attribution.test.ts`, `shopify-webhook-route-mode.test.ts`, `pixel-route.test.ts`, and `event-log-payload.test.ts`.
- Historical validation for this sprint passed; current project-wide validation is recorded in the latest entry above.
- No database migration is required for this sprint.
- Operational note: the cart attribute writer is best-effort inside Shopify's Custom Pixel runtime and should be confirmed on a real Shopify checkout. It is additive and does not change Mizoke/headless legacy mode or destination allowlisting.

## 2026-05-22 - Maximum Tracking Quality Sprint 1

- Implemented the first pass from the TrackClear Maximum Tracking Quality plan, scoped to Purchase identity, catalog content IDs, and TikTok payload quality.
- Added deterministic Shopify Purchase event IDs through `purchase-event-id.ts`. Generated pixel scripts, ingest, and Shopify webhooks now prefer `shopify-purchase:<workspaceId>:<order|checkout|cart>` when Shopify identifiers are available, with safe fallback to the original event ID/random UUID.
- Added `content-id.ts` and applied normalized content IDs across generated pixel payloads, ingest customData, and Shopify webhook line items. Default output is Shopify variant numeric ID with product/SKU fallbacks; helper support exists for product numeric IDs, GraphQL IDs, SKU, and custom template modes.
- Improved TikTok Events API payloads by hashing `customerId` into `external_id` when available and preferring rich `contents` with quantity/item price over flat `content_ids`.
- Sanitized EventLog customData now redacts checkout/cart tokens, so deterministic ID inputs are not persisted as raw tokens after ingestion.
- Dirava production workspace `cmlsa6h1w0001zm8nxuzn7a50` was intentionally reclassified to `SHOPIFY_META_TIKTOK_V1` + `SHOPIFY_CUSTOM_PIXEL`; Mizoke/headless workspace `cmo1hd1x600045r6d9elaw3tg` remains protected as legacy/headless.
- Added tests: `purchase-event-id.test.ts`, `content-id.test.ts`, `tiktok.test.ts`, plus expanded `ingest-attribution.test.ts`, `pixel-route.test.ts`, and `shopify-webhook-route-mode.test.ts`.
- Historical validation for this sprint passed; current project-wide validation is recorded in the latest entry above.
- Remaining roadmap work from the plan after Sprint 3: Shopify Web Pixel app path, custom ingest domain, encrypted short-lived retry payloads, and deeper CMP-specific consent automation if required.

## 2026-05-21 - Mizoke/TrackClear Attribution Hardening

- Implemented TrackClear-side changes from the Mizoke tracking handoff while preserving the existing normal Shopify Custom Pixel contract used by Dirava.
- Ingest now accepts `fbclid`, `gbraid`, and `wbraid`; derives `fbc` as `fb.1.<timestamp_ms>.<fbclid>` when `fbc` is missing; and passes the resolved `fbc` into EventLog rows, Meta queue jobs, and Redis session enrichment.
- Ingest now prefers trusted server-proxy `X-TL-Client-IP` and `X-TL-Client-UA` headers before generic proxy headers. These headers remain out of the CORS allow-list so browser clients cannot send them directly without a deliberate review.
- Meta `_fbp` validation now accepts bounded `fb.1.<timestamp_ms>.<random>` values with 7-20 numeric random digits in the server normalizer and generated pixel scripts.
- Shopify `orders/paid` webhook now reads order/cart attributes (`_fbp`, `_fbc`, `_fbclid`, `_gclid`, `_ttclid`, `_rdt_cid`, `_epik`, `utm_*`) before falling back to session enrichment and landing-site params. Landing-site `fbclid` is synthesized into `fbc` only when order/session/landing `fbc` values are absent. Relative Shopify `landing_site` values are normalized to absolute store URLs before becoming webhook Purchase `event_source_url`; unsafe or unparsable landing values fall back to `https://{shopDomain}`.
- Webhook Purchase custom data now includes `content_type: "product"`, variant-first `content_ids`, and `contents` with quantity and item price when Shopify provides them.
- Snippet Purchase events for webhook-enabled workspaces now store session enrichment before returning `webhook_active`, so checkout context can still enrich the later webhook Purchase.
- Generated `/api/pixel/:workspaceId` and legacy `/api/s/:workspaceId` scripts suppress browser `fbq("track", "Purchase")` when a Shopify webhook secret is configured, while still sending TrackClear Purchase context to ingest.
- Snippet-created EventLog rows now store sanitized `customData`, `userDataFlags`, and `clickIdFlags` instead of raw shopper `userData`; queue jobs still receive transient raw userData for destination delivery.
- Added nullable `Workspace.productMode` and `Workspace.installType`. Runtime fallback treats null/existing workspaces as `LEGACY_ALL_DESTINATIONS` + `HEADLESS_CUSTOM`; new workspaces are created as `SHOPIFY_META_TIKTOK_V1` + `SHOPIFY_CUSTOM_PIXEL`.
- Added mode-aware destination allowlisting for V1 in integrations UI, onboarding, ingest, Shopify webhooks, replay, dashboard analytics, and event views. Legacy/custom workspaces keep all destination behavior, including `onlyDestinations` and `excludeDestinations`.
- Added `LEGACY_WORKSPACE_IDS` emergency bypass support in `workspace-mode.ts`; production must include current headless/custom workspace IDs in that env var before deploy.
- Added `/tracking-health` with operational V1 checks for recent snippet event activity, webhook active/Purchase received, Meta/TikTok connection, dedup status, attribution context, and recent errors. The snippet check is not a heartbeat.
- Updated landing/pricing/OpenGraph copy to describe Shopify purchase tracking for Meta + TikTok and removed the annual pricing toggle, hidden 7-platform claims, and unproven delivery-rate claims from the public V1 path.
- Production database migration `20260521_add_workspace_product_mode` was applied, and production Mizoke workspace `cmo1hd1x600045r6d9elaw3tg` was explicitly set to `LEGACY_ALL_DESTINATIONS` + `HEADLESS_CUSTOM`. Existing null-mode workspaces still resolve to legacy/custom behavior until explicitly migrated.
- Follow-up patch after super-dev review: added idempotent Prisma migration `20260521_add_workspace_product_mode`, removed productMode/installType from public PATCH mutation, made the integrations UI use backend mode resolvers, fixed dashboard TikTok setup detection to require credentials, documented privacy-preserving replay after EventLog sanitization, and added `LEGACY_WORKSPACE_IDS` to `.env.example`.
- Final rollout hardening added `docs/deploy.md`, internal script `scripts/set-workspace-mode.ts`, accurate privacy-cookie wording for `_fbp`/`_fbc`, and visible replay privacy wording in the Events UI.
- Follow-up rollout polish filters the Events page failed-count/replay visibility by the same workspace destination allowlist as the visible event list, preventing V1 workspaces from surfacing old hidden legacy destination failures.
- Added tests: `tracking-context.test.ts`, `shopify-webhook-attribution.test.ts`, `ingest-attribution.test.ts`, `pixel-route.test.ts`, `event-log-payload.test.ts`, `workspace-mode.test.ts`, `workspace-create-mode.test.ts`, `workspace-route-mode.test.ts`, `events-page-mode.test.ts`, `shopify-webhook-route-mode.test.ts`, plus expanded `event-normalizer.test.ts` coverage.
- Historical validation for this sprint passed; current project-wide validation is recorded in the latest entry above.
- Remaining assumption: Meta catalog canonical product ID format is still not confirmed. Webhook Purchases now prefer Shopify `variant_id`, then fall back to `product_id`, then `sku` to match the browser-event variant-ID direction without deleting fallbacks.
- Product-mode rollout note: normal Shopify V1 is now live for newly created workspaces. Existing/null-mode workspaces remain legacy/custom unless explicitly migrated.
