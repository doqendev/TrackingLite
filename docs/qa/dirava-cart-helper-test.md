# Dirava QA - Cart Attribution Helper Order #5077

Date: 2026-05-23
Commit: `9930a43bc3c87f215dd78a52121ce27d4cfbccc6`
Branch: `main`
Production health: `ok`; database `connected`; Redis `connected`; platform `vercel`; health commit `9930a43`
Store: `dirava.com` / `pyddfx-c5.myshopify.com`
Workspace: `cmlsa6h1w0001zm8nxuzn7a50`
Workspace mode: `SHOPIFY_META_TIKTOK_V1` + `SHOPIFY_CUSTOM_PIXEL`
Catalog mode: `VARIANT_NUMERIC_ID`

## Test URL

```text
https://dirava.com/products/harry-potter-inspired-custom-logo-display-sign?fbclid=FB123&ttclid=TT123&gbraid=GB123&wbraid=WB123&utm_source=meta&utm_campaign=test&trackclear_debug=1
```

## Browser/Network Evidence

User-provided console output confirmed:

- Cart helper loaded: yes
- `_trackclear_session_id` generated/reused: reused, `7cdc8bfa-d0bc-4140-a8da-a4a0fbc08ea7`
- Attribution fields found before checkout: yes
- `/cart/update.js` fired: yes
- `/cart.js` verification fired: yes
- Cart attributes verified before checkout: yes
- Consent fields added on the second write: yes
- Missing attributes: none reported

The browser also showed a `401` for Shopify `sf_private_access_tokens`. That request is unrelated to TrackClear helper behavior and did not prevent cart helper verification.

## Order Result

- Shopify order number: `#5077`
- Shopify order ID: `8634331398408`
- Paid or zero-value: paid
- Shopify total paid amount: `0.5`
- Shopify currency: `EUR`
- Purchase Event ID: `shopify-purchase:cmlsa6h1w0001zm8nxuzn7a50:5077`
- Source: `webhook`
- Browser Meta Purchase suppression: active for webhook-enabled workspace

## Revenue Match

| Field | Value |
|-------|-------|
| Shopify total_price | `0.5` |
| TrackClear EventLog value | `0.5` |
| Meta payload value | `0.5` |
| TikTok payload value | `0.5` |
| Currency | `EUR` |
| Match confirmed | yes |

The Meta and TikTok payload values come from the stored Purchase `customData.value`, which is the payload source used by the destination workers.

## Destination Proof

| Destination | EventLog ID | Status | API response summary |
|-------------|-------------|--------|----------------------|
| Meta | `cmpifn2no0005ryfa81kml5jx` | `SENT` | `events_received: 1`, `messages: []`, `fbtrace_id: ADynXtOrWTVEdseC-F70Y41` |
| TikTok | `cmpifn2nr0007ryfalei6rgoy` | `SENT` | `code: 0`, `message: OK`, `request_id: 20260523141710B054A9F8754320B47F17` |

Platform UI visibility in Meta Events Manager and TikTok Events Manager was not checked during this repo-side QA pass.

## Webhook Attribution Result

- Attribution source: `cart_attributes`
- Attribution sources: `cart_attributes`, `session_enrichment`, `landing_site`
- `_trackclear_session_id` present in webhook/order attribution: yes
- `_fbp` present: yes
- `_fbc` present: yes
- `fbclid` recovered through `_fbc`: yes
- `ttclid` present: yes, `TT123`
- `gbraid/wbraid` present in enrichment context: yes
- `utm_source` present: yes, `meta`
- `utm_campaign` present: yes, `test`
- Client IP present: yes
- User agent present: yes
- Consent source: `shopify_customer_privacy`
- Consent analytics: `true`
- Consent marketing: `true`
- Raw customer PII printed or stored in this QA artifact: no

## Content IDs

- Final content IDs:

```json
["52800068583688"]
```

- Final contents:

```json
[
  { "id": "52800068583688", "quantity": 2, "item_price": 24.99 }
]
```

## Pass Criteria

| Criterion | Result |
|-----------|--------|
| Helper loads in storefront context | pass |
| `/cart/update.js` fires | pass |
| `/cart.js` verification fires | pass |
| Attributes verified before checkout | pass |
| `_trackclear_session_id` reaches webhook/order attribution | pass |
| Click IDs reach webhook/order attribution | pass |
| UTMs reach webhook/order attribution | pass |
| Webhook attribution source includes `cart_attributes` | pass |
| Meta API accepts event | pass |
| TikTok API accepts event | pass |
| Paid revenue value matches | pass |

## Limitations

- Meta Events Manager and TikTok Events Manager UI visibility were not checked.
- This proves the normal cart flow for one paid Dirava order. Buy-now/direct checkout, returning visitor without fresh click parameters, delayed checkout, and live catalog-mode variants still need separate QA.
- The order used default `VARIANT_NUMERIC_ID` catalog mode only.

## Next Action

Run remaining flow QA:

1. Buy-now/direct checkout flow.
2. Returning visitor with no fresh click params.
3. Delayed checkout.
4. Catalog mode live QA for `PRODUCT_NUMERIC_ID`, `SKU`, and `CUSTOM`.

