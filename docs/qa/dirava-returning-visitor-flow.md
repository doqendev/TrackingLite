# Dirava Returning Visitor QA

Status: pending live QA.

Purpose: prove whether attribution persists when the same shopper returns in the
same browser/session without fresh click parameters in the URL.

## Required Setup

- Store: Dirava
- Workspace: `cmlsa6h1w0001zm8nxuzn7a50`
- Required stack: Custom Pixel, Shopify webhook, Cart Attribution Helper, Meta, TikTok
- Browser/session: same browser used for a prior attributed visit or controlled test
- Test URL without fresh click params:

```text
https://dirava.com/products/harry-potter-inspired-custom-logo-display-sign?trackclear_debug=1
```

## Flow

1. Reuse the same browser/session after a prior attributed landing.
2. Open the test URL without `fbclid`, `ttclid`, `gbraid`, `wbraid`, or UTMs.
3. Confirm whether stored attribution is reused by the helper.
4. Add to cart or proceed through the normal cart flow.
5. Complete the purchase.
6. Inspect TrackClear EventLogs and sanitized webhook attribution fields.

## Evidence

- Commit:
- Production health:
- Test order:
- Value:
- Currency:

## Persistence

- Session ID reused:
- Stored `_fbp` reused:
- Stored `_fbc` reused:
- Stored `ttclid` reused:
- Stored UTMs reused:
- Cart attributes written:
- Attributes present in webhook:
- Attribution source:

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
