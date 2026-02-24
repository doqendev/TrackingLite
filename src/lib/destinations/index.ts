// Destination-specific API clients and normalizers
// Each destination has its own module:
// - meta.ts (existing: src/lib/meta-capi.ts + src/lib/event-normalizer.ts)
// - tiktok.ts
// - ga4.ts
// - klaviyo.ts
// - reddit.ts
// - pinterest.ts

export const DESTINATION_EVENT_MAP = {
  META: {
    PageView: "PageView",
    ViewContent: "ViewContent",
    AddToCart: "AddToCart",
    InitiateCheckout: "InitiateCheckout",
    Purchase: "Purchase",
    Refund: null, // Meta CAPI has no standard refund event
  },
  TIKTOK: {
    PageView: "Pageview",
    ViewContent: "ViewContent",
    AddToCart: "AddToCart",
    InitiateCheckout: "InitiateCheckout",
    Purchase: "CompletePayment",
    Refund: null,
  },
  GA4: {
    PageView: "page_view",
    ViewContent: "view_item",
    AddToCart: "add_to_cart",
    InitiateCheckout: "begin_checkout",
    Purchase: "purchase",
    Refund: "refund",
  },
  KLAVIYO: {
    PageView: null, // skip - too noisy for email platform
    ViewContent: "Viewed Product",
    AddToCart: "Added to Cart",
    InitiateCheckout: "Started Checkout",
    Purchase: "Placed Order",
    Refund: null,
  },
  REDDIT: {
    PageView: "PageVisit",
    ViewContent: "ViewContent",
    AddToCart: "AddToCart",
    InitiateCheckout: null,
    Purchase: "Purchase",
    Refund: null,
  },
  PINTEREST: {
    PageView: "page_visit",
    ViewContent: "view_content",
    AddToCart: "add_to_cart",
    InitiateCheckout: "initiate_checkout",
    Purchase: "checkout",
    Refund: null,
  },
} as const;
