import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVerify, generateKeyPairSync } from "node:crypto";
import {
  buildServiceAccountAssertion, getGoogleDataManagerAccessToken, getGoogleDataManagerServiceAccountEmail,
  isGoogleDataManagerConfigured, parseGoogleServiceAccountKey, resetGoogleDataManagerAuthCache, GOOGLE_DATA_MANAGER_SCOPE,
} from "@/lib/google-data-manager-auth";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const keyJson = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  type: "service_account", client_email: "trackclear@project.iam.gserviceaccount.com", private_key: pem,
  private_key_id: "kid-1", token_uri: "https://oauth2.googleapis.com/token", ...overrides,
});
const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

describe("service account key parsing", () => {
  it("accepts the downloaded JSON or base64 of it", () => {
    expect(parseGoogleServiceAccountKey(keyJson())).toMatchObject({ clientEmail: "trackclear@project.iam.gserviceaccount.com",
      privateKeyId: "kid-1", tokenUri: "https://oauth2.googleapis.com/token" });
    expect(parseGoogleServiceAccountKey(Buffer.from(keyJson()).toString("base64"))?.clientEmail)
      .toBe("trackclear@project.iam.gserviceaccount.com");
  });
  it.each([
    ["empty", ""], ["not JSON", "{oops"], ["wrong type", keyJson({ type: "authorized_user" })],
    ["non service-account email", keyJson({ client_email: "me@gmail.com" })], ["no key", keyJson({ private_key: "" })],
    ["foreign token host", keyJson({ token_uri: "https://attacker.example/token" })],
    ["plain http token URI", keyJson({ token_uri: "http://oauth2.googleapis.com/token" })],
  ])("rejects %s", (_label, raw) => {
    expect(parseGoogleServiceAccountKey(raw)).toBeNull();
  });
  it("defaults the token URI when the key omits it", () => {
    expect(parseGoogleServiceAccountKey(keyJson({ token_uri: undefined }))?.tokenUri).toBe("https://oauth2.googleapis.com/token");
  });
});

describe("token exchange", () => {
  beforeEach(() => { resetGoogleDataManagerAuthCache(); vi.stubEnv("GOOGLE_DATA_MANAGER_SERVICE_ACCOUNT_KEY", keyJson()); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("exposes only the service account email", () => {
    expect(isGoogleDataManagerConfigured()).toBe(true);
    expect(getGoogleDataManagerServiceAccountEmail()).toBe("trackclear@project.iam.gserviceaccount.com");
    vi.stubEnv("GOOGLE_DATA_MANAGER_SERVICE_ACCOUNT_KEY", "");
    expect(getGoogleDataManagerServiceAccountEmail()).toBeNull();
  });
  it("signs an RS256 assertion for the Data Manager scope", () => {
    const key = parseGoogleServiceAccountKey(keyJson())!;
    const assertion = buildServiceAccountAssertion(key, 1_700_000_000_000);
    const [header, claims, signature] = assertion.split(".");
    expect(decode(header)).toEqual({ alg: "RS256", typ: "JWT", kid: "kid-1" });
    expect(decode(claims)).toEqual({ iss: key.clientEmail, scope: GOOGLE_DATA_MANAGER_SCOPE,
      aud: "https://oauth2.googleapis.com/token", iat: 1_700_000_000, exp: 1_700_003_600 });
    const verifier = createVerify("RSA-SHA256"); verifier.update(`${header}.${claims}`);
    expect(verifier.verify(publicKey, Buffer.from(signature, "base64url"))).toBe(true);
  });
  it("caches the token until five minutes before expiry and shares one request", async () => {
    let clock = 1_000_000;
    const fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      expect(String(init.body)).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer");
      return new Response(JSON.stringify({ access_token: `token-${fetch.mock.calls.length}`, expires_in: 3600 }), { status: 200 });
    });
    const options = { now: () => clock, fetchImpl: fetch as typeof globalThis.fetch };
    const [first, concurrent] = await Promise.all([
      getGoogleDataManagerAccessToken(options), getGoogleDataManagerAccessToken(options)]);
    expect([first, concurrent]).toEqual(["token-1", "token-1"]);
    clock += 54 * 60 * 1000;
    expect(await getGoogleDataManagerAccessToken(options)).toBe("token-1");
    clock += 2 * 60 * 1000;
    expect(await getGoogleDataManagerAccessToken(options)).toBe("token-2");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("reports token failures by status only", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_grant", error_description: "key kid-1 revoked" }), { status: 400 }));
    const error = await getGoogleDataManagerAccessToken({ fetchImpl: fetch as typeof globalThis.fetch }).catch((caught) => caught);
    expect(error).toMatchObject({ statusCode: 400, message: "Google rejected the Track Clear service account (HTTP 400)" });
  });
  it("refuses to run without a configured key", async () => {
    vi.stubEnv("GOOGLE_DATA_MANAGER_SERVICE_ACCOUNT_KEY", keyJson({ type: "authorized_user" }));
    await expect(getGoogleDataManagerAccessToken({ fetchImpl: vi.fn() as typeof globalThis.fetch }))
      .rejects.toMatchObject({ statusCode: 503 });
  });
});
