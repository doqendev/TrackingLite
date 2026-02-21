import { DESTINATION_EVENT_MAP } from "@/lib/destinations";

const GA4_MP_URL = "https://www.google-analytics.com/mp/collect";

export interface GA4EventItem {
  item_id?: string;
  item_name?: string;
  quantity?: number;
  price?: number;
}

export interface GA4EventParams {
  currency?: string;
  value?: number;
  items?: GA4EventItem[];
  transaction_id?: string;
  page_location?: string;
  page_referrer?: string;
  engagement_time_msec?: string;
}

export interface GA4Event {
  name: string;
  params: GA4EventParams;
}

export class GA4ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public response: unknown
  ) {
    super(message);
    this.name = "GA4ApiError";
  }
}

export function normalizeToGA4Event(
  eventName: string,
  eventData: {
    eventId: string;
    timestamp: number;
    url: string;
    referrer: string;
    userData: Record<string, unknown>;
    customData: Record<string, unknown>;
    clientIp: string;
    userAgent: string;
  }
): GA4Event | null {
  const ga4EventName =
    DESTINATION_EVENT_MAP.GA4[
      eventName as keyof typeof DESTINATION_EVENT_MAP.GA4
    ];
  if (!ga4EventName) return null;

  const cd = eventData.customData;

  const params: GA4EventParams = {
    // GA4 requires engagement_time_msec for all events
    engagement_time_msec: "1",
  };

  // Page view params
  if (ga4EventName === "page_view") {
    if (eventData.url) params.page_location = eventData.url;
    if (eventData.referrer) params.page_referrer = eventData.referrer;
    return { name: ga4EventName, params };
  }

  // Common ecommerce params
  if (cd.value !== undefined && cd.value !== null) {
    params.value = Number(cd.value);
  }
  if (cd.currency) {
    params.currency = String(cd.currency);
  }

  // Purchase-specific
  if (ga4EventName === "purchase") {
    const orderId = cd.orderId ?? cd.order_id;
    if (orderId != null) params.transaction_id = String(orderId);
  }

  // Build items array for add_to_cart, view_item, begin_checkout, purchase
  const items: GA4EventItem[] = [];

  const contentIds = cd.contentIds ?? cd.content_ids;
  if (contentIds && Array.isArray(contentIds)) {
    // contentIds is a flat array of IDs
    (contentIds as string[]).forEach((id) => {
      items.push({ item_id: String(id) });
    });
  } else if (cd.contents && Array.isArray(cd.contents)) {
    // contents is an array of objects with id, quantity, item_price / itemPrice
    (cd.contents as Array<Record<string, unknown>>).forEach((item) => {
      const entry: GA4EventItem = {};
      if (item.id != null) entry.item_id = String(item.id);
      if (item.quantity != null) entry.quantity = Number(item.quantity);
      const price =
        item.itemPrice !== undefined
          ? item.itemPrice
          : item.item_price !== undefined
          ? item.item_price
          : undefined;
      if (price !== undefined) entry.price = Number(price);
      items.push(entry);
    });
  }

  if (items.length > 0) params.items = items;

  return { name: ga4EventName, params };
}

export async function sendToGA4(
  measurementId: string,
  apiSecret: string,
  clientId: string,
  events: GA4Event[]
): Promise<unknown> {
  const url = `${GA4_MP_URL}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;

  const body = {
    client_id: clientId,
    events,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  // GA4 Measurement Protocol returns 204 on success with no body.
  // It also returns 2xx even for validation errors, so check response.ok only.
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new GA4ApiError(
      text || "Unknown GA4 Measurement Protocol error",
      response.status,
      text
    );
  }

  // 204 has no body; attempt to parse only if there is content
  const contentLength = response.headers.get("content-length");
  if (response.status === 204 || contentLength === "0") {
    return { success: true };
  }

  return response.json().catch(() => ({ success: true }));
}
