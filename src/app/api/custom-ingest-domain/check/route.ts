import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");

  return NextResponse.json(
    {
      service: "trackclear-custom-ingest",
      ok: true,
      workspaceId,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-TrackClear-Custom-Ingest": "ok",
      },
    }
  );
}

