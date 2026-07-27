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
- persists explicit consent revocations before transport and replays a
  privacy-minimized, no-destination request after transient ingest failures

## Browser setup

```ts
import {
  buildTrackClearCartAttributes,
  captureTikTokAttributionCookie,
  captureUrlAttribution,
  createTrackClearClient,
  ensureMetaAttributionCookies,
  ensureTrackClearSessionId,
  toShopifyCartAttributes,
} from "@/lib/headless-sdk";

const consent = {
  analyticsAllowed: true,
  marketingAllowed: true,
};
const consentMode = "STRICT" as const;
const trackclearSessionId = await ensureTrackClearSessionId();
const landingAttribution = captureUrlAttribution(window.location.href);
const metaAttribution = await ensureMetaAttributionCookies({
  attribution: landingAttribution,
  consent,
  consentMode,
});
const attribution = await captureTikTokAttributionCookie({
  attribution: metaAttribution,
  consent,
  consentMode,
});

const trackclear = createTrackClearClient({
  apiKey: "tl_...",
  ingestUrl: "https://www.trackclear.io/api/events/ingest",
  defaultAttribution: attribution,
  defaultConsent: consent,
  consentMode,
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
  consent,
  consentMode,
});

const shopifyAttributes = toShopifyCartAttributes(attributes);
```

Use `shopifyAttributes` with your Storefront API `cartAttributesUpdate` or cart
create/update mutation.

Use the same `consentMode` in cookie capture, cart attributes, and the TrackClear
client. `STRICT` requires an explicit category grant; `LAX` permits a category
until it is explicitly denied. On a consent change, recapture attribution,
rewrite the cart attributes, and pass the current consent in each subsequent
event input. A denied event is then sent without ad identifiers or shopper
identity instead of reusing older defaults.

The client accepts both the canonical `analyticsAllowed` / `marketingAllowed`
keys and the shorter `analytics` / `marketing` aliases. An event-level decision
always overrides the corresponding default regardless of which spelling each
source used. Outbound ingest payloads contain only the canonical keys.

In a browser, `createTrackClearClient` generates and reuses a fallback
`_trackclear_session_id` when neither the event nor `getSessionId` supplies one.
This gives consent deletion an opaque anchor without making session setup a
hard integration prerequisite. The client uses local storage key
`_trackclear_pending_consent_v1` for at most 20 pending revocations. The stored
request contains only the TrackClear session/order/cart aliases and consent
decision, never shopper PII or advertising identifiers. It expires after 30
days, retries with bounded backoff during initialization and later events, and
is removed only after a 2xx ingest response for that exact queue generation.
An older in-flight replay therefore cannot settle a newer denial that reused
the same event ID and timestamp. Headless applications may also
call `await trackclear.flushPendingConsentRevocations()` after connectivity is
restored. The server requires a session, checkout, or cart anchor, ignores
predictable order aliases as direct fast-path deletion keys, and applies a
separate revocation budget so normal tracking saturation cannot block deletion.
Server-side callers without browser storage still receive the failed ingest
promise and must retry it.

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
