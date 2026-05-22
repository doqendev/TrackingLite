import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { invalidateApiKeyCache } from "@/lib/api-key-cache";
import { invalidateWorkspaceCache } from "@/lib/workspace-cache";
import {
  customIngestVerificationUrl,
  validateCustomIngestDomain,
} from "@/lib/custom-ingest-domain";
import { createLogger } from "@/lib/logger";

const log = createLogger({ component: "custom-ingest-domain-verify" });
const VERIFY_TIMEOUT_MS = 8_000;

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    return await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyDomainRoute(domain: string, workspaceId: string): Promise<void> {
  validateCustomIngestDomain(domain);

  const url = customIngestVerificationUrl(domain, workspaceId);
  let response: Response;
  try {
    response = await fetchWithTimeout(url);
  } catch {
    throw new Error("Domain did not respond. Check DNS and hosting before verifying again.");
  }

  if (!response.ok) {
    throw new Error(`Domain verification returned HTTP ${response.status}.`);
  }

  const marker = response.headers.get("x-trackclear-custom-ingest");
  let body: { service?: unknown; workspaceId?: unknown } = {};
  try {
    body = await response.json();
  } catch {
    throw new Error("Domain verification did not return TrackClear JSON.");
  }

  if (
    marker !== "ok" ||
    body.service !== "trackclear-custom-ingest" ||
    body.workspaceId !== workspaceId
  ) {
    throw new Error("Domain is not routing to the TrackClear custom ingest check.");
  }
}

export async function POST(
  _request: NextRequest,
  { params }: RouteContext
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const workspace = await db.workspace.findFirst({
    where: { id, userId: session.user.id, isActive: true },
    select: {
      id: true,
      apiKey: true,
      customIngestDomain: true,
    },
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  if (!workspace.customIngestDomain) {
    return NextResponse.json(
      { error: "Save a custom ingest domain before verifying." },
      { status: 400 }
    );
  }

  const checkedAt = new Date();
  try {
    await verifyDomainRoute(workspace.customIngestDomain, workspace.id);

    const updated = await db.workspace.update({
      where: { id: workspace.id },
      data: {
        customIngestDomainVerifiedAt: checkedAt,
        customIngestDomainLastCheckedAt: checkedAt,
        customIngestDomainLastError: null,
      },
      select: {
        customIngestDomain: true,
        customIngestDomainVerifiedAt: true,
        customIngestDomainLastCheckedAt: true,
        customIngestDomainLastError: true,
      },
    });

    await invalidateApiKeyCache(workspace.apiKey).catch(() => {});
    invalidateWorkspaceCache(workspace.id);

    return NextResponse.json({ verified: true, ...updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Domain verification failed.";

    const updated = await db.workspace.update({
      where: { id: workspace.id },
      data: {
        customIngestDomainVerifiedAt: null,
        customIngestDomainLastCheckedAt: checkedAt,
        customIngestDomainLastError: message,
      },
      select: {
        customIngestDomain: true,
        customIngestDomainVerifiedAt: true,
        customIngestDomainLastCheckedAt: true,
        customIngestDomainLastError: true,
      },
    });

    await invalidateApiKeyCache(workspace.apiKey).catch(() => {});
    invalidateWorkspaceCache(workspace.id);

    log.warn("Custom ingest domain verification failed", {
      workspaceId: workspace.id,
      domain: workspace.customIngestDomain,
      error: message,
    });

    return NextResponse.json(
      { verified: false, error: message, ...updated },
      { status: 422 }
    );
  }
}

