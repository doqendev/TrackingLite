import { createSign } from "node:crypto";

/**
 * Google Data Manager API authentication with Track Clear's own service account.
 *
 * The service account key is a deployment secret (Railway worker and Vercel web
 * for validation). Merchants never handle it: they add the service account's
 * email address as a user of their Google Ads account (or of a manager account
 * that is then used as the login account). The Data Manager API does not use a
 * Google Ads developer token.
 */
export const GOOGLE_DATA_MANAGER_KEY_ENV = "GOOGLE_DATA_MANAGER_SERVICE_ACCOUNT_KEY";
export const GOOGLE_DATA_MANAGER_SCOPE = "https://www.googleapis.com/auth/datamanager";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
const TOKEN_LIFETIME_SECONDS = 3600;
// Refresh well before expiry so a token never expires during a 30-second request.
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

export class GoogleAuthError extends Error {
  constructor(message: string, public statusCode: number, public retryAfterMs = 0) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

export interface GoogleServiceAccountKey {
  clientEmail: string;
  privateKey: string;
  privateKeyId: string | null;
  tokenUri: string;
}

type Fetch = typeof fetch;

/**
 * Accepts the downloaded JSON key either verbatim or base64 encoded (Railway and
 * Vercel variables are easier to paste as one line). Anything else is rejected
 * without echoing the value.
 */
export function parseGoogleServiceAccountKey(raw: string | undefined | null): GoogleServiceAccountKey | null {
  const value = raw?.trim();
  if (!value) return null;
  let json: unknown;
  try {
    json = JSON.parse(value.startsWith("{") ? value : Buffer.from(value, "base64").toString("utf8"));
  } catch {
    return null;
  }
  if (!json || typeof json !== "object") return null;
  const key = json as Record<string, unknown>;
  if (key.type !== "service_account") return null;
  const clientEmail = typeof key.client_email === "string" ? key.client_email.trim() : "";
  const privateKey = typeof key.private_key === "string" ? key.private_key : "";
  if (!/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/i.test(clientEmail)) return null;
  if (!privateKey.includes("BEGIN PRIVATE KEY")) return null;
  const tokenUri = typeof key.token_uri === "string" && key.token_uri ? key.token_uri : DEFAULT_TOKEN_URI;
  // A tampered key file must not redirect the signed assertion to another host.
  let tokenHost: string;
  try {
    const url = new URL(tokenUri);
    if (url.protocol !== "https:") return null;
    tokenHost = url.hostname;
  } catch {
    return null;
  }
  if (tokenHost !== "oauth2.googleapis.com") return null;
  return {
    clientEmail,
    privateKey,
    privateKeyId: typeof key.private_key_id === "string" && key.private_key_id ? key.private_key_id : null,
    tokenUri,
  };
}

function configuredKey(): GoogleServiceAccountKey | null {
  return parseGoogleServiceAccountKey(process.env[GOOGLE_DATA_MANAGER_KEY_ENV]);
}

/** The address merchants add to Google Ads. Not a secret; null when unconfigured. */
export function getGoogleDataManagerServiceAccountEmail(): string | null {
  return configuredKey()?.clientEmail ?? null;
}

export function isGoogleDataManagerConfigured(): boolean {
  return configuredKey() !== null;
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function buildServiceAccountAssertion(key: GoogleServiceAccountKey, nowMs: number): string {
  const iat = Math.floor(nowMs / 1000);
  const header = { alg: "RS256", typ: "JWT", ...(key.privateKeyId ? { kid: key.privateKeyId } : {}) };
  const claims = {
    iss: key.clientEmail,
    scope: GOOGLE_DATA_MANAGER_SCOPE,
    aud: key.tokenUri,
    iat,
    exp: iat + TOKEN_LIFETIME_SECONDS,
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${base64Url(signer.sign(key.privateKey))}`;
}

type CachedToken = { token: string; expiresAt: number; clientEmail: string };
let cachedToken: CachedToken | null = null;
let inflight: Promise<CachedToken> | null = null;

/** Tests and key rotation: forget the cached access token. */
export function resetGoogleDataManagerAuthCache(): void {
  cachedToken = null;
  inflight = null;
}

function retryAfterMs(header: string | null): number {
  if (!header) return 0;
  const delay = /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(delay) ? Math.max(0, Math.min(delay, 24 * 60 * 60 * 1000)) : 0;
}

async function requestToken(key: GoogleServiceAccountKey, nowMs: number, fetchImpl: Fetch): Promise<CachedToken> {
  let assertion: string;
  try {
    assertion = buildServiceAccountAssertion(key, nowMs);
  } catch {
    throw new GoogleAuthError("Google service account key could not sign a token request", 400);
  }
  const response = await fetchImpl(key.tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    // Token errors can describe the key. Keep only the status for operators.
    throw new GoogleAuthError(
      `Google rejected the Track Clear service account (HTTP ${response.status})`,
      response.status,
      retryAfterMs(response.headers.get("retry-after"))
    );
  }
  const body = (await response.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null;
  const token = typeof body?.access_token === "string" ? body.access_token : "";
  const expiresIn = typeof body?.expires_in === "number" && body.expires_in > 0 ? body.expires_in : TOKEN_LIFETIME_SECONDS;
  if (!token) throw new GoogleAuthError("Google returned no access token", 502);
  return { token, expiresAt: nowMs + expiresIn * 1000, clientEmail: key.clientEmail };
}

export async function getGoogleDataManagerAccessToken(
  options: { now?: () => number; fetchImpl?: Fetch; forceRefresh?: boolean } = {}
): Promise<string> {
  const now = options.now ?? Date.now;
  const fetchImpl = options.fetchImpl ?? fetch;
  const key = configuredKey();
  if (!key) {
    throw new GoogleAuthError("Track Clear's Google service account is not configured", 503);
  }
  const current = cachedToken;
  if (
    !options.forceRefresh &&
    current &&
    current.clientEmail === key.clientEmail &&
    current.expiresAt - TOKEN_REFRESH_MARGIN_MS > now()
  ) {
    return current.token;
  }
  if (!inflight) {
    inflight = requestToken(key, now(), fetchImpl)
      .then((token) => {
        cachedToken = token;
        return token;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return (await inflight).token;
}
