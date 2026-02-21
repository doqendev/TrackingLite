import { createHash } from "crypto";
import { normalizePhoneToE164 } from "./phone-normalizer";

export function hashPii(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  return createHash("sha256").update(normalized).digest("hex");
}

export function hashPhonePii(phone: string | undefined | null, countryCode?: string | null): string | undefined {
  if (!phone) return undefined;
  const normalized = normalizePhoneToE164(phone, countryCode);
  return hashPii(normalized || phone);
}

export interface UserDataInput {
  email?: string | null;
  phone?: string | null;
  phoneCountryCode?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  countryCode?: string | null;
  customerId?: string | number | null;
}

export interface HashedUserData {
  em?: string[];
  ph?: string[];
  fn?: string[];
  ln?: string[];
  ct?: string[];
  st?: string[];
  zp?: string[];
  country?: string[];
  external_id?: string[];
}

export function hashUserData(data: UserDataInput): HashedUserData {
  const normalizedPhone = normalizePhoneToE164(data.phone, data.phoneCountryCode);

  const emHash = hashPii(data.email);
  const phHash = normalizedPhone ? hashPii(normalizedPhone) : undefined;
  const fnHash = hashPii(data.firstName);
  const lnHash = hashPii(data.lastName);
  const ctHash = hashPii(data.city);
  const stHash = hashPii(data.state);
  const zpHash = hashPii(data.zip);
  const countryHash = hashPii(data.countryCode);
  const extIdHash = data.customerId ? hashPii(data.customerId.toString()) : undefined;

  return {
    ...(emHash && { em: [emHash] }),
    ...(phHash && { ph: [phHash] }),
    ...(fnHash && { fn: [fnHash] }),
    ...(lnHash && { ln: [lnHash] }),
    ...(ctHash && { ct: [ctHash] }),
    ...(stHash && { st: [stHash] }),
    ...(zpHash && { zp: [zpHash] }),
    ...(countryHash && { country: [countryHash] }),
    ...(extIdHash && { external_id: [extIdHash] }),
  };
}
