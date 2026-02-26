import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const preferencesSchema = z.object({
  displayCurrency: z.string().length(3).toUpperCase().optional(),
  language: z.enum(["en", "pt", "es", "fr", "de", "it"]).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { displayCurrency: true, language: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(user);
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = preferencesSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data: Record<string, string> = {};
  if (parsed.data.displayCurrency) data.displayCurrency = parsed.data.displayCurrency;
  if (parsed.data.language) data.language = parsed.data.language;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  try {
    const user = await db.user.update({
      where: { id: session.user.id },
      data,
      select: { displayCurrency: true, language: true },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error("User preferences PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
