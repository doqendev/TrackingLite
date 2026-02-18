import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

function generateSnippet(workspaceId: string, pixelScriptUrl: string): string {
  return `!function(d){var s=d.createElement("script");s.async=!0;s.src="${pixelScriptUrl}/api/s/${workspaceId}";d.head.appendChild(s)}(document);`;
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
    select: { id: true },
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://trackinglite-production.up.railway.app";

  const snippet = generateSnippet(workspace.id, appUrl);

  return NextResponse.json({ snippet });
}
