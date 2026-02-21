import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  validateMeta,
  validateTikTok,
  validateGA4,
  validateKlaviyo,
  validateGoogleAds,
} from "@/lib/destinations/validate";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
      metaPixelId: true,
      metaAccessTokenEncrypted: true,
      metaAccessTokenIv: true,
      metaAccessTokenTag: true,
      googleAdsConversionIdEncrypted: true,
      googleAdsConversionIdIv: true,
      googleAdsConversionIdTag: true,
      tiktokAccessTokenEncrypted: true,
      tiktokAccessTokenIv: true,
      tiktokAccessTokenTag: true,
      ga4MeasurementId: true,
      ga4ApiSecretEncrypted: true,
      ga4ApiSecretIv: true,
      ga4ApiSecretTag: true,
      klaviyoApiKeyEncrypted: true,
      klaviyoApiKeyIv: true,
      klaviyoApiKeyTag: true,
    },
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  let body: { destination: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { destination } = body;

  switch (destination) {
    case "META": {
      if (!workspace.metaPixelId || !workspace.metaAccessTokenEncrypted) {
        return NextResponse.json({ connected: false, message: "Meta credentials not configured" });
      }
      const result = await validateMeta(
        workspace.metaPixelId,
        workspace.metaAccessTokenEncrypted,
        workspace.metaAccessTokenIv!,
        workspace.metaAccessTokenTag!
      );
      return NextResponse.json(result);
    }
    case "GOOGLE_ADS": {
      if (!workspace.googleAdsConversionIdEncrypted) {
        return NextResponse.json({ connected: false, message: "Google Ads credentials not configured" });
      }
      const result = await validateGoogleAds(
        workspace.googleAdsConversionIdEncrypted,
        workspace.googleAdsConversionIdIv!,
        workspace.googleAdsConversionIdTag!
      );
      return NextResponse.json(result);
    }
    case "TIKTOK": {
      if (!workspace.tiktokAccessTokenEncrypted) {
        return NextResponse.json({ connected: false, message: "TikTok credentials not configured" });
      }
      const result = await validateTikTok(
        workspace.tiktokAccessTokenEncrypted,
        workspace.tiktokAccessTokenIv!,
        workspace.tiktokAccessTokenTag!
      );
      return NextResponse.json(result);
    }
    case "GA4": {
      if (!workspace.ga4MeasurementId || !workspace.ga4ApiSecretEncrypted) {
        return NextResponse.json({ connected: false, message: "GA4 credentials not configured" });
      }
      const result = await validateGA4(
        workspace.ga4MeasurementId,
        workspace.ga4ApiSecretEncrypted,
        workspace.ga4ApiSecretIv!,
        workspace.ga4ApiSecretTag!
      );
      return NextResponse.json(result);
    }
    case "KLAVIYO": {
      if (!workspace.klaviyoApiKeyEncrypted) {
        return NextResponse.json({ connected: false, message: "Klaviyo credentials not configured" });
      }
      const result = await validateKlaviyo(
        workspace.klaviyoApiKeyEncrypted,
        workspace.klaviyoApiKeyIv!,
        workspace.klaviyoApiKeyTag!
      );
      return NextResponse.json(result);
    }
    default:
      return NextResponse.json({ error: "Invalid destination" }, { status: 400 });
  }
}
