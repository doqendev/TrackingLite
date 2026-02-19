import { DESTINATION_EVENT_MAP } from "@/lib/destinations";

const KLAVIYO_EVENTS_URL = "https://a.klaviyo.com/api/events/";
const KLAVIYO_API_REVISION = "2024-10-15";

export interface KlaviyoEventPayload {
  data: {
    type: "event";
    attributes: {
      metric: {
        data: {
          type: "metric";
          attributes: { name: string };
        };
      };
      profile: {
        data: {
          type: "profile";
          attributes: {
            email?: string;
            phone_number?: string;
            first_name?: string;
            last_name?: string;
            location?: {
              city?: string;
              region?: string;
              zip?: string;
              country?: string;
            };
          };
        };
      };
      properties: Record<string, unknown>;
      value?: number;
      unique_id: string;
      time: string; // ISO 8601
    };
  };
}

export class KlaviyoApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public response: unknown
  ) {
    super(message);
    this.name = "KlaviyoApiError";
  }
}

export function normalizeToKlaviyoEvent(
  eventName: string,
  eventData: {
    eventId: string;
    timestamp: number;
    userData: Record<string, unknown>;
    customData: Record<string, unknown>;
  }
): KlaviyoEventPayload | null {
  const klaviyoEventName =
    DESTINATION_EVENT_MAP.KLAVIYO[
      eventName as keyof typeof DESTINATION_EVENT_MAP.KLAVIYO
    ];
  if (!klaviyoEventName) return null;

  const ud = eventData.userData;
  const cd = eventData.customData;

  // Build profile attributes — use RAW values (not hashed), Klaviyo needs plaintext for matching
  const profileAttributes: KlaviyoEventPayload["data"]["attributes"]["profile"]["data"]["attributes"] =
    {};

  if (ud.email && typeof ud.email === "string") {
    profileAttributes.email = ud.email;
  }
  if (ud.phone && typeof ud.phone === "string") {
    profileAttributes.phone_number = ud.phone;
  }
  if (ud.firstName && typeof ud.firstName === "string") {
    profileAttributes.first_name = ud.firstName;
  }
  if (ud.lastName && typeof ud.lastName === "string") {
    profileAttributes.last_name = ud.lastName;
  }

  // Location
  const location: NonNullable<typeof profileAttributes.location> = {};
  if (ud.city && typeof ud.city === "string") location.city = ud.city;
  if (ud.state && typeof ud.state === "string") location.region = ud.state;
  if (ud.zip && typeof ud.zip === "string") location.zip = ud.zip;
  if (ud.countryCode && typeof ud.countryCode === "string") {
    location.country = ud.countryCode;
  }
  if (Object.keys(location).length > 0) {
    profileAttributes.location = location;
  }

  // Build properties from customData
  const properties: Record<string, unknown> = {};
  if (cd.contentIds !== undefined) properties.content_ids = cd.contentIds;
  if (cd.content_ids !== undefined) properties.content_ids = cd.content_ids;
  if (cd.currency !== undefined) properties.currency = cd.currency;
  if (cd.orderId !== undefined) properties.order_id = cd.orderId;
  if (cd.order_id !== undefined) properties.order_id = cd.order_id;
  if (cd.numItems !== undefined) properties.num_items = cd.numItems;
  if (cd.num_items !== undefined) properties.num_items = cd.num_items;

  // value for the event (top-level Klaviyo field)
  const value =
    cd.value !== undefined ? Number(cd.value) : undefined;

  const payload: KlaviyoEventPayload = {
    data: {
      type: "event",
      attributes: {
        metric: {
          data: {
            type: "metric",
            attributes: { name: klaviyoEventName },
          },
        },
        profile: {
          data: {
            type: "profile",
            attributes: profileAttributes,
          },
        },
        properties,
        unique_id: eventData.eventId,
        time: new Date(eventData.timestamp).toISOString(),
        ...(value !== undefined && { value }),
      },
    },
  };

  return payload;
}

export async function sendToKlaviyo(
  apiKey: string,
  payload: KlaviyoEventPayload
): Promise<unknown> {
  const response = await fetch(KLAVIYO_EVENTS_URL, {
    method: "POST",
    headers: {
      "Authorization": `Klaviyo-API-Key ${apiKey}`,
      "Content-Type": "application/json",
      "revision": KLAVIYO_API_REVISION,
    },
    body: JSON.stringify(payload),
  });

  // Klaviyo returns 202 Accepted on success with no body
  if (response.status === 202) {
    return { accepted: true };
  }

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text();
    }
    throw new KlaviyoApiError(
      `Klaviyo API error: ${response.status}`,
      response.status,
      errorBody
    );
  }

  try {
    return await response.json();
  } catch {
    return { ok: true };
  }
}
