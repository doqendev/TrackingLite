import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import { createLogger } from "@/lib/logger";
import { resolveShopifyDomain } from "@/lib/shopify-domain-resolver";

const log = createLogger({ component: "resolve-domain" });

const ResolveDomainSchema = z.object({
  domain: z.string().min(1, "Domain is required"),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 422 });
  }

  const parsed = ResolveDomainSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const { domain } = parsed.data;

  try {
    const resolved = await resolveShopifyDomain(domain);

    if (!resolved) {
      return NextResponse.json({ shopifyDomain: null, error: "not_shopify_store" });
    }

    const { shopifyDomain, displayDomain } = resolved;

    const existingWorkspace = await db.workspace.findFirst({
      where: {
        shopifyDomain,
        isActive: true,
      },
      select: {
        name: true,
      },
    });

    if (existingWorkspace) {
      return NextResponse.json({
        shopifyDomain,
        displayDomain,
        available: false,
        existingWorkspaceName: existingWorkspace.name,
      });
    }

    return NextResponse.json({
      shopifyDomain,
      displayDomain,
      available: true,
    });
  } catch (error) {
    log.error("Failed to resolve domain", { domain, error });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
