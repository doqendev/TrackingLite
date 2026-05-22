import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getWorkspacePixelUrl } from "@/lib/custom-ingest-domain";

function generateLoaderSnippet(pixelUrl: string): string {
  return `// Track Clear - Server-Side Event Tracking (auto-updating)
(function(){
  window.__tcAnalytics=analytics;
  window.__tcBrowser=browser;
  window.__tcInit=init;
  var s=document.createElement("script");
  s.src="${pixelUrl}";
  s.async=true;
  s.onerror=function(){console.error("[TrackClear] Pixel load failed")};
  document.head.appendChild(s);
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
    select: {
      apiKey: true,
      metaPixelId: true,
      customIngestDomain: true,
      customIngestDomainVerifiedAt: true,
    },
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const pixelUrl = getWorkspacePixelUrl(workspace, workspaceId);
  const snippet = generateLoaderSnippet(pixelUrl);

  return NextResponse.json({ snippet });
}
