import { db } from "@/lib/db";
import IORedis from "ioredis";
import { BILLING_PLANS, AUTO_UPGRADE_MAP, PLAN_PRICE_MAP } from "@/lib/constants";
import { stripe } from "@/lib/stripe";
import { createLogger } from "@/lib/logger";

const log = createLogger({ component: "billing" });

let redis: IORedis | null = null;
function getRedis(): IORedis {
  if (!redis) {
    redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      lazyConnect: true,
    });
  }
  return redis;
}

export interface BillingCheck {
  allowed: boolean;
  reason?: string;
  limit?: number;
  used?: number;
  upgraded?: boolean;
  newPlan?: string;
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
  eventName: string
): Promise<BillingCheck> {
  // Non-Purchase events are always free — no increment needed
  if (eventName !== "Purchase") {
    return { allowed: true };
  }

  const subscription = await db.subscription.findUnique({
    where: { userId },
  });

  // No subscription record = FREE plan
  const plan = subscription?.plan ?? "FREE";
  const status = subscription?.status ?? "ACTIVE";

  // CANCELED, UNPAID: Block all Purchase events
  if (status === "CANCELED" || status === "UNPAID") {
    return { allowed: false, reason: "Subscription inactive" };
  }

  // PAST_DUE: Allow with grace period (still increment so usage is tracked)
  if (status === "PAST_DUE") {
    await incrementOrderCount(userId);
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
  const r = getRedis();

  let newCount: number;
  try {
    newCount = await r.incr(redisKey);
    // Ensure expiry is set (safe to call on every increment; Redis ignores if already set)
    await r.expire(redisKey, 35 * 24 * 60 * 60);
  } catch {
    // Redis down — fail open (don't block commerce)
    log.error("Redis error for billing check, failing open", { userId });
    return { allowed: true };
  }

  if (newCount <= planConfig.ordersPerMonth) {
    // Within limit — increment already applied
    return { allowed: true };
  }

  // Over limit — rollback the increment
  try {
    await r.decr(redisKey);
  } catch {
    // Redis error on rollback — non-critical, count will be slightly off
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
    await incrementOrderCount(userId);
    return {
      allowed: true,
      upgraded: true,
      newPlan: nextPlan,
    };
  }

  // Auto-upgrade failed — allow the event anyway (don't block commerce), log error
  log.error("Auto-upgrade failed, allowing event", { userId, fromPlan: plan, toPlan: nextPlan });
  await incrementOrderCount(userId);
  return { allowed: true };
}

/**
 * Increment the monthly order count for a user.
 * Only call this for Purchase events.
 */
export async function incrementOrderCount(userId: string): Promise<void> {
  const monthKey = new Date().toISOString().slice(0, 7);
  const redisKey = `orders:${userId}:${monthKey}`;
  const pipeline = getRedis().pipeline();
  pipeline.incr(redisKey);
  // Set expiry to 35 days (covers month + buffer)
  pipeline.expire(redisKey, 35 * 24 * 60 * 60);
  await pipeline.exec();
}

/**
 * Get current month's order count for a user.
 */
export async function getOrderCount(userId: string): Promise<number> {
  const monthKey = new Date().toISOString().slice(0, 7);
  const redisKey = `orders:${userId}:${monthKey}`;
  return parseInt((await getRedis().get(redisKey)) || "0", 10);
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
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
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
