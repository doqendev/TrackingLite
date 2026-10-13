import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { normalizeToOpenAIEvent } from "../src/lib/destinations/openai";

// Run through tsx, exactly as the production worker does. Vitest's dependency
// loader alone does not exercise the package's JSON/ESM resolution behavior.
const now = Date.now();
for (const phone of ["+44 20 7946 0958", "0044 20 7946 0958", "020 7946 0958"]) {
  const result = normalizeToOpenAIEvent({ eventName: "InitiateCheckout", eventId: "runtime-check",
    timestamp: now, url: "https://example.com/checkout", referrer: "", clientIp: "127.0.0.1",
    userAgent: "Runtime verification", userData: { phone, countryCode: "GB" }, customData: {},
  }, now);
  assert.deepEqual(result.user?.phone_numbers_sha256,
    [createHash("sha256").update("442079460958").digest("hex")]);
}
console.log("OpenAI worker phone normalization verified (no network events sent)");
