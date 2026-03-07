"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const t = useTranslations("auth");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  if (!token) {
    return (
      <div className="space-y-6">
        <Alert className="border-red-500/30 bg-red-500/10">
          <AlertDescription className="text-center text-red-200">
            {t("invalidToken")}
          </AlertDescription>
        </Alert>
        <Link
          href="/forgot-password"
          className="block text-center text-sm font-medium text-cyan-500 hover:text-cyan-400"
        >
          {t("sendResetLink")}
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError(t("passwordsNoMatch"));
      return;
    }

    if (password.length < 8) {
      setError(t("passwordMinLength"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t("somethingWentWrong"));
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("somethingWentWrong"));
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="space-y-6">
        <Alert className="border-green-500/30 bg-green-500/10">
          <AlertDescription className="text-center text-green-200">
            {t("passwordResetSuccess")}
          </AlertDescription>
        </Alert>
        <Link
          href="/login"
          className="block text-center text-sm font-medium text-cyan-500 hover:text-cyan-400"
        >
          {t("signIn")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert className="border-red-500/30 bg-red-500/10">
          <AlertDescription className="text-center text-red-200">{error}</AlertDescription>
        </Alert>
      )}
      <div>
        <Label htmlFor="password" className="mb-1 text-xs tracking-wider uppercase text-muted-foreground">{t("newPassword")}</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Min. 8 characters"
          required
          minLength={8}
          autoFocus
        />
      </div>
      <div>
        <Label htmlFor="confirmPassword" className="mb-1 text-xs tracking-wider uppercase text-muted-foreground">{t("confirmNewPassword")}</Label>
        <Input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="••••••••"
          required
          minLength={8}
        />
      </div>
      <Button type="submit" variant="brand" className="w-full" disabled={submitting}>
        {submitting ? t("resetting") : t("resetPasswordBtn")}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");

  return (
    <div className="scanlines bg-card border border-[hsl(240,26%,15%)] px-8 py-10 shadow-lg glow-card border-t-2 border-t-cyan-500/40">
      <div className="mb-8 text-center">
        <div className="mb-3 flex items-center justify-center gap-2">
          <img src="/logo.png" alt="" width={24} height={24} className="w-6 h-6" />
          <h1 className="font-display text-2xl font-bold tracking-wider uppercase text-foreground">
            <span className="text-cyan-500">TRACK</span> {"// "}CLEAR
          </h1>
        </div>
        <p className="mt-1 text-xs tracking-wider uppercase text-muted-foreground">{t("resetPassword")}</p>
      </div>
      <Suspense fallback={<p className="text-center text-sm text-muted-foreground">{tc("loading")}</p>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
