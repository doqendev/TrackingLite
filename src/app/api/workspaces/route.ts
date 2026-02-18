import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateApiKey } from "@/lib/api-key";
import { encrypt } from "@/lib/encryption";
import { z } from "zod";

const CreateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  domain: z.string().min(1, "Store URL is required"),
  metaPixelId: z.string().optional(),
  metaAccessToken: z.string().optional(),
  metaTestEventCode: z.string().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaces = await db.workspace.findMany({
    where: { userId: session.user.id, isActive: true },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      domain: true,
      platform: true,
      metaPixelId: true,
      consentMode: true,
      enablePageView: true,
      enableViewContent: true,
      enableAddToCart: true,
      enableInitiateCheckout: true,
      enablePurchase: true,
      isActive: true,
      eventsForwardedCount: true,
      createdAt: true,
    },
  });

  return NextResponse.json(workspaces);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const data = CreateWorkspaceSchema.parse(body);

    const apiKey = generateApiKey();

    // Encrypt Meta access token if provided
    let metaTokenFields = {};
    if (data.metaAccessToken) {
      const { encrypted, iv, tag } = encrypt(data.metaAccessToken);
      metaTokenFields = {
        metaAccessTokenEncrypted: encrypted,
        metaAccessTokenIv: iv,
        metaAccessTokenTag: tag,
      };
    }

    const workspace = await db.workspace.create({
      data: {
        userId: session.user.id,
        name: data.name,
        domain: data.domain || null,
        apiKey,
        metaPixelId: data.metaPixelId || null,
        metaTestEventCode: data.metaTestEventCode || null,
        ...metaTokenFields,
      },
    });

    // Return full API key only on creation
    return NextResponse.json({ ...workspace, apiKey }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 422 }
      );
    }
    console.error("[Workspace] Create error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
