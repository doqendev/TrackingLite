import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { invalidateApiKeyCache } from "@/lib/api-key-cache";
import { invalidateWorkspaceCache } from "@/lib/workspace-cache";
import { z } from "zod";
import { createLogger } from "@/lib/logger";
import { resolveShopifyDomain } from "@/lib/shopify-domain-resolver";

const log = createLogger({ component: "workspaces-id" });

const UpdateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  domain: z.string().optional().nullable(),
  metaPixelId: z.string().regex(/^\d+$/, "Pixel ID must be numeric").optional().nullable(),
  metaAccessToken: z.string().optional().nullable(),
  metaTestEventCode: z.string().optional().nullable(),
  enableMeta: z.boolean().optional(),
  consentMode: z.enum(["STRICT", "LAX"]).optional(),
  enablePageView: z.boolean().optional(),
  enableViewContent: z.boolean().optional(),
  enableAddToCart: z.boolean().optional(),
  enableInitiateCheckout: z.boolean().optional(),
  enablePurchase: z.boolean().optional(),
  isActive: z.boolean().optional(),
  // Reddit
  redditAccountId: z.string().regex(/^[A-Za-z0-9_-]+$/, "Invalid Account ID format").optional().nullable(),
  redditAccessToken: z.string().optional().nullable(),
  enableReddit: z.boolean().optional(),
  // Pinterest
  pinterestAdAccountId: z.string().regex(/^[A-Za-z0-9]+$/, "Invalid Ad Account ID format").optional().nullable(),
  pinterestConversionToken: z.string().optional().nullable(),
  enablePinterest: z.boolean().optional(),
  // TikTok
  tiktokPixelId: z.string().regex(/^[A-Za-z0-9_-]+$/, "Invalid Pixel ID format").optional().nullable(),
  tiktokAccessToken: z.string().optional().nullable(),
  enableTikTok: z.boolean().optional(),
  // GA4
  ga4MeasurementId: z.string().regex(/^G-[A-Za-z0-9]+$/, "Must be format G-XXXXXXX").optional().nullable(),
  ga4ApiSecret: z.string().optional().nullable(),
  enableGA4: z.boolean().optional(),
  // Klaviyo
  klaviyoApiKey: z.string().optional().nullable(),
  enableKlaviyo: z.boolean().optional(),
  // Shopify webhook
  shopifyWebhookSecret: z.string().optional().nullable(),
});

// Sensitive fields that need encryption: [inputFieldName, encryptedField, ivField, tagField]
const ENCRYPTED_FIELDS: Array<[string, string, string, string]> = [
  ["metaAccessToken", "metaAccessTokenEncrypted", "metaAccessTokenIv", "metaAccessTokenTag"],
  ["tiktokAccessToken", "tiktokAccessTokenEncrypted", "tiktokAccessTokenIv", "tiktokAccessTokenTag"],
  ["ga4ApiSecret", "ga4ApiSecretEncrypted", "ga4ApiSecretIv", "ga4ApiSecretTag"],
  ["klaviyoApiKey", "klaviyoApiKeyEncrypted", "klaviyoApiKeyIv", "klaviyoApiKeyTag"],
  ["redditAccessToken", "redditAccessTokenEncrypted", "redditAccessTokenIv", "redditAccessTokenTag"],
  ["pinterestConversionToken", "pinterestConversionTokenEncrypted", "pinterestConversionTokenIv", "pinterestConversionTokenTag"],
  ["shopifyWebhookSecret", "shopifyWebhookSecretEncrypted", "shopifyWebhookSecretIv", "shopifyWebhookSecretTag"],
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
      // Reddit
      redditAccountId: true,
      redditAccessTokenEncrypted: true,
      enableReddit: true,
      // Pinterest
      pinterestAdAccountId: true,
      pinterestConversionTokenEncrypted: true,
      enablePinterest: true,
      // Shopify webhook
      shopifyDomain: true,
      shopifyWebhookSecretEncrypted: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Replace encrypted fields with boolean flags
  const {
    metaAccessTokenEncrypted,
    tiktokAccessTokenEncrypted,
    ga4ApiSecretEncrypted,
    klaviyoApiKeyEncrypted,
    redditAccessTokenEncrypted,
    pinterestConversionTokenEncrypted,
    shopifyWebhookSecretEncrypted,
    ...rest
  } = workspace;

  return NextResponse.json({
    ...rest,
    hasMetaAccessToken: metaAccessTokenEncrypted !== null,
    hasTiktokAccessToken: tiktokAccessTokenEncrypted !== null,
    hasGA4ApiSecret: ga4ApiSecretEncrypted !== null,
    hasKlaviyoApiKey: klaviyoApiKeyEncrypted !== null,
    hasRedditAccessToken: redditAccessTokenEncrypted !== null,
    hasPinterestConversionToken: pinterestConversionTokenEncrypted !== null,
    hasShopifyWebhookSecret: shopifyWebhookSecretEncrypted !== null,
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

    // Re-resolve shopifyDomain if domain is being updated
    // shopifyDomain is server-computed only — never accepted from client input
    let resolvedShopifyDomain: string | null | undefined = undefined; // undefined = no change
    if (data.domain !== undefined) {
      if (data.domain) {
        const resolved = await resolveShopifyDomain(data.domain);
        if (resolved) {
          const existing = await db.workspace.findFirst({
            where: {
              shopifyDomain: resolved.shopifyDomain,
              isActive: true,
              id: { not: id },
            },
          });
          if (existing) {
            return NextResponse.json(
              { error: "This Shopify store is already registered", code: "DOMAIN_TAKEN" },
              { status: 409 }
            );
          }
          resolvedShopifyDomain = resolved.shopifyDomain;
        } else {
          // Not a Shopify store or couldn't resolve — clear shopifyDomain
          resolvedShopifyDomain = null;
        }
      } else {
        // Domain cleared — also clear shopifyDomain
        resolvedShopifyDomain = null;
      }
    }

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

    // Add server-computed shopifyDomain if domain was updated
    if (resolvedShopifyDomain !== undefined) {
      updateData.shopifyDomain = resolvedShopifyDomain;
    }

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

    // Require a verified Shopify domain before a webhook secret can be saved
    if (updateData.shopifyWebhookSecretEncrypted !== undefined) {
      const currentWorkspace = await db.workspace.findUnique({
        where: { id },
        select: { shopifyDomain: true },
      });
      if (!currentWorkspace?.shopifyDomain) {
        return NextResponse.json(
          { error: "Cannot save webhook secret without a verified Shopify domain. Please add your store URL first." },
          { status: 400 }
        );
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
        // Reddit
        redditAccountId: true,
        redditAccessTokenEncrypted: true,
        enableReddit: true,
        // Pinterest
        pinterestAdAccountId: true,
        pinterestConversionTokenEncrypted: true,
        enablePinterest: true,
        // Shopify webhook
        shopifyDomain: true,
        shopifyWebhookSecretEncrypted: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Invalidate API key cache so ingest route picks up changes immediately
    await invalidateApiKeyCache(workspace.apiKey).catch(() => {});
    invalidateWorkspaceCache(id);

    const {
      metaAccessTokenEncrypted,
      tiktokAccessTokenEncrypted,
      ga4ApiSecretEncrypted,
      klaviyoApiKeyEncrypted,
      redditAccessTokenEncrypted,
      pinterestConversionTokenEncrypted,
      shopifyWebhookSecretEncrypted: updatedShopifyWebhookSecretEncrypted,
      ...rest
    } = updated;

    return NextResponse.json({
      ...rest,
      hasMetaAccessToken: metaAccessTokenEncrypted !== null,
      hasTiktokAccessToken: tiktokAccessTokenEncrypted !== null,
      hasGA4ApiSecret: ga4ApiSecretEncrypted !== null,
      hasKlaviyoApiKey: klaviyoApiKeyEncrypted !== null,
      hasRedditAccessToken: redditAccessTokenEncrypted !== null,
      hasPinterestConversionToken: pinterestConversionTokenEncrypted !== null,
      hasShopifyWebhookSecret: updatedShopifyWebhookSecretEncrypted !== null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 422 }
      );
    }
    log.error("Workspace update failed", { error: error instanceof Error ? error.message : String(error) });
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
    select: { id: true, apiKey: true },
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  await db.workspace.update({
    where: { id },
    data: { isActive: false },
  });

  await invalidateApiKeyCache(workspace.apiKey).catch(() => {});
  invalidateWorkspaceCache(id);

  return NextResponse.json({ success: true });
}
