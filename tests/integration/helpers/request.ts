import { NextRequest } from "next/server";

interface MakeRequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export function makeRequest(
  url: string,
  options: MakeRequestOptions = {}
): NextRequest {
  const { method = "GET", body, headers = {} } = options;

  const fullUrl = url.startsWith("http")
    ? url
    : `http://localhost${url}`;

  const init: ConstructorParameters<typeof NextRequest>[1] = { method };

  if (body !== undefined) {
    init.body = JSON.stringify(body);
    headers["Content-Type"] = "application/json";
  }

  init.headers = headers;

  return new NextRequest(fullUrl, init);
}
