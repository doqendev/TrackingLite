"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

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
            Invalid reset link. Please request a new password reset.
          </AlertDescription>
        </Alert>
        <Link
          href="/forgot-password"
          className="block text-center text-sm font-medium text-brand-500 hover:text-brand-400"
        >
          Request new reset link
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
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
        throw new Error(data.error || "Something went wrong");
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="space-y-6">
        <Alert className="border-green-500/30 bg-green-500/10">
          <AlertDescription className="text-center text-green-200">
            Password reset successfully. You can now log in with your new password.
          </AlertDescription>
        </Alert>
        <Link
          href="/login"
          className="block text-center text-sm font-medium text-brand-500 hover:text-brand-400"
        >
          Go to Login
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
        <Label htmlFor="password" className="mb-1">New password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          required
          minLength={8}
          autoFocus
        />
      </div>
      <div>
        <Label htmlFor="confirmPassword" className="mb-1">Confirm password</Label>
        <Input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Re-enter your password"
          required
          minLength={8}
        />
      </div>
      <Button type="submit" variant="brand" className="w-full" disabled={submitting}>
        {submitting ? "Resetting..." : "Reset password"}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="rounded-2xl bg-card px-8 py-10 shadow-lg ring-1 ring-white/[0.06] glow-card border-t-2 border-brand-500/40">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          <span className="text-brand-500">Track</span>&thinsp;Clear
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Set a new password</p>
      </div>
      <Suspense fallback={<p className="text-center text-sm text-muted-foreground">Loading...</p>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
