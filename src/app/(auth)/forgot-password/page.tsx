"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Something went wrong");
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl bg-card px-8 py-10 shadow-lg ring-1 ring-white/[0.06] glow-card border-t-2 border-brand-500/40">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          <span className="text-brand-500">Track</span>&thinsp;Clear
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Reset your password</p>
      </div>

      {submitted ? (
        <div className="space-y-6">
          <Alert className="border-green-500/30 bg-green-500/10">
            <AlertDescription className="text-center text-green-200">
              If an account exists with that email, we sent a reset link. Check your inbox.
            </AlertDescription>
          </Alert>
          <Link
            href="/login"
            className="block text-center text-sm font-medium text-brand-500 hover:text-brand-400"
          >
            Back to Login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert className="border-red-500/30 bg-red-500/10">
              <AlertDescription className="text-center text-red-200">{error}</AlertDescription>
            </Alert>
          )}
          <div>
            <Label htmlFor="email" className="mb-1">Email address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>
          <Button type="submit" variant="brand" className="w-full" disabled={submitting}>
            {submitting ? "Sending..." : "Send reset link"}
          </Button>
          <div className="space-y-2 pt-2">
            <Link
              href="/login"
              className="block text-center text-sm font-medium text-brand-500 hover:text-brand-400"
            >
              Back to Login
            </Link>
            <Link
              href="/signup"
              className="block text-center text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Create a new account
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
