import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { cleanDatabase, disconnectAll } from "./helpers/db";
import { createUser, createSubscription } from "./helpers/factories";

// Mock Stripe SDK
const mockConstructEvent = vi.fn();
const mockSubscriptionsRetrieve = vi.fn();
const mockSubscriptionsUpdate = vi.fn();

vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: {
      constructEvent: (...args: any[]) => mockConstructEvent(...args),
    },
    subscriptions: {
      retrieve: (...args: any[]) => mockSubscriptionsRetrieve(...args),
      update: (...args: any[]) => mockSubscriptionsUpdate(...args),
    },
  },
}));

import { POST } from "@/app/api/stripe/webhook/route";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";

function makeWebhookRequest(body: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost:3000/api/stripe/webhook", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": "test_sig_123",
    },
  });
}

describe("POST /api/stripe/webhook", () => {
  let user: any;

  beforeEach(async () => {
    await cleanDatabase();
    mockConstructEvent.mockReset();
    mockSubscriptionsRetrieve.mockReset();
    mockSubscriptionsUpdate.mockReset();
    user = await createUser();
  });

  afterAll(async () => {
    await disconnectAll();
  });

  // 1. Invalid signature
  it("returns 400 for invalid signature", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });

    const request = makeWebhookRequest();
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Invalid signature");
  });

  // 2. checkout.session.completed → subscription upserted
  it("creates subscription on checkout.session.completed", async () => {
    const stripeSubId = "sub_checkout_123";
    const stripeCusId = "cus_checkout_123";

    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { userId: user.id },
          subscription: stripeSubId,
          customer: stripeCusId,
        },
      },
    });

    mockSubscriptionsRetrieve.mockResolvedValue({
      id: stripeSubId,
      items: {
        data: [{ price: { id: process.env.STRIPE_STARTER_PRICE_ID } }],
      },
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
    });

    const request = makeWebhookRequest();
    const response = await POST(request);

    expect(response.status).toBe(200);

    const sub = await db.subscription.findUnique({
      where: { userId: user.id },
    });
    expect(sub).toBeTruthy();
    expect(sub!.plan).toBe("STARTER");
    expect(sub!.status).toBe("ACTIVE");
    expect(sub!.stripeSubscriptionId).toBe(stripeSubId);
    expect(sub!.stripeCustomerId).toBe(stripeCusId);
  });

  // 3. subscription.updated (plan change)
  it("updates plan on customer.subscription.updated", async () => {
    await createSubscription(user.id, {
      plan: "STARTER",
      stripeSubscriptionId: "sub_update_123",
      stripePriceId: process.env.STRIPE_STARTER_PRICE_ID,
    });

    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_update_123",
          items: {
            data: [{ price: { id: process.env.STRIPE_GROWTH_PRICE_ID } }],
          },
          status: "active",
          cancel_at_period_end: false,
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
        },
      },
    });

    const request = makeWebhookRequest();
    const response = await POST(request);

    expect(response.status).toBe(200);

    const updated = await db.subscription.findUnique({
      where: { userId: user.id },
    });
    expect(updated!.plan).toBe("GROWTH");
  });

  // 4. subscription.updated (past_due)
  it("sets PAST_DUE on subscription status change", async () => {
    await createSubscription(user.id, {
      plan: "STARTER",
      stripeSubscriptionId: "sub_pastdue_123",
    });

    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_pastdue_123",
          items: {
            data: [{ price: { id: process.env.STRIPE_STARTER_PRICE_ID } }],
          },
          status: "past_due",
          cancel_at_period_end: false,
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
        },
      },
    });

    const request = makeWebhookRequest();
    const response = await POST(request);

    expect(response.status).toBe(200);

    const updated = await db.subscription.findUnique({
      where: { userId: user.id },
    });
    expect(updated!.status).toBe("PAST_DUE");
  });

  // 5. subscription.deleted
  it("cancels subscription on customer.subscription.deleted", async () => {
    await createSubscription(user.id, {
      plan: "STARTER",
      stripeSubscriptionId: "sub_delete_123",
    });

    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      data: {
        object: { id: "sub_delete_123" },
      },
    });

    const request = makeWebhookRequest();
    const response = await POST(request);

    expect(response.status).toBe(200);

    const updated = await db.subscription.findUnique({
      where: { userId: user.id },
    });
    expect(updated!.status).toBe("CANCELED");
  });

  // 6. invoice.payment_failed
  it("sets PAST_DUE on invoice.payment_failed", async () => {
    await createSubscription(user.id, {
      plan: "STARTER",
      stripeSubscriptionId: "sub_fail_123",
    });

    mockConstructEvent.mockReturnValue({
      type: "invoice.payment_failed",
      data: {
        object: { subscription: "sub_fail_123" },
      },
    });

    const request = makeWebhookRequest();
    const response = await POST(request);

    expect(response.status).toBe(200);

    const updated = await db.subscription.findUnique({
      where: { userId: user.id },
    });
    expect(updated!.status).toBe("PAST_DUE");
  });

  // 7. invoice.paid
  it("sets ACTIVE on invoice.paid", async () => {
    await createSubscription(user.id, {
      plan: "STARTER",
      status: "PAST_DUE",
      stripeSubscriptionId: "sub_paid_123",
    });

    mockConstructEvent.mockReturnValue({
      type: "invoice.paid",
      data: {
        object: { subscription: "sub_paid_123" },
      },
    });

    const request = makeWebhookRequest();
    const response = await POST(request);

    expect(response.status).toBe(200);

    const updated = await db.subscription.findUnique({
      where: { userId: user.id },
    });
    expect(updated!.status).toBe("ACTIVE");
  });

  // 8. Unknown event → 200, no-op
  it("returns 200 for unknown event type", async () => {
    mockConstructEvent.mockReturnValue({
      type: "some.unknown.event",
      data: { object: {} },
    });

    const request = makeWebhookRequest();
    const response = await POST(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.received).toBe(true);
  });
});
