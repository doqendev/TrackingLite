import { isIP } from "node:net";

const DEFAULT_APP_URL = "https://trackclear.io";
const DEFAULT_INGEST_URL = "https://www.trackclear.io/api/events/ingest";
const VERIFY_PATH = "/api/custom-ingest-domain/check";
const OWNED_TRACKCLEAR_HOSTS = new Set([
  "trackclear.io",
  "www.trackclear.io",
  "api.trackclear.io",
]);

export type CustomIngestWorkspace = {
  customIngestDomain?: string | null;
  customIngestDomainVerifiedAt?: Date | string | null;
};

export function defaultAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL).replace(/\/+$/, "");
}

export function defaultIngestUrl(): string {
  return process.env.NEXT_PUBLIC_INGEST_URL || DEFAULT_INGEST_URL;
}

export function customIngestCnameTarget(): string {
  return process.env.NEXT_PUBLIC_CUSTOM_INGEST_CNAME_TARGET || "cname.vercel-dns.com";
}

export function normalizeCustomIngestDomainInput(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  let hostname: string;
  try {
    const input = raw.includes("://") ? raw : `https://${raw}`;
    hostname = new URL(input).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    throw new Error("Enter a valid subdomain, for example t.example.com.");
  }

  validateCustomIngestDomain(hostname);
  return hostname;
}

export function validateCustomIngestDomain(hostname: string): void {
  if (!hostname) {
    throw new Error("Enter a valid subdomain, for example t.example.com.");
  }

  if (hostname.length > 253) {
    throw new Error("Custom ingest domain is too long.");
  }

  if (hostname === "localhost" || isIP(hostname)) {
    throw new Error("Custom ingest domain must be a public hostname.");
  }

  if (!hostname.includes(".")) {
    throw new Error("Use a full subdomain such as t.example.com.");
  }

  if (OWNED_TRACKCLEAR_HOSTS.has(hostname)) {
    throw new Error("Use a merchant-owned subdomain, not a TrackClear domain.");
  }

  const labels = hostname.split(".");
  for (const label of labels) {
    if (!label || label.length > 63) {
      throw new Error("Enter a valid DNS hostname.");
    }
    if (!/^[a-z0-9-]+$/.test(label) || label.startsWith("-") || label.endsWith("-")) {
      throw new Error("Enter a valid DNS hostname.");
    }
  }
}

export function isCustomIngestDomainVerified(workspace: CustomIngestWorkspace): boolean {
  return !!workspace.customIngestDomain && !!workspace.customIngestDomainVerifiedAt;
}

export function getWorkspaceIngestUrl(workspace: CustomIngestWorkspace): string {
  if (isCustomIngestDomainVerified(workspace)) {
    return `https://${workspace.customIngestDomain}/api/events/ingest`;
  }
  return defaultIngestUrl();
}

export function getWorkspacePixelUrl(workspace: CustomIngestWorkspace, workspaceId: string): string {
  if (isCustomIngestDomainVerified(workspace)) {
    return `https://${workspace.customIngestDomain}/api/pixel/${encodeURIComponent(workspaceId)}`;
  }
  return `${defaultAppUrl()}/api/pixel/${encodeURIComponent(workspaceId)}`;
}

export function customIngestVerificationUrl(domain: string, workspaceId: string): string {
  const url = new URL(`https://${domain}${VERIFY_PATH}`);
  url.searchParams.set("workspaceId", workspaceId);
  return url.toString();
}
