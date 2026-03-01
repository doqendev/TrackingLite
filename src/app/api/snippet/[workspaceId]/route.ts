import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

function generateLoaderSnippet(pixelUrl: string): string {
  return `// Track Clear - Server-Side Event Tracking (auto-updating)
(async function(){
try{var r=await fetch("${pixelUrl}");if(!r.ok)throw new Error(r.status);var c=await r.text();new Function("analytics","browser","init",c)(analytics,browser,init)}catch(e){console.error("[TrackClear] Pixel load failed",e)}
})();`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId } = await params;

  const workspace = await db.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id, isActive: true },
    select: { apiKey: true, metaPixelId: true },
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://trackclear.io";

  const pixelUrl = `${appUrl}/api/pixel/${workspaceId}`;
  const snippet = generateLoaderSnippet(pixelUrl);

  return NextResponse.json({ snippet });
}
