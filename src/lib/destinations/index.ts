// Destination-specific API clients and normalizers
// Each destination has its own module:
// - meta.ts (existing: src/lib/meta-capi.ts + src/lib/event-normalizer.ts)
// - google-ads.ts
// - tiktok.ts
// - ga4.ts
// - klaviyo.ts

export const DESTINATION_EVENT_MAP = {
  META: {
    PageView: null, // not tracked - high volume, low value
    ViewContent: null, // not tracked - high volume, low value
    AddToCart: "AddToCart",
    InitiateCheckout: "InitiateCheckout",
    Purchase: "Purchase",
  },
  GOOGLE_ADS: {
    PageView: null, // not tracked
    ViewContent: null, // not tracked
    AddToCart: "add_to_cart",
    InitiateCheckout: "begin_checkout",
    Purchase: "purchase",
  },
  TIKTOK: {
    PageView: null, // not tracked - high volume, low value
    ViewContent: null, // not tracked - high volume, low value
    AddToCart: "AddToCart",
    InitiateCheckout: "InitiateCheckout",
    Purchase: "CompletePayment",
  },
  GA4: {
    PageView: null, // not tracked - high volume, low value
    ViewContent: null, // not tracked - high volume, low value
    AddToCart: "add_to_cart",
    InitiateCheckout: "begin_checkout",
    Purchase: "purchase",
  },
  KLAVIYO: {
    PageView: null, // not tracked - high volume, low value
    ViewContent: null, // not tracked - high volume, low value
    AddToCart: "Added to Cart",
    InitiateCheckout: "Started Checkout",
    Purchase: "Placed Order",
  },
} as const;
