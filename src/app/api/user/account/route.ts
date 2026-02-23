import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { createLogger } from "@/lib/logger";

const log = createLogger({ component: "account-deletion" });

export async function DELETE() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    log.info("Account deletion requested", { userId });

    // 1. Cancel Stripe subscription if exists
    const subscription = await db.subscription.findUnique({
      where: { userId },
    });

    if (subscription?.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
        log.info("Stripe subscription cancelled", {
          userId,
          subscriptionId: subscription.stripeSubscriptionId
        });
      } catch (stripeErr) {
        // Log but don't block deletion - subscription may already be cancelled
        log.warn("Failed to cancel Stripe subscription", {
          userId,
          error: stripeErr instanceof Error ? stripeErr.message : String(stripeErr),
        });
      }
    }

    // 2. Delete user (cascade deletes handle: workspaces, event logs, sessions, accounts, alerts, subscriptions, password reset tokens)
    // The Prisma schema has onDelete: Cascade on all relations pointing to User
    await db.user.delete({
      where: { id: userId },
    });

    log.info("Account deleted successfully", { userId });

    return NextResponse.json({ success: true, message: "Account deleted successfully" });
  } catch (error) {
    log.error("Account deletion failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
}
