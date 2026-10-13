import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { cleanDatabase, disconnectAll } from "./helpers/db";
import { createUser, createWorkspace } from "./helpers/factories";
import { compactEventDetails, pruneExpiredDeliveryIdentities, refreshEventSummaries } from "@/lib/event-retention";
import { queryLogicalCampaigns } from "@/lib/logical-event-analytics";
import { DAY_MS } from "@/lib/event-retention-policy";
import { reportingScope } from "@/lib/logical-events-sql";
import { getAllowedDestinationsForWorkspace } from "@/lib/workspace-mode";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/currency", () => ({ getExchangeRate: vi.fn().mockResolvedValue(1) }));
const now = new Date();
const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
// Follow the product mode, as refreshEventSummaries does, so scope keys match.
const allowed = getAllowedDestinationsForWorkspace({ productMode: "SHOPIFY_META_TIKTOK_V1", installType: "SHOPIFY_CUSTOM_PIXEL" });
let workspaceId: string;

async function event(eventId: string, extra: Partial<Prisma.EventLogUncheckedCreateInput> = {}) {
  return db.eventLog.create({ data: { workspaceId, eventId, eventName: "AddToCart", status: "SENT",
    destination: "META", createdAt: ago(10), value: 10, currency: "USD", utmSource: "facebook",
    utmCampaign: "campaign-a", payload: { customData: { contentIds: ["product-secret"] } },
    fbp: "browser-secret", pageUrl: "https://example.com/private", ...extra,
  } });
}

beforeEach(async () => {
  await cleanDatabase();
  const user = await createUser();
  const ws = await createWorkspace(user.id, { productMode: "SHOPIFY_META_TIKTOK_V1", installType: "SHOPIFY_CUSTOM_PIXEL" });
  workspaceId = ws.id;
});
afterAll(disconnectAll);

describe("independent log, report and operational retention", () => {
  it("preserves campaign totals across compaction and idempotent summaries, without payload or identities in summaries", async () => {
    await event("cart", { destination: "META" });
    await event("cart", { destination: "OPENAI" });
    await event("sale-browser", { eventName: "Purchase", orderName: "#100", status: "SUPERSEDED" });
    await event("sale-webhook", { eventName: "Purchase", orderName: "#100", source: "webhook", value: 40 });
    await event("sale-webhook", { eventName: "Purchase", orderName: "#100", source: "webhook", value: 40, destination: "OPENAI" });
    await event("recent", { createdAt: ago(1) });
    const before = await queryLogicalCampaigns(workspaceId, "USD", allowed);
    await refreshEventSummaries(now);
    await compactEventDetails(now);
    await refreshEventSummaries(now);
    expect(await queryLogicalCampaigns(workspaceId, "USD", allowed)).toEqual(before);
    expect(before).toEqual([{ utmSource: "facebook", utmCampaign: "campaign-a", events: 3, revenue: 40 }]);
    const summaries = await db.eventDailySummary.findMany();
    expect(summaries).toHaveLength(2);
    const json = JSON.stringify(summaries);
    for (const secret of ["product-secret", "browser-secret", "https://example.com/private", "sale-webhook", "#100"])
      expect(json).not.toContain(secret);
    expect(await compactEventDetails(now)).toBe(0);
  });

  it("retains every operational alias and immutable target while removing settled details", async () => {
    const row = await event("purchase", { eventName: "Purchase", orderId: "100", orderName: "#100",
      checkoutToken: "checkout", cartToken: "cart", deliveryTargetId: "pixel", occurredAt: ago(10),
      source: "webhook", refundId: "refund", refundAmount: 3, metaResponse: { accepted: true },
      customerIp: "127.0.0.1", userAgent: "agent", gclid: "click", gbraid: "app-click", wbraid: "web-click",
      utmContent: "creative", paymentGateway: "paypal", destinationRequestId: "req-1", destinationRequestStatus: "SUCCESS" });
    await compactEventDetails(now);
    expect(await db.eventLog.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
      eventId: "purchase", orderId: "100", orderName: "#100", checkoutToken: "checkout", cartToken: "cart",
      deliveryTargetId: "pixel", occurredAt: ago(10), source: "webhook", refundId: "refund", refundAmount: 3,
      value: 10, currency: "USD", status: "SENT", utmSource: "facebook", utmCampaign: "campaign-a",
      paymentGateway: "paypal", payload: null, metaResponse: null, fbp: null, pageUrl: null,
      customerIp: null, userAgent: null, gclid: null, gbraid: null, wbraid: null, utmContent: null, detailsCompactedAt: now,
      destinationRequestId: "req-1", destinationRequestStatus: "SUCCESS",
    });
    await expect(event("purchase")).rejects.toMatchObject({ code: "P2002" });
  });

  it("never compacts or prunes pending, recoverable, or ambiguous ownership including accepted Purchase receipts", async () => {
    const cases: Partial<Prisma.EventLogUncheckedCreateInput>[] = [
      { status: "PENDING" }, { status: "RETRYING" }, { status: "FAILED", nextRetryAt: now },
      { status: "FAILED", retryPayloadEncrypted: "ciphertext", retryPayloadExpiresAt: now },
      ...["WORKER", "WORKER_ATTEMPTING", "WORKER_ACCEPTED", "SHOPIFY_WEBHOOK"].map(deliveryClaimOwner =>
        ({ eventName: "Purchase" as const, deliveryClaimOwner, deliveryClaimToken: "claim", deliveryClaimExpiresAt: ago(1) })),
    ];
    for (let i = 0; i < cases.length; i++) await event(`protected-${i}`, { createdAt: ago(40), ...cases[i] });
    expect(await compactEventDetails(now)).toBe(0);
    expect(await pruneExpiredDeliveryIdentities(now)).toBe(0);
    expect(await db.eventLog.count()).toBe(cases.length);
  });

  it("respects seven and 35 day boundaries and cleans inactive workspaces", async () => {
    await db.workspace.update({ where: { id: workspaceId }, data: { isActive: false } });
    await event("fresh", { createdAt: ago(7) });
    await event("old", { createdAt: new Date(ago(7).getTime() - 1) });
    await event("identity", { createdAt: ago(35) });
    await event("expired", { createdAt: new Date(ago(35).getTime() - 1) });
    expect(await compactEventDetails(now)).toBe(3);
    expect(await pruneExpiredDeliveryIdentities(now)).toBe(1);
    expect((await db.eventLog.findMany({ orderBy: { eventId: "asc" } })).map(r => r.eventId)).toEqual(["fresh", "identity", "old"]);
  });

  it("rebuilds late corrections and keeps destination modes isolated", async () => {
    const row = await event("old", { eventName: "Purchase", value: 20 });
    await event("legacy", { destination: "GA4", eventName: "Purchase", value: 100 });
    await refreshEventSummaries(now);
    expect((await queryLogicalCampaigns(workspaceId, "USD", allowed))[0].revenue).toBe(20);
    expect((await queryLogicalCampaigns(workspaceId, "USD"))[0].revenue).toBe(120);
    await db.eventLog.update({ where: { id: row.id }, data: { status: "SUPERSEDED" } });
    await event("canonical", { eventName: "Purchase", source: "webhook", value: 25 });
    await refreshEventSummaries(now);
    expect((await queryLogicalCampaigns(workspaceId, "USD", allowed))[0].revenue).toBe(25);
    expect(await db.eventDailySummary.count({ where: { scope: reportingScope(allowed) } })).toBe(1);
    await db.workspace.delete({ where: { id: workspaceId } });
    expect(await db.eventDailySummary.count()).toBe(0);
  });

  it("does not double count cross-day platform deliveries or truncate the partial 30-day boundary", async () => {
    await event("cross-day", { createdAt: ago(12) });
    await event("cross-day", { createdAt: ago(2), destination: "OPENAI" });
    await event("boundary", { createdAt: new Date(Date.now() - 30 * DAY_MS + 60000) });
    await event("expired-report", { createdAt: ago(31) });
    const before = await queryLogicalCampaigns(workspaceId, "USD", allowed);
    await refreshEventSummaries(now);
    expect(await queryLogicalCampaigns(workspaceId, "USD", allowed)).toEqual(before);
    expect(before[0].events).toBe(2);
  });
});
