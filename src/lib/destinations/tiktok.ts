import { hashPii, hashPhonePii } from "@/lib/hash-pii";
import { DESTINATION_EVENT_MAP } from "@/lib/destinations";

const TIKTOK_API_URL = "https://business-api.tiktok.com/open_api/v1.3/event/track/";

export interface TikTokEvent {
  event: string;
  event_id: string;
  event_time: number; // unix timestamp in seconds
  user: {
    email?: string; // SHA-256 hashed
    phone?: string; // SHA-256 hashed
    external_id?: string; // SHA-256 hashed
    ttclid?: string;
    ttp?: string;
    ip?: string;
    user_agent?: string;
  };
  properties?: {
    contents?: Array<{
      content_id?: string;
      content_type?: string;
      content_name?: string;
      quantity?: number;
      price?: number;
    }>;
    content_type?: string;
    currency?: string;
    value?: number;
    description?: string;
  };
  page?: {
    url?: string;
    referrer?: string;
  };
}

export class TikTokApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public response: unknown
  ) {
    super(message);
    this.name = "TikTokApiError";
  }
}

export function normalizeToTikTokEvent(
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
    ttclid?: string | null;
    ttp?: string | null;
    trackclearSessionId?: string | null;
  }
): TikTokEvent | null {
  const tiktokEventName =
    DESTINATION_EVENT_MAP.TIKTOK[
      eventName as keyof typeof DESTINATION_EVENT_MAP.TIKTOK
    ];
  if (!tiktokEventName) return null;

  const ud = eventData.userData;
  const cd = eventData.customData;

  // Build user object with SHA-256 hashed PII
  const user: TikTokEvent["user"] = {};
  if (ud.email && typeof ud.email === "string") {
    user.email = hashPii(ud.email);
  }
  if (ud.phone && typeof ud.phone === "string") {
    user.phone = hashPhonePii(ud.phone, ud.countryCode as string | undefined);
  }
  if (ud.customerId !== undefined && ud.customerId !== null) {
    const externalId = hashPii(String(ud.customerId));
    if (externalId) user.external_id = externalId;
  }
  if (!user.external_id && eventData.trackclearSessionId) {
    // TikTok accepts one external_id; the hashed first-party session ID
    // covers anonymous sessions when no customer identity exists yet.
    const sessionExternalId = hashPii(eventData.trackclearSessionId);
    if (sessionExternalId) user.external_id = sessionExternalId;
  }
  if (eventData.ttclid) {
    user.ttclid = eventData.ttclid;
  }
  if (eventData.ttp) {
    user.ttp = eventData.ttp;
  }
  if (eventData.clientIp) {
    user.ip = eventData.clientIp;
  }
  if (eventData.userAgent) {
    user.user_agent = eventData.userAgent;
  }

  // Build properties
  const properties: TikTokEvent["properties"] = {};
  if (cd.value !== undefined) properties.value = Number(cd.value);
  if (cd.currency) properties.currency = String(cd.currency);
  const contentType = cd.contentType ?? cd.content_type;
  if (contentType) properties.content_type = String(contentType);

  // Build contents array
  const contentIds = cd.contentIds ?? cd.content_ids;
  const richContents = Array.isArray(cd.contents)
    ? (cd.contents as Array<Record<string, unknown>>)
        .map((item, index) => {
          const fallbackId = Array.isArray(contentIds) ? contentIds[index] : undefined;
          return {
            content_id: String(item.id || item.content_id || fallbackId || ""),
            content_type: contentType ? String(contentType) : "product",
            quantity: item.quantity ? Number(item.quantity) : 1,
            price:
              item.itemPrice !== undefined
                ? Number(item.itemPrice)
                : item.item_price !== undefined
                ? Number(item.item_price)
                : undefined,
          };
        })
        .filter((item) => item.content_id)
    : [];
  if (richContents.length > 0) {
    properties.contents = richContents;
  } else if (contentIds && Array.isArray(contentIds)) {
    properties.contents = (contentIds as string[]).map((id) => ({
      content_id: String(id),
      content_type: contentType ? String(contentType) : "product",
    }));
  }

  return {
    event: tiktokEventName,
    event_id: eventData.eventId,
    event_time: Math.floor(eventData.timestamp / 1000),
    user,
    ...(Object.keys(properties).length > 0 && { properties }),
    page: {
      ...(eventData.url && { url: eventData.url }),
      ...(eventData.referrer && { referrer: eventData.referrer }),
    },
  };
}

export async function sendToTikTok(
  pixelId: string,
  accessToken: string,
  events: TikTokEvent[]
): Promise<unknown> {
  const body = {
    event_source: "web",
    event_source_id: pixelId,
    data: events,
  };

  const response = await fetch(TIKTOK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Access-Token": accessToken,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  const result = await response.json().catch(() => ({ code: -1, message: "Non-JSON response" }));

  if (!response.ok || result.code !== 0) {
    throw new TikTokApiError(
      result.message || "Unknown TikTok API error",
      response.status,
      result
    );
  }

  return result;
}
