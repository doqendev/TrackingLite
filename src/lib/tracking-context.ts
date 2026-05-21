const MAX_IP_LENGTH = 45;

function firstHeaderValue(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  return first || null;
}

export function synthesizeFbcFromFbclid(
  fbclid?: string | null,
  now = Date.now()
): string | null {
  const cleaned = typeof fbclid === "string" ? fbclid.trim() : "";
  if (!cleaned) return null;
  return `fb.1.${now}.${cleaned}`;
}

export function resolveFbc(
  fbc?: string | null,
  fbclid?: string | null,
  now = Date.now()
): string | null {
  const cleanedFbc = typeof fbc === "string" ? fbc.trim() : "";
  if (cleanedFbc) return cleanedFbc;
  return synthesizeFbcFromFbclid(fbclid, now);
}

export function getClientIpFromHeaders(headers: Headers): string {
  const clientIp =
    firstHeaderValue(headers.get("x-tl-client-ip")) ||
    firstHeaderValue(headers.get("x-forwarded-for")) ||
    "unknown";

  return clientIp.slice(0, MAX_IP_LENGTH);
}

export function getClientUserAgentFromHeaders(headers: Headers): string {
  return headers.get("x-tl-client-ua") || headers.get("user-agent") || "";
}
