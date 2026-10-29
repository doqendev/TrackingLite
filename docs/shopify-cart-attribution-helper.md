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
- `_tc_google_click_at`
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

A new click ID or UTM in the page URL starts a new touch and replaces the
last-touch fields, except the Google click: `_gclid`, `_gbraid` and `_wbraid`
stay until a newer Google click replaces them, for 90 days from
`_tc_google_click_at`, as Google's own conversion linker keeps them. A marketing
or sale-of-data denial clears them like every other advertising identifier.
The generated Custom Pixel and legacy script follow the same rule, and only
click IDs in the page URL start a new touch there too.

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

## Consent

The helper reads consent from Shopify's Customer Privacy API. Shopify does not
load that API on every storefront page (on Mizoke and Dirava it was absent when
the helper ran), so the helper loads it itself with
`Shopify.loadFeatures([{ name: "consent-tracking-api", version: "0.2" }])` and
also listens for `visitorConsentCollected`, whose decision wins while the API
still answers nothing. The first cart write waits for one of them, at most 3
seconds (`CART_HELPER_CONSENT_WAIT_MS`).

- Shopify reports marketing allowed (a US visitor, or an EU visitor who
  accepted): click IDs and `_fbp`/`_fbc`/`_ttp` are written.
- Shopify reports marketing not allowed, or a sale/sharing opt-out (an EU
  visitor who has not answered yet, or declined): advertising identifiers are
  cleared from the cart, from the `_fbp`/`_fbc`/`_ttp`/`_epik` cookies and from
  the ChatGPT click context, in both modes.
- No answer within the wait: LAX keeps its allow-by-default. STRICT neither
  writes nor clears advertising identifiers or the ChatGPT click context, so
  values written earlier under real consent survive.

## Timing

The helper compares the attributes it wants with the last set it verified for
the same cart (`_tc_cart_attr_written` in localStorage, a digest only, never
the values) and writes only when they differ, when the cart token changed, or
when that verification is older than 30 minutes (`CART_HELPER_WRITE_REUSE_MS`).
`_tc_consent_timestamp` is left out of the comparison and restamped on every
real write, so the webhook's 24-hour consent-grant freshness still holds.
Checks run on:

- page load, once the consent answer is known
- `pageshow`, `pagehide`, add-to-cart clicks/submits and checkout navigation
- consent changes (`visitorConsentCollected`)
- cart changes through `fetch` or `XMLHttpRequest`. Another script's
  `/cart/update` call that only sets its own attributes or the note is ignored;
  any other cart change drops the digest and re-verifies.

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
