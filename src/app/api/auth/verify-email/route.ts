import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const log = createLogger({ component: "verify-email" });

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing-token", request.url));
  }

  try {
    const verificationToken = await db.verificationToken.findUnique({
      where: { token },
    });

    if (!verificationToken) {
      return NextResponse.redirect(new URL("/login?error=invalid-token", request.url));
    }

    if (verificationToken.expires < new Date()) {
      // Clean up expired token
      await db.verificationToken.delete({ where: { token } });
      return NextResponse.redirect(new URL("/login?error=expired-token", request.url));
    }

    // Mark user as verified
    await db.user.updateMany({
      where: { email: verificationToken.identifier },
      data: { emailVerified: new Date() },
    });

    // Clean up used token
    await db.verificationToken.delete({ where: { token } });

    return NextResponse.redirect(new URL("/login?verified=true", request.url));
  } catch (error) {
    log.error("Email verification failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.redirect(new URL("/login?error=verification-failed", request.url));
  }
}
