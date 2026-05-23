# Dirava Delayed Checkout QA

Status: pending live QA.

Purpose: prove whether attribution survives when a shopper captures attribution,
waits, and checks out later.

## Required Setup

- Store: Dirava
- Workspace: `cmlsa6h1w0001zm8nxuzn7a50`
- Required stack: Custom Pixel, Shopify webhook, Cart Attribution Helper, Meta, TikTok
- Test URL:

```text
https://dirava.com/products/harry-potter-inspired-custom-logo-display-sign?fbclid=FB123&ttclid=TT123&gbraid=GB123&wbraid=WB123&utm_source=meta&utm_campaign=test&trackclear_debug=1
```

## Flow

1. Open the test URL and confirm the helper writes/verifies cart attribution.
2. Wait before checkout.
3. Record the actual delay.
4. Complete the purchase.
5. Inspect TrackClear EventLogs and sanitized webhook attribution fields.

## Evidence

- Commit:
- Production health:
- Test order:
- Value:
- Currency:
- Delay duration:

## Persistence

- Session ID reused:
- Cart attributes still present:
- Attributes present in webhook:
- Attribution source:
- `_fbp`:
- `_fbc`:
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
- Value/currency match:

## Result

- Pass/fail:
- Blocker:
- Next fix:

## Privacy

Do not paste raw email, phone, name, address, customer ID, or full webhook
payloads. Use flags and summaries only.
