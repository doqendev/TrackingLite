import { decrypt, encrypt } from "@/lib/encryption";

export const EVENT_RETRY_ENVELOPE_TTL_MS = 72 * 60 * 60 * 1000;

export interface EventRetryEnvelope {
  version: 1;
  event: {
    eventName: string;
    eventId: string;
    timestamp: number;
    url: string;
    referrer: string;
    trackclearSessionId?: string | null;
    fbp?: string | null;
    fbc?: string | null;
    fbclid?: string | null;
    gbraid?: string | null;
    wbraid?: string | null;
    ttclid?: string | null;
    ttp?: string | null;
    gclid?: string | null;
    rdtCid?: string | null;
    epik?: string | null;
    gaClientId?: string | null;
    userData: Record<string, unknown>;
    customData: Record<string, unknown>;
    clientIp: string;
    userAgent: string;
  };
}

export interface EventRetryEnvelopeColumns {
  retryPayloadEncrypted: string;
  retryPayloadIv: string;
  retryPayloadTag: string;
  retryPayloadExpiresAt: Date;
}

export interface StoredEventRetryEnvelope {
  retryPayloadEncrypted: string | null;
  retryPayloadIv: string | null;
  retryPayloadTag: string | null;
  retryPayloadExpiresAt: Date | null;
}

function isRetryEnvelope(value: unknown): value is EventRetryEnvelope {
  if (!value || typeof value !== "object") return false;
  const envelope = value as Partial<EventRetryEnvelope>;
  if (envelope.version !== 1 || !envelope.event || typeof envelope.event !== "object") return false;
  const event = envelope.event as EventRetryEnvelope["event"];
  return (
    typeof event.eventName === "string" &&
    typeof event.eventId === "string" &&
    Number.isFinite(event.timestamp) &&
    typeof event.url === "string" &&
    typeof event.referrer === "string" &&
    !!event.userData &&
    typeof event.userData === "object" &&
    !Array.isArray(event.userData) &&
    !!event.customData &&
    typeof event.customData === "object" &&
    !Array.isArray(event.customData) &&
    typeof event.clientIp === "string" &&
    typeof event.userAgent === "string"
  );
}

export function encryptEventRetryEnvelope(
  envelope: EventRetryEnvelope,
  now = new Date()
): EventRetryEnvelopeColumns {
  const encrypted = encrypt(JSON.stringify(envelope));
  return {
    retryPayloadEncrypted: encrypted.encrypted,
    retryPayloadIv: encrypted.iv,
    retryPayloadTag: encrypted.tag,
    retryPayloadExpiresAt: new Date(now.getTime() + EVENT_RETRY_ENVELOPE_TTL_MS),
  };
}

export function decryptEventRetryEnvelope(
  stored: StoredEventRetryEnvelope,
  now = new Date()
): EventRetryEnvelope | null {
  if (
    !stored.retryPayloadEncrypted ||
    !stored.retryPayloadIv ||
    !stored.retryPayloadTag ||
    !stored.retryPayloadExpiresAt ||
    stored.retryPayloadExpiresAt.getTime() <= now.getTime()
  ) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      decrypt(stored.retryPayloadEncrypted, stored.retryPayloadIv, stored.retryPayloadTag)
    ) as unknown;
    return isRetryEnvelope(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export function clearedEventRetryEnvelope(): {
  retryPayloadEncrypted: null;
  retryPayloadIv: null;
  retryPayloadTag: null;
  retryPayloadExpiresAt: null;
} {
  return {
    retryPayloadEncrypted: null,
    retryPayloadIv: null,
    retryPayloadTag: null,
    retryPayloadExpiresAt: null,
  };
}
