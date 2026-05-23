# Shopify Cart Attribution Helper

TrackClear's Shopify Custom Pixel keeps sending browser events to TrackClear.
The cart attribution helper is an additional storefront-context script that
preserves attribution into Shopify cart attributes before checkout.

This helper is recommended for reliable purchase attribution because it runs in
the normal storefront/theme context, outside Shopify's Customer Events Custom
Pixel sandbox.

## Install

Keep the existing TrackClear Shopify Custom Pixel snippet installed.

Then add this helper script to the Shopify theme:

```html
<script async src="https://www.trackclear.io/api/cart-helper/WORKSPACE_ID"></script>
```

Install location options:

- `theme.liquid` before `</head>`
- Custom Liquid block or theme app block equivalent

Use the exact workspace-specific snippet shown in TrackClear Settings.

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

Until this is proven on a real order, cart attribution should be treated as
best-effort.
