import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const updateSchema = z.object({
  trackingDown: z.boolean(),
  highErrorRate: z.boolean(),
  orderLimitWarning: z.boolean(),
  orderLimitReached: z.boolean(),
});

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Return existing preference or create default
  const pref = await db.alertPreference.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });

  return NextResponse.json(pref);
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const pref = await db.alertPreference.upsert({
    where: { userId },
    create: { userId, ...parsed.data },
    update: parsed.data,
  });

  return NextResponse.json(pref);
}
