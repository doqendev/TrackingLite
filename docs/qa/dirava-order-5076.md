# Dirava QA - Controlled Order #5076

Date: 2026-05-23
Live commit during test: `638707af6a576dd75b5de80dbca137f57213f799`
Branch: `main`
Workspace: `cmlsa6h1w0001zm8nxuzn7a50`
Store: `dirava.com` / `pyddfx-c5.myshopify.com`
Workspace mode: `SHOPIFY_META_TIKTOK_V1` + `SHOPIFY_CUSTOM_PIXEL`
Catalog mode: `VARIANT_NUMERIC_ID`

## Test Context

Controlled landing URL:

```text
https://dirava.com/products/harry-potter-inspired-custom-logo-display-sign?fbclid=FB123&ttclid=TT123&gbraid=GB123&wbraid=WB123&utm_source=meta&utm_campaign=test
```

The shopper added these products before checkout:

- `harry-potter-inspired-custom-logo-display-sign`
- `cartoon-movie-custom-keychain-copy`
- `grunge-band-custom-keychain`

The final order was intentionally zero-value because two discount codes were applied.

## AddToCart Pre-Check

- Created at: `2026-05-23T11:46:25.251Z`
- Event ID: `225553a6-8c1d-45b9-a289-00ebef8d9304`
- Source: `snippet`
- Destinations: Meta `SENT`, TikTok `SENT`
- Controlled URL values recovered: `fbclid=FB123`, `ttclid=TT123`, `gbraid=GB123`, `wbraid=WB123`, `utm_source=meta`, `utm_campaign=test`
- Product slug matched: `harry-potter-inspired-custom-logo-display-sign`
- Event value: `24.99`
- Currency: `EUR`
- Content IDs: `["52800068583688"]`
- Browser context present: `_fbp`, `_fbc`, `ttclid`, customer IP, user agent

This proves the browser snippet path captured the controlled click IDs and stored session context before checkout.

## Purchase Result

- Shopify order number: `#5076`
- Shopify order ID: `8633822576904`
- Purchase Event ID: `shopify-purchase:cmlsa6h1w0001zm8nxuzn7a50:5076`
- Event source: `webhook`
- Purchase EventLogs created: yes
- Duplicate protection result: one Meta EventLog and one TikTok EventLog for the deterministic Purchase event ID
- Browser Meta Purchase suppression: active for webhook-enabled workspace

### Destination EventLogs

| Destination | EventLog ID | Status | API response summary |
|-------------|-------------|--------|----------------------|
| Meta | `cmpiacdmj00096z61ghhwddqa` | `SENT` | `events_received: 1`, `messages: []`, `fbtrace_id: A6nWk9hz6iR_U_VjMpuOLwC` |
| TikTok | `cmpiacdml000b6z61jfk1fvbx` | `SENT` | `code: 0`, `message: OK`, `request_id: 20260523114853EB8E8844EFEBE26F7CF2` |

Platform UI visibility in Meta Events Manager and TikTok Events Manager was not checked during this repo-side QA pass.

### Purchase Payload Fields

- TrackClear EventLog value: `0`
- Payload value: `0`
- Currency: `EUR`
- Number of items: `3`
- Payload order ID: `#5076`
- Content type: `product`
- Final content IDs:

```json
["52781583008008", "51332313973000", "52800068583688"]
```

- Final contents:

```json
[
  { "id": "52781583008008", "quantity": 1, "item_price": 14.99 },
  { "id": "51332313973000", "quantity": 1, "item_price": 14.99 },
  { "id": "52800068583688", "quantity": 1, "item_price": 24.99 }
]
```

The zero value is expected for this test because the final Shopify order total was discounted to `0 EUR`. This order proves event flow, attribution, content IDs, webhook processing, deterministic event ID, and destination API acceptance. It does not prove non-zero revenue propagation.

## Attribution Result

- Attribution source: `session_enrichment`
- Attribution sources: `session_enrichment`, `landing_site`
- `_fbp`: present
- `_fbc`: present
- `fbclid`: recovered through `_fbc`
- `ttclid`: `TT123`
- `utm_source`: `meta`
- `utm_campaign`: `test`
- `gbraid`: recovered through session enrichment
- `wbraid`: recovered through session enrichment
- Client IP: present
- User agent: present
- Webhook user data: present as flags only; raw PII was not printed or stored in this QA artifact
- Consent: recovered from session enrichment as analytics `true`, marketing `true`

## Cart Attribute Result

- Cart/order attribute source: not proven
- `_trackclear_session_id` present in webhook/order attribution: `false`
- Attribution came from Redis session enrichment and Shopify landing-site fallback, not from persisted Shopify cart/order attributes.

Because browser network capture was not available for this completed order, this QA pass cannot prove whether `/cart/update.js` fired, was blocked, was hidden by `mode: "no-cors"`, was accepted but not persisted, was overwritten during checkout, or raced with checkout start.

The durable-attribution status after this order is:

- Session enrichment: proven on controlled order `#5076`
- Landing-site fallback: proven on controlled order `#5076`
- Cart/order attribute persistence: not proven

## Limitations And Required Follow-Up

1. Run a paid non-zero Dirava order to prove revenue propagation:
   - Shopify `total_price`
   - TrackClear EventLog `value`
   - Meta `custom_data.value`
   - TikTok `properties.value`
   - Currency match

2. Capture cart attribution behavior during the next test:
   - Whether `/cart/update.js` request fired
   - Request timing relative to checkout start
   - Whether the request was blocked
   - Whether attributes existed on cart before checkout
   - Whether attributes appeared in Shopify webhook `note_attributes` or cart attributes
   - Whether `_trackclear_session_id` appeared anywhere in Shopify order data

3. Treat the generated pixel cart writer as best-effort until proven in a real Shopify order. Based on this order, the recommended next reliable path is a theme/app-embed cart helper that runs outside the Shopify Custom Pixel sandbox, with Shopify app/web pixel extension work as the longer-term platform path.

4. Run additional flow QA:
   - Normal cart flow
   - Buy-now/direct checkout flow
   - Returning visitor with no fresh click params
   - Delayed checkout

5. Run catalog mode live QA beyond the default variant-ID mode:
   - `VARIANT_NUMERIC_ID`
   - `PRODUCT_NUMERIC_ID`
   - `SKU`
   - `CUSTOM`

