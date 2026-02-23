import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkAuthRateLimit } from "@/lib/rate-limit";
import { sendVerificationEmail } from "@/lib/email";
import { createLogger } from "@/lib/logger";

const log = createLogger({ component: "signup" });

const SignupSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rl = await checkAuthRateLimit(ip, "signup", 3, 60);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const body = await request.json();
    const { name, email: rawEmail, password } = SignupSchema.parse(body);
    const normalizedEmail = rawEmail.toLowerCase().trim();

    const existingUser = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const hashedPassword = await hash(password, 12);

    const user = await db.user.create({
      data: { name, email: normalizedEmail, hashedPassword },
    });

    // Send verification email (fire-and-forget, don't block signup)
    try {
      const verificationToken = crypto.randomUUID();
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await db.verificationToken.create({
        data: {
          identifier: normalizedEmail,
          token: verificationToken,
          expires,
        },
      });

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const verifyUrl = `${appUrl}/api/auth/verify-email?token=${verificationToken}`;

      await sendVerificationEmail(normalizedEmail, verifyUrl);
    } catch (emailErr) {
      // Log but don't fail signup
      log.error("Failed to send verification email", { error: emailErr instanceof Error ? emailErr.message : String(emailErr) });
    }

    return NextResponse.json(
      { id: user.id, email: user.email, name: user.name },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 422 });
    }
    log.error("Signup failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
