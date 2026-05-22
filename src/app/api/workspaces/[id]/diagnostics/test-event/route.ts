import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const DiagnosticEventSchema = z.object({
  eventName: z.enum(["AddToCart", "InitiateCheckout"]),
});

type RouteContext = { params: Promise<{ id: string }> };

function workspaceUrl(workspace: { domain: string | null; shopifyDomain: string | null }): string {
  const rawDomain = (workspace.domain || workspace.shopifyDomain || "trackclear-diagnostics.local")
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "");
  return `https://${rawDomain}/trackclear-diagnostics`;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
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
      domain: true,
      shopifyDomain: true,
    },
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = DiagnosticEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Only AddToCart and InitiateCheckout diagnostic events are supported." },
      { status: 422 }
    );
  }

  const eventName = parsed.data.eventName;
  const eventId = `diagnostic:${eventName}:${crypto.randomUUID()}`;
  const pageUrl = workspaceUrl(workspace);
  const ingestUrl = new URL("/api/events/ingest", request.url);

  const ingestResponse = await fetch(ingestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-TL-API-Key": workspace.apiKey,
    },
    body: JSON.stringify({
      eventName,
      eventId,
      timestamp: Date.now(),
      url: pageUrl,
      referrer: "",
      consent: {
        analyticsAllowed: true,
        marketingAllowed: true,
      },
      customData: {
        value: 0,
        currency: "USD",
        contentIds: ["trackclear_diagnostic_product"],
        contentType: "product",
        contentName: "TrackClear diagnostic product",
        numItems: 1,
        source: "trackclear_diagnostics",
        diagnostic: true,
      },
      utmSource: "trackclear_diagnostics",
      utmMedium: "internal_validation",
      utmCampaign: "non_purchase_pipeline_test",
    }),
  });

  const ingestBody = await ingestResponse.json().catch(() => ({}));
  if (!ingestResponse.ok) {
    return NextResponse.json(
      {
        error: ingestBody.error ?? "Diagnostic ingest failed",
        details: ingestBody,
      },
      { status: ingestResponse.status }
    );
  }

  return NextResponse.json({
    success: true,
    eventId,
    destinations: ingestBody.destinations ?? [],
    ingest: ingestBody,
  });
}
