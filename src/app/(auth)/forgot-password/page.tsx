import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ForgotPasswordPage() {
  return (
    <div className="rounded-2xl bg-card px-8 py-10 shadow-lg ring-1 ring-white/[0.06]">
      {/* Branding */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">TrackingLite</h1>
        <p className="mt-1 text-sm text-muted-foreground">Reset your password</p>
      </div>

      <div className="space-y-6">
        <Alert className="border-amber-500/30 bg-amber-500/10">
          <AlertDescription className="text-center text-amber-200">
            Password reset is not yet available. Please contact support or create a new account.
          </AlertDescription>
        </Alert>
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
    </div>
  );
}
