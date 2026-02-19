import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";
import { randomBytes } from "crypto";
import { z } from "zod";

const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = ForgotPasswordSchema.parse(body);

    // Always return success to prevent email enumeration
    const successResponse = NextResponse.json({
      message: "If an account exists with that email, a reset link has been sent.",
    });

    // Find user
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, hashedPassword: true },
    });

    // Only send reset for users with passwords (not OAuth-only)
    if (!user || !user.hashedPassword) {
      return successResponse;
    }

    // Generate secure token
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Delete any existing unused tokens for this user
    await db.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    // Create new token
    await db.passwordResetToken.create({
      data: { token, userId: user.id, expiresAt },
    });

    // Build reset URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const resetUrl = `${appUrl}/reset-password?token=${token}`;

    // Send email (don't fail the request if email fails)
    try {
      await sendPasswordResetEmail(user.email, resetUrl);
    } catch (emailError) {
      console.error("[ForgotPassword] Failed to send email:", emailError);
    }

    return successResponse;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 422 });
    }
    console.error("[ForgotPassword] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
