import { hashPii, hashPhonePii } from "@/lib/hash-pii";
import { DESTINATION_EVENT_MAP } from "@/lib/destinations";

const REDDIT_API_BASE = "https://ads-api.reddit.com/api/v2.0/conversions/events";

export interface RedditEvent {
  event_at: string; // ISO 8601 timestamp
  event_type: {
    tracking_type: string;
  };
  click_id?: string; // rdt_cid
  user: {
    email?: string; // SHA-256 hashed
    phone_number?: string; // SHA-256 hashed
    ip_address?: string; // SHA-256 hashed
    user_agent?: string; // plain string
    external_id?: string; // SHA-256 hashed
  };
  conversion_id: string; // dedup ID (= our eventId)
  value?: number;
  currency?: string;
  item_count?: number;
  action_source: "website";
}

export class RedditApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public response: unknown
  ) {
    super(message);
    this.name = "RedditApiError";
  }
}

export function normalizeToRedditEvent(
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
    rdtCid?: string | null;
  }
): RedditEvent | null {
  const redditEventName =
    DESTINATION_EVENT_MAP.REDDIT[
      eventName as keyof typeof DESTINATION_EVENT_MAP.REDDIT
    ];
  if (!redditEventName) return null;

  const ud = eventData.userData;
  const cd = eventData.customData;

  // Build user object with SHA-256 hashed PII
  const user: RedditEvent["user"] = {};
  if (ud.email && typeof ud.email === "string") {
    user.email = hashPii(ud.email);
  }
  if (ud.phone && typeof ud.phone === "string") {
    user.phone_number = hashPhonePii(ud.phone, ud.countryCode as string | undefined);
  }
  if (eventData.clientIp) {
    user.ip_address = hashPii(eventData.clientIp);
  }
  if (eventData.userAgent) {
    user.user_agent = eventData.userAgent;
  }

  const event: RedditEvent = {
    event_at: new Date(eventData.timestamp).toISOString(),
    event_type: { tracking_type: redditEventName },
    user,
    conversion_id: eventData.eventId,
    action_source: "website",
  };

  if (eventData.rdtCid) {
    event.click_id = eventData.rdtCid;
  }

  if (cd.value !== undefined) event.value = Number(cd.value);
  if (cd.currency) event.currency = String(cd.currency);
  const numItems = cd.numItems ?? cd.num_items;
  if (numItems !== undefined) event.item_count = Number(numItems);

  return event;
}

export async function sendToReddit(
  accountId: string,
  accessToken: string,
  events: RedditEvent[]
): Promise<unknown> {
  const response = await fetch(
    `${REDDIT_API_BASE}/${encodeURIComponent(accountId)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ events }),
      signal: AbortSignal.timeout(30000),
    }
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new RedditApiError(
      result?.message || `HTTP ${response.status}`,
      response.status,
      result
    );
  }

  return result;
}
