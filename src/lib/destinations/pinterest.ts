import { hashPii, hashPhonePii } from "@/lib/hash-pii";
import { DESTINATION_EVENT_MAP } from "@/lib/destinations";

const PINTEREST_API_BASE = "https://api.pinterest.com/v5/ad_accounts";

export interface PinterestEvent {
  event_name: string;
  action_source: "web";
  event_time: number; // unix timestamp in seconds
  event_id: string; // dedup ID
  event_source_url?: string;
  user_data: {
    em?: string[]; // SHA-256 hashed email array
    ph?: string[]; // SHA-256 hashed phone array
    client_ip_address?: string; // RAW IP (not hashed)
    client_user_agent?: string; // RAW UA (not hashed)
    click_id?: string; // epik click ID
    external_id?: string[]; // hashed external ID array
  };
  custom_data?: {
    currency?: string;
    value?: string; // STRING not number!
    content_ids?: string[];
    contents?: Array<{
      id?: string;
      item_price?: string;
      quantity?: number;
    }>;
    num_items?: number;
    order_id?: string;
  };
}

export class PinterestApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public response: unknown
  ) {
    super(message);
    this.name = "PinterestApiError";
  }
}

export function normalizeToPinterestEvent(
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
    epik?: string | null;
  }
): PinterestEvent | null {
  const pinterestEventName =
    DESTINATION_EVENT_MAP.PINTEREST[
      eventName as keyof typeof DESTINATION_EVENT_MAP.PINTEREST
    ];
  if (!pinterestEventName) return null;

  const ud = eventData.userData;
  const cd = eventData.customData;

  // Build user_data - note: em and ph are ARRAYS, IP and UA are RAW (not hashed)
  const userData: PinterestEvent["user_data"] = {};
  if (ud.email && typeof ud.email === "string") {
    const hashedEmail = hashPii(ud.email);
    if (hashedEmail) userData.em = [hashedEmail];
  }
  if (ud.phone && typeof ud.phone === "string") {
    const hashedPhone = hashPhonePii(ud.phone, ud.countryCode as string | undefined);
    if (hashedPhone) userData.ph = [hashedPhone];
  }
  if (eventData.clientIp) {
    userData.client_ip_address = eventData.clientIp; // RAW, not hashed
  }
  if (eventData.userAgent) {
    userData.client_user_agent = eventData.userAgent; // RAW, not hashed
  }
  if (eventData.epik) {
    userData.click_id = eventData.epik;
  }

  const event: PinterestEvent = {
    event_name: pinterestEventName,
    action_source: "web",
    event_time: Math.floor(eventData.timestamp / 1000),
    event_id: eventData.eventId,
    user_data: userData,
  };

  if (eventData.url) {
    event.event_source_url = eventData.url;
  }

  // Build custom_data
  const customData: NonNullable<PinterestEvent["custom_data"]> = {};
  if (cd.value !== undefined) customData.value = String(cd.value); // STRING!
  if (cd.currency) customData.currency = String(cd.currency);
  const numItems = cd.numItems ?? cd.num_items;
  if (numItems !== undefined) customData.num_items = Number(numItems);
  const orderId = cd.orderId ?? cd.order_id;
  if (orderId) customData.order_id = String(orderId);
  const contentIds = cd.contentIds ?? cd.content_ids;
  if (contentIds && Array.isArray(contentIds)) {
    customData.content_ids = (contentIds as string[]).map(String);
  }
  if (cd.contents && Array.isArray(cd.contents)) {
    customData.contents = (
      cd.contents as Array<Record<string, unknown>>
    ).map((item) => ({
      id: item.id ? String(item.id) : undefined,
      item_price:
        item.itemPrice !== undefined
          ? String(item.itemPrice)
          : item.item_price !== undefined
          ? String(item.item_price)
          : undefined,
      quantity: item.quantity ? Number(item.quantity) : undefined,
    }));
  }

  if (Object.keys(customData).length > 0) {
    event.custom_data = customData;
  }

  return event;
}

export async function sendToPinterest(
  adAccountId: string,
  conversionToken: string,
  events: PinterestEvent[]
): Promise<unknown> {
  const response = await fetch(
    `${PINTEREST_API_BASE}/${encodeURIComponent(adAccountId)}/events`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${conversionToken}`,
      },
      body: JSON.stringify({ data: events }),
      signal: AbortSignal.timeout(30000),
    }
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new PinterestApiError(
      (result as Record<string, unknown>)?.message
        ? String((result as Record<string, unknown>).message)
        : `HTTP ${response.status}`,
      response.status,
      result
    );
  }

  return result;
}
