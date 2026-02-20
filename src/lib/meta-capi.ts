import { META_API_BASE_URL } from "./constants";
import type { MetaCapiEvent, MetaCapiResponse } from "@/types/meta-capi";

export class MetaCapiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public response: unknown
  ) {
    super(message);
    this.name = "MetaCapiError";
  }
}

export async function sendToMetaCapi(
  pixelId: string,
  accessToken: string,
  events: MetaCapiEvent[],
  testEventCode?: string
): Promise<MetaCapiResponse> {
  const url = `${META_API_BASE_URL}/${pixelId}/events`;

  const body = {
    data: events,
    access_token: accessToken,
    ...(testEventCode && { test_event_code: testEventCode }),
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new MetaCapiError(
      result.error?.message || "Unknown Meta CAPI error",
      response.status,
      result
    );
  }

  return result as MetaCapiResponse;
}
