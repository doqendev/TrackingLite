# Headless Shopify Tracking Helper

TrackClear's generated Shopify Custom Pixel covers normal Shopify storefronts.
For Hydrogen or custom/headless Shopify storefronts, use
`src/lib/headless-sdk.ts` as the reference helper.

The helper keeps the headless implementation aligned with the TrackClear ingest
schema:

- captures click IDs and UTMs from the landing URL
- validates or creates Meta `_fbp`
- synthesizes `_fbc` as `fb.1.<timestamp_ms>.<fbclid>`
- creates and persists `_trackclear_session_id`
- builds Shopify cart attributes for webhook Purchase attribution recovery
- sends PageView, ViewContent, AddToCart, InitiateCheckout, and Purchase events
  to `/api/events/ingest`

## Browser setup

```ts
import {
  buildTrackClearCartAttributes,
  captureUrlAttribution,
  createTrackClearClient,
  ensureMetaAttributionCookies,
  ensureTrackClearSessionId,
  toShopifyCartAttributes,
} from "@/lib/headless-sdk";

const trackclearSessionId = ensureTrackClearSessionId();
const landingAttribution = captureUrlAttribution(window.location.href);
const attribution = await ensureMetaAttributionCookies({
  attribution: landingAttribution,
});

const trackclear = createTrackClearClient({
  apiKey: "tl_...",
  ingestUrl: "https://api.trackclear.io/api/events/ingest",
  defaultAttribution: attribution,
  defaultConsent: {
    analyticsAllowed: true,
    marketingAllowed: true,
  },
  getSessionId: () => trackclearSessionId,
});
```

## Cart attributes

When creating or updating a Shopify cart through the Storefront API, attach the
returned attributes to the cart. This gives the later Shopify webhook Purchase a
durable fallback even when Redis session enrichment is missing.

```ts
const attributes = buildTrackClearCartAttributes({
  attribution,
  trackclearSessionId,
  landingPage: window.location.href,
  consent: {
    analyticsAllowed: true,
    marketingAllowed: true,
  },
});

const shopifyAttributes = toShopifyCartAttributes(attributes);
```

Use `shopifyAttributes` with your Storefront API `cartAttributesUpdate` or cart
create/update mutation.

## Event example

```ts
await trackclear.addToCart({
  eventId: crypto.randomUUID(),
  url: window.location.href,
  cartToken: cart.id,
  customData: {
    value: 24.99,
    currency: "EUR",
    contentIds: ["1234567890"],
    contentType: "product",
    numItems: 1,
  },
});
```

Do not send fake Purchase events from diagnostics or local validation. Purchase
quality should be verified through real Shopify webhook orders or controlled
staging orders.
