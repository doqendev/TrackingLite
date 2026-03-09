/**
 * Admin access control via ADMIN_EMAILS environment variable.
 * No schema migration needed — just set ADMIN_EMAILS in .env / Vercel env vars.
 */
export function isAdminUser(email: string | null | undefined): boolean {
  if (!email) return false;
  const adminEmails = process.env.ADMIN_EMAILS ?? "";
  if (!adminEmails) return false;
  const allowlist = adminEmails.split(",").map((e) => e.trim().toLowerCase());
  return allowlist.includes(email.toLowerCase());
}
