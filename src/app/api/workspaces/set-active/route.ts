import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { cookies } from "next/headers";
import { z } from "zod";

const SetActiveSchema = z.object({
  workspaceId: z.string().min(1),
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
    return NextResponse.json({ error: "Invalid JSON" }, { status: 422 });
  }

  const parsed = SetActiveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 422 });
  }

  // Verify workspace belongs to user and is active
  const workspace = await db.workspace.findFirst({
    where: { id: parsed.data.workspaceId, userId: session.user.id, isActive: true },
    select: { id: true },
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const cookieStore = await cookies();
  cookieStore.set("activeWorkspaceId", workspace.id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 365 * 24 * 60 * 60, // 1 year
  });

  return NextResponse.json({ success: true });
}
