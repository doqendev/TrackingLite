import { BILLING_PLANS } from "@/lib/constants";

/** Account-level allowance for owned stores; independent of Stripe/order limits. */
export function workspaceLimit(userId: string, plan: keyof typeof BILLING_PLANS): number {
  const internalOwners = new Set((process.env.UNLIMITED_WORKSPACE_USER_IDS ?? "")
    .split(",").map(id => id.trim()).filter(Boolean));
  return internalOwners.has(userId) ? Infinity : BILLING_PLANS[plan]?.maxWorkspaces ?? 1;
}
