# Shopify Cart Attribution Helper

TrackClear's Shopify Custom Pixel keeps sending browser events to TrackClear.
The cart attribution helper is the required storefront-context script for
reliable normal Shopify purchase attribution. It preserves attribution into
Shopify cart attributes before checkout.

This helper runs in the normal storefront/theme context, outside Shopify's
Customer Events Custom Pixel sandbox. The Custom Pixel alone is still useful for
browser events, but it is not the durable cart/order attribution layer.

## Normal Shopify V1 Install Standard

A normal Shopify V1 workspace is considered ready only when these pieces are
installed and verified:

- Shopify Customer Events / Custom Pixel snippet
- Shopify `orders/paid` webhook
- Cart Attribution Helper in the theme/storefront context
- Meta credentials
- TikTok credentials
- Test AddToCart event received
- Test webhook Purchase received

## Install

Install the latest workspace-specific TrackClear Shopify Custom Pixel snippet.
For the 2026-07 tracking-hardening rollout, existing stores must repaste it even
if a TrackClear snippet is already present. The pasted first line identifies
`bridge-v1`; this loader subscribes to Shopify events synchronously and buffers
early events while the remote tracker initializes. Updating `/api/pixel` alone
cannot add that bridge to an older pasted loader.

Then add this helper script to the Shopify theme:

```html
<script async src="https://www.trackclear.io/api/cart-helper/WORKSPACE_ID"></script>
```

Install location options:

- `theme.liquid` before `</head>`
- Custom Liquid block or theme app block equivalent

Use the exact workspace-specific snippet shown in TrackClear Settings or
Onboarding.

## What It Writes

The helper creates or reuses `_trackclear_session_id`, reads supported click
IDs/cookies/UTMs, and writes these Shopify cart attributes when available:

- `_trackclear_session_id`
- `_fbp`
- `_fbc`
- `_fbclid`
- `_gclid`
- `_gbraid`
- `_wbraid`
- `_ttclid`
- `_rdt_cid`
- `_epik`
- `_utm_source`
- `_utm_medium`
- `_utm_campaign`
- `_utm_content`
- `_utm_term`
- `_landing_page`
- `_tc_consent_analytics`
- `_tc_consent_marketing`
- `_tc_consent_timestamp`
- `_tc_consent_source`

It does not write raw email, phone, name, address, customer ID, or other raw
customer PII to cart attributes.

The generated Custom Pixel and legacy pixel also persist explicit consent
revocations under `_trackclear_pending_consent_v1` before sending them. A
failed revocation is retried after reload, on later events, and with bounded
in-page backoff. The bounded 30-day queue stores no shopper PII or advertising
identifiers and marks replay requests as no-destination, so replay updates
consent state without creating an ad or analytics event. Local and session
storage are parsed independently and merged, and each denial has an immutable
generation so an older replay cannot remove a newer same-identity denial. The
server clears attribution from every linked Redis identity and writes the
explicit false consent values in one atomic operation before acknowledging
the request.
Explicit false values remain authoritative for the full 30-day server context
window; short-lived grants still require a fresh Shopify consent snapshot.

## Browser Pixel Ownership

TrackClear's optional Meta browser mode is disabled by default; Meta CAPI
continues to work server-side without it. If TrackClear browser mode is enabled
for a workspace, TrackClear must be the only browser integration sending to
that Meta dataset. Disable the Shopify Facebook & Instagram app pixel, theme
pixel code, tag-manager Meta tag, or any other browser pixel that uses the same
dataset first. Running two browser owners against one dataset duplicates
browser events; sharing an event ID with TrackClear CAPI does not deduplicate
two independent browser sends. After disabling TrackClear or another owner,
wait at least 30 seconds for the shared script cache and start a fresh browser
session before enabling the replacement.

The same rule applies to TrackClear's optional TikTok browser mode. Before
enabling it, remove or disable every other TikTok Pixel installation that uses
the same Pixel ID (Shopify app, theme code, tag manager, or another custom
pixel). TikTok Events API remains available server-side while browser mode is
off. TrackClear browser events and Events API events share the same event ID;
that pairing cannot repair duplicates created by a second browser owner. Use
the same 30-second wait and fresh-session cutover rule.

## Timing

The helper writes early and repeatedly:

- page load
- product page load
- cart page load
- add-to-cart form submit/click
- detected cart mutations through `fetch` or `XMLHttpRequest`
- before checkout navigation
- pagehide fallback

It does not block checkout.

## Verification

The helper writes with:

```text
POST /cart/update.js
```

Then verifies with:

```text
GET /cart.js
```

If verification shows missing attributes, it retries once. Local diagnostic
values are stored without PII:

- `_tc_cart_attr_last_ok`
- `_tc_cart_attr_last_checked_at`
- `_tc_cart_attr_missing`

## Debug Mode

Enable browser console logging with either:

```text
?trackclear_debug=1
```

or:

```js
localStorage.setItem("trackclear_debug", "1")
```

Debug logs include helper load, session ID status, attribution fields found,
cart update attempts, verification status, and missing attributes.

## QA Pass Criteria

A real Shopify order should show:

- `_trackclear_session_id` present in webhook/order attribution
- click IDs present in webhook/order attribution
- UTMs present in webhook/order attribution
- webhook Purchase attribution source includes `cart_attributes`
- Meta and TikTok destination events are accepted

Dirava order `#5077` proved this path for one real paid normal-cart order:
cart attributes were verified before checkout, webhook Purchase attribution used
`cart_attributes`, and paid revenue matched Shopify, TrackClear, Meta, and
TikTok. Remaining QA still needs to cover buy-now/direct checkout, returning
visitor, delayed checkout, and non-default catalog modes before calling all
normal Shopify checkout paths fully proven.
