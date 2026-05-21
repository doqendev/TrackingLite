import { hashUserData } from "./hash-pii";
import type { MetaCapiEvent } from "@/types/meta-capi";
import type { SnippetEventPayload } from "@/types/events";

const FBP_REGEX = /^fb\.1\.\d{13}\.\d{7,20}$/;
const FBC_REGEX = /^fb\.1\.(\d{13})\..+$/;
const FBC_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

function validateFbp(fbp: string | null | undefined): string | undefined {
  if (!fbp) return undefined;
  return FBP_REGEX.test(fbp) ? fbp : undefined;
}

function validateFbc(fbc: string | null | undefined): string | undefined {
  if (!fbc) return undefined;
  const match = fbc.match(FBC_REGEX);
  if (!match) return undefined;
  if (Date.now() - parseInt(match[1], 10) > FBC_MAX_AGE_MS) return undefined;
  return fbc;
}

export function normalizeToMetaCapiEvent(
  payload: SnippetEventPayload,
  clientIp: string | null,
  clientUserAgent: string | null
): MetaCapiEvent {
  const hashedUserData = payload.userData
    ? hashUserData({
        email: payload.userData.email,
        phone: payload.userData.phone,
        phoneCountryCode: payload.userData.countryCode,
        firstName: payload.userData.firstName,
        lastName: payload.userData.lastName,
        city: payload.userData.city,
        state: payload.userData.state,
        zip: payload.userData.zip,
        countryCode: payload.userData.countryCode,
        customerId: payload.userData.customerId,
      })
    : {};

  const validFbp = validateFbp(payload.fbp);
  const validFbc = validateFbc(payload.fbc);

  return {
    event_name: payload.eventName,
    event_time: Math.floor(payload.timestamp / 1000), // Convert ms to seconds
    event_id: payload.eventId,
    action_source: "website",
    ...(payload.url && { event_source_url: payload.url }),
    user_data: {
      ...hashedUserData,
      ...(clientIp && { client_ip_address: clientIp }),
      ...(clientUserAgent && { client_user_agent: clientUserAgent }),
      ...(validFbp && { fbp: validFbp }),
      ...(validFbc && { fbc: validFbc }),
    },
    ...(payload.customData && Object.keys(payload.customData).length > 0 && {
      custom_data: normalizeCustomData(payload.customData),
    }),
  };
}

function normalizeCustomData(data: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  // Accept both camelCase (sent by JS snippet) and snake_case (third-party integrations)
  const pick = <T>(camel: string, snake: string): T | undefined => {
    const val = data[camel] !== undefined ? data[camel] : data[snake];
    return val as T | undefined;
  };

  const value = pick<unknown>("value", "value");
  if (value !== undefined) normalized.value = Number(value);

  const currency = pick<unknown>("currency", "currency");
  if (currency) normalized.currency = String(currency);

  const contentIds = pick<unknown[]>("contentIds", "content_ids");
  if (contentIds) normalized.content_ids = (contentIds as unknown[]).map(String);

  const contentType = pick<unknown>("contentType", "content_type");
  if (contentType) normalized.content_type = String(contentType);

  const contentName = pick<unknown>("contentName", "content_name");
  if (contentName) normalized.content_name = String(contentName);

  const contentCategory = pick<unknown>("contentCategory", "content_category");
  if (contentCategory) normalized.content_category = String(contentCategory);

  const numItems = pick<unknown>("numItems", "num_items");
  if (numItems !== undefined) normalized.num_items = Number(numItems);

  const orderId = pick<unknown>("orderId", "order_id");
  if (orderId) normalized.order_id = String(orderId);

  const contents = pick<unknown[]>("contents", "contents");
  if (contents && Array.isArray(contents)) {
    normalized.contents = (contents as Array<Record<string, unknown>>).map((item) => {
      // item_price sent as camelCase (itemPrice) by snippet, snake_case by others
      const itemPrice = item.itemPrice !== undefined ? item.itemPrice : item.item_price;
      return {
        id: String(item.id),
        quantity: Number(item.quantity),
        ...(itemPrice !== undefined && { item_price: Number(itemPrice) }),
      };
    });
  }

  return normalized;
}
