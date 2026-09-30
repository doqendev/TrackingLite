export interface OpenAIClickContext { value: string; capturedAt: number }

// Self-contained so the exact tested function can be embedded in both Shopify
// scripts. No imported helpers, browser globals, or server credentials.
export function updateOpenAIClickContext(
  prior: unknown, url: string, allowed: boolean, now: number, captureUrl = true
): OpenAIClickContext | null {
  if (!allowed) return null;
  if (captureUrl) {
    try {
      const value = new URL(url).searchParams.get("oppref");
      if (value && value.length <= 2048) return { value, capturedAt: now };
    } catch { /* Invalid URLs cannot provide attribution. */ }
  }
  if (!prior || typeof prior !== "object") return null;
  const context = prior as Partial<OpenAIClickContext>;
  return typeof context.value === "string" && context.value.length > 0 && context.value.length <= 2048 &&
    typeof context.capturedAt === "number" && Number.isFinite(context.capturedAt) &&
    context.capturedAt <= now && context.capturedAt > now - 2592000000
    ? { value: context.value, capturedAt: context.capturedAt } : null;
}

export function openAIClickContextScript(): string {
  return `var updateOpenAIClickContext=${updateOpenAIClickContext.toString()};`;
}
