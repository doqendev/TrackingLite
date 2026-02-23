/**
 * Resolves a user-provided store URL to its canonical Shopify *.myshopify.com domain.
 *
 * Uses Shopify's public /meta.json endpoint (no auth required) to resolve
 * custom domains to their canonical myshopify_domain.
 */

export interface ShopifyDomainResult {
  shopifyDomain: string; // e.g. "mystore.myshopify.com"
  displayDomain: string; // the cleaned user input, e.g. "www.mystore.com"
}

const MYSHOPIFY_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

/**
 * Normalize raw user input into a bare hostname.
 * Strips protocol, trailing slashes, paths, query strings, and whitespace.
 */
export function normalizeDomainInput(input: string): string {
  let domain = input.trim().toLowerCase();

  // Strip protocol
  domain = domain.replace(/^https?:\/\//, "");

  // Strip trailing slashes and path
  domain = domain.replace(/\/.*$/, "");

  // Strip query string and fragment (e.g. ?utm_source=email#section)
  domain = domain.replace(/[?#].*$/, "");

  // Strip port
  domain = domain.replace(/:\d+$/, "");

  return domain;
}

/**
 * Check if a hostname is a private/internal address that should not be fetched.
 * Prevents SSRF attacks against internal infrastructure.
 */
function isPrivateHost(hostname: string): boolean {
  // Reject localhost variants
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1") {
    return true;
  }

  // Reject IPv6 addresses (enclosed in brackets or bare)
  if (hostname.startsWith("[") || hostname.includes("::")) {
    return true;
  }

  // Reject IPv4 private ranges
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 10) return true;                          // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
    if (a === 192 && b === 168) return true;             // 192.168.0.0/16
    if (a === 169 && b === 254) return true;             // 169.254.0.0/16 (link-local / cloud metadata)
    if (a === 127) return true;                          // 127.0.0.0/8
    if (a === 0) return true;                            // 0.0.0.0/8
    return false;
  }

  // Reject bare IP-like patterns (any all-numeric hostname)
  if (/^\d+$/.test(hostname)) return true;

  return false;
}

/**
 * Resolve a user-provided domain to its canonical Shopify myshopify.com domain.
 *
 * - If input already matches *.myshopify.com, returns it directly (no fetch).
 * - Otherwise fetches https://{domain}/meta.json to extract myshopify_domain.
 * - Returns null if the domain is not a Shopify store or the request fails.
 */
export async function resolveShopifyDomain(
  input: string
): Promise<ShopifyDomainResult | null> {
  const domain = normalizeDomainInput(input);

  if (!domain) return null;

  // If already a myshopify.com domain, return directly
  if (MYSHOPIFY_REGEX.test(domain)) {
    return {
      shopifyDomain: domain,
      displayDomain: domain,
    };
  }

  // SSRF protection: reject private/internal addresses
  if (isPrivateHost(domain)) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`https://${domain}/meta.json`, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "TrackClear/1.0",
      },
    });

    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = (await response.json()) as Record<string, unknown>;

    const myshopifyDomain = data.myshopify_domain;
    if (typeof myshopifyDomain !== "string" || !myshopifyDomain) return null;

    // Ensure it looks like a valid myshopify domain
    const normalized = myshopifyDomain.toLowerCase();
    if (!MYSHOPIFY_REGEX.test(normalized)) return null;

    return {
      shopifyDomain: normalized,
      displayDomain: domain,
    };
  } catch {
    // Network error, timeout, invalid JSON, etc.
    return null;
  }
}
