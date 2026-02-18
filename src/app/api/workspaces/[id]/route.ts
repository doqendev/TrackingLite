import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { z } from "zod";

const UpdateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  domain: z.string().optional().nullable(),
  metaPixelId: z.string().optional().nullable(),
  metaAccessToken: z.string().optional().nullable(),
  metaTestEventCode: z.string().optional().nullable(),
  consentMode: z.enum(["STRICT", "LAX"]).optional(),
  enablePageView: z.boolean().optional(),
  enableViewContent: z.boolean().optional(),
  enableAddToCart: z.boolean().optional(),
  enableInitiateCheckout: z.boolean().optional(),
  enablePurchase: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
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
      name: true,
      domain: true,
      platform: true,
      metaPixelId: true,
      // Indicate whether the token is set without exposing it
      metaAccessTokenEncrypted: true,
      metaTestEventCode: true,
      consentMode: true,
      enablePageView: true,
      enableViewContent: true,
      enableAddToCart: true,
      enableInitiateCheckout: true,
      enablePurchase: true,
      isActive: true,
      eventsForwardedCount: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Replace the encrypted token with a boolean flag
  const { metaAccessTokenEncrypted, ...rest } = workspace;
  return NextResponse.json({
    ...rest,
    hasMetaAccessToken: metaAccessTokenEncrypted !== null,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const workspace = await db.workspace.findFirst({
    where: { id, userId: session.user.id, isActive: true },
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const data = UpdateWorkspaceSchema.parse(body);

    // Separate the metaAccessToken from the rest of the fields
    const { metaAccessToken, ...scalarFields } = data;

    // Build the update payload
    const updateData: Record<string, unknown> = { ...scalarFields };

    if (metaAccessToken !== undefined) {
      if (metaAccessToken === null) {
        // Clear the token
        updateData.metaAccessTokenEncrypted = null;
        updateData.metaAccessTokenIv = null;
        updateData.metaAccessTokenTag = null;
      } else {
        // Re-encrypt new token value
        const { encrypted, iv, tag } = encrypt(metaAccessToken);
        updateData.metaAccessTokenEncrypted = encrypted;
        updateData.metaAccessTokenIv = iv;
        updateData.metaAccessTokenTag = tag;
      }
    }

    const updated = await db.workspace.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        domain: true,
        platform: true,
        metaPixelId: true,
        metaAccessTokenEncrypted: true,
        metaTestEventCode: true,
        consentMode: true,
        enablePageView: true,
        enableViewContent: true,
        enableAddToCart: true,
        enableInitiateCheckout: true,
        enablePurchase: true,
        isActive: true,
        eventsForwardedCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const { metaAccessTokenEncrypted, ...rest } = updated;
    return NextResponse.json({
      ...rest,
      hasMetaAccessToken: metaAccessTokenEncrypted !== null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 422 }
      );
    }
    console.error("[Workspace] Update error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  await db.workspace.update({
    where: { id },
    data: { isActive: false },
  });

  return NextResponse.json({ success: true });
}
