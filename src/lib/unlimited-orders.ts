/**
 * Internal accounts that must never be capped by the monthly order limit.
 *
 * This mirrors the existing `LEGACY_WORKSPACE_IDS` pattern: an explicit,
 * auditable environment allowlist rather than schema or Stripe state. That
 * choice is deliberate. A plan change cannot silently re-cap these accounts, a
 * Stripe subscription webhook cannot overwrite the exemption, and no enum
 * migration is required. Usage is still counted for these users; it just never
 * blocks delivery.
 */
export function getUnlimitedOrderUserIds(): Set<string> {
  return new Set(
    (process.env.UNLIMITED_ORDER_USER_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

export function hasUnlimitedOrders(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return getUnlimitedOrderUserIds().has(userId);
}
