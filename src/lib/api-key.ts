import { randomBytes } from "crypto";

const API_KEY_PREFIX = "tl_";
const API_KEY_LENGTH = 32;

export function generateApiKey(): string {
  const key = randomBytes(API_KEY_LENGTH).toString("hex");
  return `${API_KEY_PREFIX}${key}`;
}

export function isValidApiKeyFormat(key: string): boolean {
  return key.startsWith(API_KEY_PREFIX) && key.length === API_KEY_PREFIX.length + API_KEY_LENGTH * 2;
}
