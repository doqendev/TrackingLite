# MEMORY.md

## 2026-05-21 - Mizoke/TrackClear Attribution Hardening

- Implemented TrackClear-side changes from the Mizoke tracking handoff while preserving the existing normal Shopify Custom Pixel contract used by Dirava.
- Ingest now accepts `fbclid`, `gbraid`, and `wbraid`; derives `fbc` as `fb.1.<timestamp_ms>.<fbclid>` when `fbc` is missing; and passes the resolved `fbc` into EventLog rows, Meta queue jobs, and Redis session enrichment.
- Ingest now prefers trusted server-proxy `X-TL-Client-IP` and `X-TL-Client-UA` headers before generic proxy headers. These headers remain out of the CORS allow-list so browser clients cannot send them directly without a deliberate review.
- Meta `_fbp` validation now accepts bounded `fb.1.<timestamp_ms>.<random>` values with 7-20 numeric random digits in the server normalizer and generated pixel scripts.
- Shopify `orders/paid` webhook now reads order/cart attributes (`_fbp`, `_fbc`, `_fbclid`, `_gclid`, `_ttclid`, `_rdt_cid`, `_epik`, `utm_*`) before falling back to session enrichment and landing-site params. Landing-site `fbclid` is synthesized into `fbc` only when order/session/landing `fbc` values are absent.
- Webhook Purchase custom data now includes `content_type: "product"`, variant-first `content_ids`, and `contents` with quantity and item price when Shopify provides them.
- Snippet Purchase events for webhook-enabled workspaces now store session enrichment before returning `webhook_active`, so checkout context can still enrich the later webhook Purchase.
- Generated `/api/pixel/:workspaceId` and legacy `/api/s/:workspaceId` scripts suppress browser `fbq("track", "Purchase")` when a Shopify webhook secret is configured, while still sending TrackClear Purchase context to ingest.
- Added tests: `tracking-context.test.ts`, `shopify-webhook-attribution.test.ts`, `ingest-attribution.test.ts`, `pixel-route.test.ts`, plus expanded `event-normalizer.test.ts` coverage.
- Validation: targeted tracking tests passed 71/71; `pnpm test -- --run` passed 353/353 unit tests; `pnpm lint` passed with existing `<img>` warnings; `pnpm build` completed successfully.
- Remaining assumption: Meta catalog canonical product ID format is still not confirmed. Webhook Purchases now prefer Shopify `variant_id`, then fall back to `product_id`, then `sku` to match the browser-event variant-ID direction without deleting fallbacks.
