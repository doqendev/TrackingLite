# Dirava Buy-Now / Direct Checkout QA

Status: pending live QA.

Purpose: prove whether the normal Shopify V1 stack preserves attribution when a
shopper uses buy-now or direct checkout instead of the normal cart flow.

## Required Setup

- Store: Dirava
- Workspace: `cmlsa6h1w0001zm8nxuzn7a50`
- Required stack: Custom Pixel, Shopify webhook, Cart Attribution Helper, Meta, TikTok
- Test URL:

```text
https://dirava.com/products/harry-potter-inspired-custom-logo-display-sign?fbclid=FB123&ttclid=TT123&gbraid=GB123&wbraid=WB123&utm_source=meta&utm_campaign=test&trackclear_debug=1
```

## Flow

1. Open the test URL in the test browser.
2. Confirm the Cart Attribution Helper debug logs.
3. Use buy-now / direct checkout from the product page.
4. Complete the purchase.
5. Inspect TrackClear EventLogs and sanitized webhook attribution fields.

## Evidence

- Commit:
- Production health:
- Test order:
- Value:
- Currency:

## Cart Helper

- Loaded:
- `_trackclear_session_id` generated/reused:
- `/cart/update.js` fired:
- `/cart.js` verified:
- Attributes written before checkout:
- Attributes present in webhook:
- Attribution source:

## Signals

- `_fbp`:
- `_fbc`:
- `fbclid`:
- `ttclid`:
- `gbraid`:
- `wbraid`:
- `utm_source`:
- `utm_campaign`:

## Destination Delivery

- Meta EventLog:
- Meta API response:
- Meta Events Manager visible:
- TikTok EventLog:
- TikTok API response:
- TikTok Events Manager visible:

## Result

- Pass/fail:
- Blocker:
- Next fix:

## Privacy

Do not paste raw email, phone, name, address, customer ID, or full webhook
payloads. Use flags and summaries only.
