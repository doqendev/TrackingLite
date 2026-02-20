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
  enableMeta: z.boolean().optional(),
  consentMode: z.enum(["STRICT", "LAX"]).optional(),
  enablePageView: z.boolean().optional(),
  enableViewContent: z.boolean().optional(),
  enableAddToCart: z.boolean().optional(),
  enableInitiateCheckout: z.boolean().optional(),
  enablePurchase: z.boolean().optional(),
  // Google Ads
  googleAdsConversionId: z.string().optional().nullable(),
  googleAdsViewContentLabel: z.string().optional().nullable(),
  googleAdsAddToCartLabel: z.string().optional().nullable(),
  googleAdsCheckoutLabel: z.string().optional().nullable(),
  googleAdsPurchaseLabel: z.string().optional().nullable(),
  enableGoogleAds: z.boolean().optional(),
  // TikTok
  tiktokPixelId: z.string().optional().nullable(),
  tiktokAccessToken: z.string().optional().nullable(),
  enableTikTok: z.boolean().optional(),
  // GA4
  ga4MeasurementId: z.string().optional().nullable(),
  ga4ApiSecret: z.string().optional().nullable(),
  enableGA4: z.boolean().optional(),
  // Klaviyo
  klaviyoApiKey: z.string().optional().nullable(),
  enableKlaviyo: z.boolean().optional(),
});

// Sensitive fields that need encryption: [inputFieldName, encryptedField, ivField, tagField]
const ENCRYPTED_FIELDS: Array<[string, string, string, string]> = [
  ["metaAccessToken", "metaAccessTokenEncrypted", "metaAccessTokenIv", "metaAccessTokenTag"],
  ["tiktokAccessToken", "tiktokAccessTokenEncrypted", "tiktokAccessTokenIv", "tiktokAccessTokenTag"],
  ["ga4ApiSecret", "ga4ApiSecretEncrypted", "ga4ApiSecretIv", "ga4ApiSecretTag"],
  ["klaviyoApiKey", "klaviyoApiKeyEncrypted", "klaviyoApiKeyIv", "klaviyoApiKeyTag"],
];

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
      metaAccessTokenEncrypted: true,
      metaTestEventCode: true,
      enableMeta: true,
      consentMode: true,
      enablePageView: true,
      enableViewContent: true,
      enableAddToCart: true,
      enableInitiateCheckout: true,
      enablePurchase: true,
      isActive: true,
      eventsForwardedCount: true,
      // Google Ads
      googleAdsConversionId: true,
      googleAdsViewContentLabel: true,
      googleAdsAddToCartLabel: true,
      googleAdsCheckoutLabel: true,
      googleAdsPurchaseLabel: true,
      enableGoogleAds: true,
      // TikTok
      tiktokPixelId: true,
      tiktokAccessTokenEncrypted: true,
      enableTikTok: true,
      // GA4
      ga4MeasurementId: true,
      ga4ApiSecretEncrypted: true,
      enableGA4: true,
      // Klaviyo
      klaviyoApiKeyEncrypted: true,
      enableKlaviyo: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Replace encrypted tokens with boolean flags
  const {
    metaAccessTokenEncrypted,
    tiktokAccessTokenEncrypted,
    ga4ApiSecretEncrypted,
    klaviyoApiKeyEncrypted,
    ...rest
  } = workspace;

  return NextResponse.json({
    ...rest,
    hasMetaAccessToken: metaAccessTokenEncrypted !== null,
    hasTiktokAccessToken: tiktokAccessTokenEncrypted !== null,
    hasGA4ApiSecret: ga4ApiSecretEncrypted !== null,
    hasKlaviyoApiKey: klaviyoApiKeyEncrypted !== null,
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

    // Separate sensitive token fields from scalar fields
    const sensitiveFieldNames = ENCRYPTED_FIELDS.map(([inputName]) => inputName);
    const scalarFields: Record<string, unknown> = {};
    const sensitiveValues: Record<string, string | null | undefined> = {};

    for (const [key, value] of Object.entries(data)) {
      if (sensitiveFieldNames.includes(key)) {
        sensitiveValues[key] = value as string | null | undefined;
      } else {
        scalarFields[key] = value;
      }
    }

    // Build the update payload
    const updateData: Record<string, unknown> = { ...scalarFields };

    // Handle encryption for each sensitive field
    for (const [inputName, encField, ivField, tagField] of ENCRYPTED_FIELDS) {
      const value = sensitiveValues[inputName];
      if (value === undefined) continue;

      if (value === null) {
        // Clear the encrypted fields
        updateData[encField] = null;
        updateData[ivField] = null;
        updateData[tagField] = null;
      } else {
        // Encrypt and store
        const { encrypted, iv, tag } = encrypt(value);
        updateData[encField] = encrypted;
        updateData[ivField] = iv;
        updateData[tagField] = tag;
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
        enableMeta: true,
        consentMode: true,
        enablePageView: true,
        enableViewContent: true,
        enableAddToCart: true,
        enableInitiateCheckout: true,
        enablePurchase: true,
        isActive: true,
        eventsForwardedCount: true,
        // Google Ads
        googleAdsConversionId: true,
        googleAdsViewContentLabel: true,
        googleAdsAddToCartLabel: true,
        googleAdsCheckoutLabel: true,
        googleAdsPurchaseLabel: true,
        enableGoogleAds: true,
        // TikTok
        tiktokPixelId: true,
        tiktokAccessTokenEncrypted: true,
        enableTikTok: true,
        // GA4
        ga4MeasurementId: true,
        ga4ApiSecretEncrypted: true,
        enableGA4: true,
        // Klaviyo
        klaviyoApiKeyEncrypted: true,
        enableKlaviyo: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const {
      metaAccessTokenEncrypted,
      tiktokAccessTokenEncrypted,
      ga4ApiSecretEncrypted,
      klaviyoApiKeyEncrypted,
      ...rest
    } = updated;

    return NextResponse.json({
      ...rest,
      hasMetaAccessToken: metaAccessTokenEncrypted !== null,
      hasTiktokAccessToken: tiktokAccessTokenEncrypted !== null,
      hasGA4ApiSecret: ga4ApiSecretEncrypted !== null,
      hasKlaviyoApiKey: klaviyoApiKeyEncrypted !== null,
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
