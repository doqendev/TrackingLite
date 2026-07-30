import { db } from "@/lib/db";
import { BILLING_PLANS, AUTO_UPGRADE_MAP, PLAN_PRICE_MAP } from "@/lib/constants";
import { getStripe } from "@/lib/stripe";
import { createLogger } from "@/lib/logger";
import { getSharedRedis } from "@/lib/redis";
import { createHash } from "crypto";

const log = createLogger({ component: "billing" });
const BILLING_TTL_SECONDS = 35 * 24 * 60 * 60;

export interface PurchaseBillingIdentity {
  workspaceId: string;
  eventId: string;
  /** Additional normalized order/checkout/cart aliases for cross-source races. */
  aliases?: Array<string | null | undefined>;
}

export interface PurchaseBillingReservation {
  counterKey: string;
  seenKeys: string[];
}

export interface PurchaseOutboxIdentity {
  workspaceId: string;
  eventId: string;
  orderId?: string | null;
  orderName?: string | null;
  checkoutToken?: string | null;
  cartToken?: string | null;
}

export type PurchaseBillingRecoveryResult =
  | "outbox-present"
  | "released"
  | "release-unconfirmed"
  | "retained-unknown";

const RESERVE_PURCHASE_SCRIPT = `
local counterKey = KEYS[1]
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])

for keyIndex = 2, #KEYS do
  if redis.call("EXISTS", KEYS[keyIndex]) == 1 then
    for markerIndex = 2, #KEYS do
      redis.call("SET", KEYS[markerIndex], "1", "EX", ttl)
    end
    return {0, tonumber(redis.call("GET", counterKey) or "0")}
  end
end

local nextCount = redis.call("INCR", counterKey)
redis.call("EXPIRE", counterKey, ttl)
if nextCount <= limit then
  for keyIndex = 2, #KEYS do
    redis.call("SET", KEYS[keyIndex], "1", "EX", ttl)
  end
  return {1, nextCount}
end

redis.call("DECR", counterKey)
return {-1, nextCount - 1}
`;

const RELEASE_PURCHASE_SCRIPT = `
local counterKey = KEYS[1]
local removed = 0
for keyIndex = 2, #KEYS do
  removed = removed + redis.call("DEL", KEYS[keyIndex])
end
if removed == 0 then
  return 0
end

local current = tonumber(redis.call("GET", counterKey) or "0")
if current > 0 then
  redis.call("DECR", counterKey)
end
return 1
`;

// Restore the durable database count and every hashed identity marker in one
// Redis operation. The counter is a floor: reconciliation may repair Redis
// loss, but never writes a value below the live counter it observes. Writing
// the markers in the same script also closes the window where a replay could
// increment the repaired counter before its alias is seen.
const RECONCILE_PURCHASE_SCRIPT = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0") or 0
local durableFloor = tonumber(ARGV[1]) or 0
local ttl = tonumber(ARGV[2])
local reconciled = current

if durableFloor > current then
  reconciled = durableFloor
  redis.call("SET", KEYS[1], tostring(reconciled), "EX", ttl)
elseif current > 0 then
  redis.call("EXPIRE", KEYS[1], ttl)
end

for keyIndex = 2, #KEYS do
  redis.call("SET", KEYS[keyIndex], "1", "EX", ttl)
end

return {current, reconciled, #KEYS - 1}
`;

function purchaseBillingKeys(
  userId: string,
  monthKey: string,
  identity: PurchaseBillingIdentity
): PurchaseBillingReservation {
  const identityHashes = Array.from(
    new Set(
      [identity.eventId, ...(identity.aliases ?? [])]
        .filter((value): value is string => typeof value === "string" && value.trim() !== "")
        .map((value) =>
          createHash("sha256")
            .update(`${identity.workspaceId}:${value.trim()}`)
            .digest("hex")
        )
    )
  );
  return {
    counterKey: `orders:${userId}:${monthKey}`,
    seenKeys: identityHashes.map(
      (identityHash) => `orders:seen:${userId}:${monthKey}:${identityHash}`
    ),
  };
}

export interface PurchaseBillingReconciliationResult {
  previousCount: number;
  reconciledCount: number;
  markerCount: number;
}

/**
 * Rebuild the current month's Purchase counter and dedup markers from durable
 * EventLog identities. `identities` should contain one connected identity per
 * real order, with every observed event ID and Shopify alias represented.
 */
export async function reconcilePurchaseBillingState(
  userId: string,
  monthKey: string,
  identities: PurchaseBillingIdentity[]
): Promise<PurchaseBillingReconciliationResult> {
  const counterKey = `orders:${userId}:${monthKey}`;
  const markerKeys = Array.from(
    new Set(
      identities.flatMap((identity) =>
        purchaseBillingKeys(userId, monthKey, identity).seenKeys
      )
    )
  );

  // A durable identity always has an event ID, so a non-zero floor without a
  // marker would indicate a caller bug and would recreate the duplicate-charge
  // window this function exists to prevent.
  if (identities.length > 0 && markerKeys.length === 0) {
    throw new Error("Purchase billing reconciliation requires identity markers");
  }

  const result = await getSharedRedis().eval(
    RECONCILE_PURCHASE_SCRIPT,
    1 + markerKeys.length,
    counterKey,
    ...markerKeys,
    String(identities.length),
    String(BILLING_TTL_SECONDS)
  );
  if (!Array.isArray(result) || result.length !== 3) {
    throw new Error("Invalid purchase billing reconciliation response");
  }

  const previousCount = Number(result[0]);
  const reconciledCount = Number(result[1]);
  const markerCount = Number(result[2]);
  if (
    !Number.isFinite(previousCount) ||
    !Number.isFinite(reconciledCount) ||
    !Number.isFinite(markerCount)
  ) {
    throw new Error("Invalid purchase billing reconciliation values");
  }

  return { previousCount, reconciledCount, markerCount };
}

async function reservePurchaseBillingUnit(
  userId: string,
  monthKey: string,
  identity: PurchaseBillingIdentity,
  limit: number
): Promise<{ duplicate: boolean; blocked: boolean; count: number }> {
  const { counterKey, seenKeys } = purchaseBillingKeys(userId, monthKey, identity);
  const result = await getSharedRedis().eval(
    RESERVE_PURCHASE_SCRIPT,
    1 + seenKeys.length,
    counterKey,
    ...seenKeys,
    String(limit),
    String(BILLING_TTL_SECONDS)
  );
  if (!Array.isArray(result) || result.length !== 2) {
    throw new Error("Invalid purchase billing reservation response");
  }
  const status = Number(result[0]);
  const count = Number(result[1]);
  if (!Number.isFinite(status) || !Number.isFinite(count)) {
    throw new Error("Invalid purchase billing reservation values");
  }
  return { duplicate: status === 0, blocked: status === -1, count };
}

export interface BillingCheck {
  allowed: boolean;
  reason?: string;
  limit?: number;
  used?: number;
  upgraded?: boolean;
  newPlan?: string;
  /** Internal compensation token; never contains the raw Purchase identity. */
  reservation?: PurchaseBillingReservation;
}

/**
 * Compensate a newly-created Redis usage reservation when no durable outbox row
 * could be committed. The Lua script is idempotent, so duplicate cleanup calls
 * cannot decrement the monthly counter twice.
 */
export async function rollbackPurchaseBillingReservation(
  reservation: PurchaseBillingReservation
): Promise<boolean> {
  try {
    const released = await getSharedRedis().eval(
      RELEASE_PURCHASE_SCRIPT,
      1 + reservation.seenKeys.length,
      reservation.counterKey,
      ...reservation.seenKeys
    );
    return Number(released) === 1;
  } catch (error) {
    log.error("Failed to roll back orphaned purchase billing reservation", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Compensate a reservation only after proving that neither this event ID nor
 * any cross-source Purchase alias reached the durable EventLog outbox. A
 * failed/ambiguous database probe deliberately retains the reservation: it is
 * safer to reconcile a quota unit later than to undercount an outbox row that
 * may already be deliverable.
 */
export async function recoverPurchaseBillingReservationAfterOutboxFailure(
  reservation: PurchaseBillingReservation,
  identity: PurchaseOutboxIdentity
): Promise<PurchaseBillingRecoveryResult> {
  const aliasPredicates = [
    { eventId: identity.eventId },
    ...(identity.orderId ? [{ orderId: identity.orderId }] : []),
    ...(identity.orderName ? [{ orderName: identity.orderName }] : []),
    ...(identity.checkoutToken
      ? [{ checkoutToken: identity.checkoutToken }]
      : []),
    ...(identity.cartToken ? [{ cartToken: identity.cartToken }] : []),
  ];

  let durableOutbox: { id: string } | null;
  try {
    durableOutbox = await db.eventLog.findFirst({
      where: {
        workspaceId: identity.workspaceId,
        eventName: "Purchase",
        destination: { not: "INTERNAL" },
        OR: aliasPredicates,
      },
      select: { id: true },
    });
  } catch (error) {
    log.error("Unable to prove Purchase outbox absence; retaining billing reservation", {
      workspaceId: identity.workspaceId,
      error: error instanceof Error ? error.message : String(error),
    });
    return "retained-unknown";
  }

  if (durableOutbox) return "outbox-present";
  return (await rollbackPurchaseBillingReservation(reservation))
    ? "released"
    : "release-unconfirmed";
}

/**
 * Check if a Purchase event is allowed for this user, and atomically increment
 * the order count if allowed. Non-Purchase events are always allowed (free & unlimited).
 *
 * Uses INCR-first pattern to eliminate TOCTOU race conditions:
 * 1. INCR the counter atomically
 * 2. If new count is within limit: allowed (count already incremented)
 * 3. If over limit: DECR to rollback, then attempt auto-upgrade
 * 4. If auto-upgrade succeeds: INCR again and allow
 * 5. Otherwise: return blocked
 *
 * Callers must NOT call incrementOrderCount separately for Purchase events.
 */
export async function checkOrderLimits(
  userId: string,
  eventName: string,
  purchaseIdentity?: PurchaseBillingIdentity
): Promise<BillingCheck> {
  // Non-Purchase events are always free — no increment needed
  if (eventName !== "Purchase") {
    return { allowed: true };
  }

  let subscription;
  try {
    subscription = await db.subscription.findUnique({
      where: { userId },
    });
  } catch (error) {
    log.error("Failed to check subscription for order limits", { userId, error: error instanceof Error ? error.message : String(error) });
    return { allowed: true, used: 0, limit: Infinity };
  }

  // No subscription record = FREE plan
  const plan = subscription?.plan ?? "FREE";
  const status = subscription?.status ?? "ACTIVE";

  // CANCELED, UNPAID: Block all Purchase events
  if (status === "CANCELED" || status === "UNPAID") {
    return { allowed: false, reason: "Subscription inactive" };
  }

  // PAST_DUE: Allow with a 7-day grace period for payment recovery
  if (status === "PAST_DUE") {
    const sub = await db.subscription.findUnique({
      where: { userId },
      select: { updatedAt: true },
    });
    const gracePeriodMs = 7 * 24 * 60 * 60 * 1000;
    if (sub && Date.now() - sub.updatedAt.getTime() > gracePeriodMs) {
      return {
        allowed: false,
        reason: "Payment past due for more than 7 days. Please update your payment method.",
        limit: 0,
        used: 0,
      };
    }
    if (purchaseIdentity) {
      const monthKey = new Date().toISOString().slice(0, 7);
      const reservation = await reservePurchaseBillingUnit(
        userId,
        monthKey,
        purchaseIdentity,
        Number.MAX_SAFE_INTEGER
      ).catch(() => {
        log.error("Redis error for billing reservation, failing open", { userId });
        return null;
      });
      return {
        allowed: true,
        ...(reservation && !reservation.duplicate && !reservation.blocked
          ? { reservation: purchaseBillingKeys(userId, monthKey, purchaseIdentity) }
          : {}),
      };
    } else {
      await incrementOrderCount(userId);
    }
    return { allowed: true };
  }

  const planConfig = BILLING_PLANS[plan as keyof typeof BILLING_PLANS];

  if (!planConfig) {
    // Unknown plan — allow without incrementing
    return { allowed: true };
  }

  // Atomically increment first, then check
  const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
  const redisKey = `orders:${userId}:${monthKey}`;
  const r = getSharedRedis();

  let newCount: number;
  let reservationBlocked = false;
  let createdReservation: PurchaseBillingReservation | undefined;
  try {
    if (purchaseIdentity) {
      const reservation = await reservePurchaseBillingUnit(
        userId,
        monthKey,
        purchaseIdentity,
        planConfig.ordersPerMonth
      );
      if (reservation.duplicate) {
        return {
          allowed: true,
          used: reservation.count,
          limit: planConfig.ordersPerMonth,
        };
      }
      reservationBlocked = reservation.blocked;
      if (!reservation.duplicate && !reservation.blocked) {
        createdReservation = purchaseBillingKeys(userId, monthKey, purchaseIdentity);
      }
      // A blocked Lua reservation already rolled its increment back atomically.
      newCount = reservation.blocked ? reservation.count + 1 : reservation.count;
    } else {
      newCount = await r.incr(redisKey);
      // Ensure expiry is set (safe to call on every increment; Redis ignores if already set)
      await r.expire(redisKey, BILLING_TTL_SECONDS);
    }
  } catch {
    // Redis down — fail open (don't block commerce)
    log.error("Redis error for billing check, failing open", { userId });
    return { allowed: true };
  }

  if (newCount <= planConfig.ordersPerMonth) {
    // Within limit — increment already applied
    return { allowed: true, reservation: createdReservation };
  }

  // The Lua reservation already rolled back atomically. Legacy callers still
  // need the original explicit rollback.
  if (!reservationBlocked) {
    try {
      await r.decr(redisKey);
    } catch {
      // Redis rollback errors fail open; reconciliation can repair the count.
    }
  }

  // Limit reached — handle based on plan type
  if (plan === "FREE") {
    // Free users: block, must upgrade manually (no card on file)
    return {
      allowed: false,
      reason: "Order limit reached. Upgrade to continue tracking purchases.",
      limit: planConfig.ordersPerMonth,
      used: newCount - 1,
    };
  }

  // Paid plan: attempt auto-upgrade
  const nextPlan = AUTO_UPGRADE_MAP[plan];
  if (!nextPlan) {
    // Top tier (SCALE) — block, contact us
    return {
      allowed: false,
      reason: "Order limit reached. Contact us for enterprise pricing.",
      limit: planConfig.ordersPerMonth,
      used: newCount - 1,
    };
  }

  // Auto-upgrade to next tier
  const upgraded = await autoUpgrade(userId, nextPlan);
  if (upgraded) {
    // Upgrade succeeded — now apply the increment and allow
    if (purchaseIdentity) {
      const reservation = await reservePurchaseBillingUnit(
        userId,
        monthKey,
        purchaseIdentity,
        BILLING_PLANS[nextPlan].ordersPerMonth
      ).catch(() => null);
      if (reservation && !reservation.duplicate && !reservation.blocked) {
        createdReservation = purchaseBillingKeys(userId, monthKey, purchaseIdentity);
      }
    } else {
      await incrementOrderCount(userId);
    }
    return {
      allowed: true,
      upgraded: true,
      newPlan: nextPlan,
      reservation: createdReservation,
    };
  }

  // Auto-upgrade failed — allow the event anyway (don't block commerce), log error
  log.error("Auto-upgrade failed, allowing event", { userId, fromPlan: plan, toPlan: nextPlan });
  if (purchaseIdentity) {
    const reservation = await reservePurchaseBillingUnit(
      userId,
      monthKey,
      purchaseIdentity,
      Number.MAX_SAFE_INTEGER
    ).catch(() => null);
    if (reservation && !reservation.duplicate && !reservation.blocked) {
      createdReservation = purchaseBillingKeys(userId, monthKey, purchaseIdentity);
    }
  } else {
    await incrementOrderCount(userId);
  }
  return { allowed: true, reservation: createdReservation };
}

/**
 * Increment the monthly order count for a user.
 * Only call this for Purchase events.
 */
export async function incrementOrderCount(userId: string): Promise<void> {
  const monthKey = new Date().toISOString().slice(0, 7);
  const redisKey = `orders:${userId}:${monthKey}`;
  try {
    const pipeline = getSharedRedis().pipeline();
    pipeline.incr(redisKey);
    // Set expiry to 35 days (covers month + buffer)
    pipeline.expire(redisKey, 35 * 24 * 60 * 60);
    await pipeline.exec();
  } catch {
    log.error("Redis error incrementing order count", { userId });
  }
}

/**
 * Decrement the monthly order count when a refund is processed.
 * Uses the purchase month (YYYY-MM) so cross-month refunds decrement correctly.
 */
export async function decrementOrderCount(
  userId: string,
  purchaseMonth: string
): Promise<void> {
  const redisKey = `orders:${userId}:${purchaseMonth}`;
  const r = getSharedRedis();
  try {
    const newVal = await r.decr(redisKey);
    if (newVal < 0) {
      await r.set(redisKey, "0");
    }
  } catch {
    // Redis down — non-critical, usage count may be slightly high
  }
}

/**
 * Get current month's order count for a user.
 */
export async function getOrderCount(userId: string): Promise<number> {
  const monthKey = new Date().toISOString().slice(0, 7);
  const redisKey = `orders:${userId}:${monthKey}`;
  try {
    return parseInt((await getSharedRedis().get(redisKey)) || "0", 10);
  } catch {
    log.error("Redis error getting order count, returning 0", { userId });
    return 0;
  }
}

/**
 * Auto-upgrade a user's Stripe subscription to the next tier.
 * Returns true if successful, false if failed.
 */
async function autoUpgrade(userId: string, nextPlan: string): Promise<boolean> {
  try {
    const sub = await db.subscription.findUnique({ where: { userId } });
    if (!sub?.stripeSubscriptionId) return false;

    const priceId = PLAN_PRICE_MAP[nextPlan];
    if (!priceId) return false;

    // Update Stripe subscription to new price
    const stripeSub = await getStripe().subscriptions.retrieve(sub.stripeSubscriptionId);
    await getStripe().subscriptions.update(sub.stripeSubscriptionId, {
      items: [{
        id: stripeSub.items.data[0].id,
        price: priceId,
      }],
      proration_behavior: "create_prorations",
    });

    // Update local DB
    await db.subscription.update({
      where: { userId },
      data: {
        plan: nextPlan as any,
        stripePriceId: priceId,
      },
    });

    return true;
  } catch (error) {
    log.error("Auto-upgrade Stripe error", { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}
