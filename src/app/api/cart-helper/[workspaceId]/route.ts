import { generateShopifyCartAttributionHelperCode } from "@/lib/shopify-cart-attribution-helper";
import { db } from "@/lib/db";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;

  const workspace = await db.workspace.findFirst({
    where: { id: workspaceId, isActive: true },
    select: { id: true },
  });

  if (!workspace) {
    return new Response("// TrackClear cart helper: workspace not found", {
      status: 404,
      headers: { "Content-Type": "text/javascript", ...corsHeaders },
    });
  }

  return new Response(generateShopifyCartAttributionHelperCode(workspace.id), {
    status: 200,
    headers: {
      "Content-Type": "text/javascript",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      ...corsHeaders,
    },
  });
}
