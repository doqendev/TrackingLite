import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  id: string;
  workspaceId: string;
  eventName: string;
  eventId: string;
  destination: string;
  status: string;
  source: string | null;
  orderId: string | null;
  orderName: string | null;
  checkoutToken: string | null;
  cartToken: string | null;
  deliveryClaimToken: string | null;
  deliveryClaimOwner: string | null;
  deliveryClaimedAt: Date | null;
  deliveryClaimExpiresAt: Date | null;
  createdAt: Date;
  retryPayloadEncrypted: string | null;
  retryPayloadIv: string | null;
  retryPayloadTag: string | null;
  retryPayloadExpiresAt: Date | null;
  [key: string]: unknown;
};

const rows = new Map<string, Row>();
const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockUpdateMany = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    eventLog: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

const canonicalRetryEvent = {
  eventName: "Purchase",
  eventId: "shopify-purchase:ws-1:1001",
  timestamp: 1_700_000_000_000,
  url: "https://store.test/checkouts/thank-you",
  referrer: "",
  fbc: "fb.1.1700000000000.canonical",
  ttclid: "canonical-click",
  userData: { email: "buyer@example.com" },
  customData: { value: 49.95, currency: "USD" },
  clientIp: "203.0.113.10",
  userAgent: "Canonical Browser",
};

vi.mock("@/lib/event-retry-envelope", () => ({
  decryptEventRetryEnvelope: (stored: { retryPayloadEncrypted: string | null }) =>
    stored.retryPayloadEncrypted === "canonical-envelope"
      ? { version: 1, event: canonicalRetryEvent }
      : null,
  clearedEventRetryEnvelope: () => ({
    retryPayloadEncrypted: null,
    retryPayloadIv: null,
    retryPayloadTag: null,
    retryPayloadExpiresAt: null,
  }),
}));

import {
  claimEventDelivery,
  completeEventDeliveryClaim,
  EventDeliveryOwnershipError,
  failEventDeliveryClaim,
  isEventDeliverySuperseded,
  markEventDeliveryAccepted,
  reserveEventDeliveriesForWebhook,
} from "@/lib/event-delivery-guard";

function makeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: "fallback-meta",
    workspaceId: "ws-1",
    eventName: "Purchase",
    eventId: "shopify-purchase:ws-1:checkout-1",
    destination: "META",
    status: "PENDING",
    source: "snippet",
    orderId: null,
    orderName: null,
    checkoutToken: "checkout-1",
    cartToken: null,
    deliveryClaimToken: null,
    deliveryClaimOwner: null,
    deliveryClaimedAt: null,
    deliveryClaimExpiresAt: null,
    createdAt: new Date("2026-07-27T09:00:00.000Z"),
    retryPayloadEncrypted: null,
    retryPayloadIv: null,
    retryPayloadTag: null,
    retryPayloadExpiresAt: null,
    ...overrides,
  };
}

function statusMatches(actual: string, expected: unknown): boolean {
  if (typeof expected === "string") return actual === expected;
  if (expected && typeof expected === "object" && "in" in expected) {
    return (expected as { in: string[] }).in.includes(actual);
  }
  return true;
}

function matchesWhere(row: Row, where: Record<string, unknown>): boolean {
  if (typeof where.id === "string" && row.id !== where.id) return false;
  if (
    where.eventId &&
    typeof where.eventId === "string" &&
    row.eventId !== where.eventId
  ) return false;
  if (where.status && !statusMatches(row.status, where.status)) return false;
  for (const field of ["deliveryClaimToken", "deliveryClaimOwner"] as const) {
    if (!(field in where)) continue;
    const expected = where[field];
    if (expected && typeof expected === "object" && "in" in expected) {
      if (!(expected as { in: unknown[] }).in.includes(row[field])) return false;
    } else if (row[field] !== expected) {
      return false;
    }
  }
  if (Array.isArray(where.OR)) {
    const claimAvailable = (where.OR as Array<Record<string, unknown>>).some((part) => {
      if (
        "deliveryClaimToken" in part &&
        row.deliveryClaimToken !== part.deliveryClaimToken
      ) {
        return false;
      }
      if ("deliveryClaimOwner" in part) {
        const expectedOwner = part.deliveryClaimOwner;
        if (
          expectedOwner &&
          typeof expectedOwner === "object" &&
          "in" in expectedOwner
        ) {
          if (!(expectedOwner as { in: unknown[] }).in.includes(row.deliveryClaimOwner)) {
            return false;
          }
        } else if (row.deliveryClaimOwner !== expectedOwner) {
          return false;
        }
      }
      const expiry = part.deliveryClaimExpiresAt as { lte?: Date } | undefined;
      if (expiry?.lte) {
        return !!row.deliveryClaimExpiresAt &&
          row.deliveryClaimExpiresAt.getTime() <= expiry.lte.getTime();
      }
      return true;
    });
    if (!claimAvailable) return false;
  }
  return true;
}

function applyData(row: Row, data: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(data)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "increment" in value
    ) {
      row[key] = Number(row[key] ?? 0) + Number((value as { increment: number }).increment);
    } else {
      row[key] = value;
    }
  }
}

function aliasMatches(left: Row, right: Row): boolean {
  return ["orderId", "orderName", "checkoutToken", "cartToken"].some(
    (field) => !!left[field] && left[field] === right[field]
  );
}

function installStatefulDb(): void {
  mockFindUnique.mockImplementation(async (args: { where: { id: string } }) =>
    rows.get(args.where.id) ?? null
  );
  mockFindFirst.mockImplementation(async (args: { where: { id: { not: string } } }) => {
    const current = rows.get(args.where.id.not);
    if (!current) return null;
    return Array.from(rows.values()).find(
      (candidate) =>
        candidate.id !== current.id &&
        candidate.workspaceId === current.workspaceId &&
        candidate.destination === current.destination &&
        candidate.source === "webhook" &&
        ["SENT", "PENDING", "RETRYING", "FAILED"].includes(candidate.status) &&
        aliasMatches(current, candidate)
    ) ?? null;
  });
  mockFindMany.mockImplementation(async (args: {
    where: {
      id?: { not: string };
      workspaceId?: string;
      destination?: string;
      source?: string;
      AND?: unknown[];
      OR?: Array<Record<string, unknown>>;
      status?: unknown;
    };
  }) => {
    const current = args.where.id?.not ? rows.get(args.where.id.not) : null;
    const workspaceId = args.where.workspaceId ?? current?.workspaceId;
    const destination = args.where.destination ?? current?.destination;
    if (!workspaceId || !destination) return [];
    const fallbackOnly = Array.isArray(args.where.AND);
    return Array.from(rows.values()).filter(
      (candidate) =>
        candidate.id !== args.where.id?.not &&
        candidate.workspaceId === workspaceId &&
        candidate.destination === destination &&
        (!fallbackOnly || candidate.source !== "webhook") &&
        (!args.where.status || statusMatches(candidate.status, args.where.status)) &&
        (current
          ? aliasMatches(current, candidate)
          : (args.where.OR ?? []).some((alias) =>
              Object.entries(alias).some(
                ([field, value]) => !!value && candidate[field] === value
              )
            ))
    );
  });
  mockUpdateMany.mockImplementation(async (args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }) => {
    const row = rows.get(String(args.where.id));
    if (!row || !matchesWhere(row, args.where)) return { count: 0 };
    applyData(row, args.data);
    return { count: 1 };
  });
  mockTransaction.mockImplementation(async (callback: (transaction: unknown) => unknown) =>
    callback({
      eventLog: {
        findUnique: (...args: unknown[]) => mockFindUnique(...args),
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
        findMany: (...args: unknown[]) => mockFindMany(...args),
        updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      },
    })
  );
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("event delivery ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rows.clear();
    installStatefulDb();
  });

  it("blocks only durably superseded EventLogs in the early guard", async () => {
    rows.set("log-1", makeRow({ id: "log-1", status: "SUPERSEDED" }));
    rows.set("log-2", makeRow({ id: "log-2", status: "FAILED" }));
    await expect(isEventDeliverySuperseded("log-1")).resolves.toBe(true);
    await expect(isEventDeliverySuperseded("log-2")).resolves.toBe(false);
    await expect(isEventDeliverySuperseded(null)).resolves.toBe(false);
  });

  it("uses a barrier so a fallback claim first prevents a later canonical sender", async () => {
    const fallback = makeRow();
    rows.set(fallback.id, fallback);
    const workerClaimCommitted = deferred();
    const baseUpdate = mockUpdateMany.getMockImplementation()!;
    mockUpdateMany.mockImplementation(async (...args: unknown[]) => {
      const result = await baseUpdate(...args);
      const input = args[0] as { data?: { deliveryClaimOwner?: string } };
      if (
        input.data?.deliveryClaimOwner === "WORKER_ATTEMPTING" &&
        result.count === 1
      ) {
        workerClaimCommitted.resolve();
      }
      return result;
    });

    const fallbackClaimPromise = claimEventDelivery(fallback.id);
    await workerClaimCommitted.promise;
    const fallbackClaim = await fallbackClaimPromise;
    expect(fallbackClaim.action).toBe("deliver");

    rows.set("canonical-meta", makeRow({
      id: "canonical-meta",
      eventId: canonicalRetryEvent.eventId,
      source: "webhook",
      orderName: "1001",
    }));
    // Add the alias only after the fallback's claim has committed, modeling the
    // canonical insert that lost the election.
    fallback.orderName = "1001";

    await expect(claimEventDelivery("canonical-meta")).resolves.toEqual({
      action: "skip",
    });
    expect(rows.get("canonical-meta")?.deliveryClaimOwner).toBeNull();

    if (fallbackClaim.action !== "deliver") throw new Error("expected fallback claim");
    await completeEventDeliveryClaim(fallbackClaim.claim, { events_received: 1 });
    await expect(claimEventDelivery("canonical-meta")).resolves.toEqual({ action: "skip" });
    expect(rows.get(fallback.id)?.status).toBe("SENT");
    expect(rows.get("canonical-meta")?.status).toBe("SUPERSEDED");
  });

  it("elects one stable winner when alias-sharing fallback workers race", async () => {
    const first = makeRow({
      id: "fallback-a",
      eventId: "shopify-purchase:ws-1:checkout-old",
      orderName: "1001",
      createdAt: new Date("2026-07-27T09:00:00.000Z"),
    });
    const second = makeRow({
      id: "fallback-b",
      eventId: "shopify-purchase:ws-1:checkout-new",
      orderName: "1001",
      createdAt: new Date("2026-07-27T09:00:01.000Z"),
    });
    rows.set(first.id, first);
    rows.set(second.id, second);

    const bothSnapshotsRead = deferred();
    let electionReads = 0;
    const baseFindMany = mockFindMany.getMockImplementation()!;
    mockFindMany.mockImplementation(async (...args: unknown[]) => {
      const snapshot = ((await baseFindMany(...args)) as Row[]).map((row) => ({
        ...row,
      }));
      const input = args[0] as { where?: { id?: unknown } };
      if (!input.where?.id) {
        electionReads += 1;
        if (electionReads === 2) bothSnapshotsRead.resolve();
        await bothSnapshotsRead.promise;
      }
      return snapshot;
    });

    const results = await Promise.all([
      claimEventDelivery(first.id),
      claimEventDelivery(second.id),
    ]);
    const outboundIdentities = results.flatMap((result, index) =>
      result.action === "deliver"
        ? [index === 0 ? first.eventId : second.eventId]
        : []
    );

    expect(outboundIdentities).toEqual([first.eventId]);
    expect(rows.get(first.id)?.deliveryClaimOwner).toBe("WORKER_ATTEMPTING");
    expect(rows.get(second.id)?.status).toBe("SUPERSEDED");
  });

  it("elects across a transitive checkout-to-order alias bridge", async () => {
    const checkoutOnly = makeRow({
      id: "checkout-only",
      eventId: "shopify-purchase:ws-1:checkout-1",
      checkoutToken: "checkout-1",
      createdAt: new Date("2026-07-27T09:00:00.000Z"),
    });
    const bridge = makeRow({
      id: "alias-bridge",
      eventId: "shopify-purchase:ws-1:bridge",
      checkoutToken: "checkout-1",
      orderName: "1001",
      status: "SUPERSEDED",
      createdAt: new Date("2026-07-27T09:00:01.000Z"),
    });
    const orderOnly = makeRow({
      id: "order-only",
      eventId: "shopify-purchase:ws-1:1001",
      checkoutToken: null,
      orderName: "1001",
      createdAt: new Date("2026-07-27T09:00:02.000Z"),
    });
    rows.set(checkoutOnly.id, checkoutOnly);
    rows.set(bridge.id, bridge);
    rows.set(orderOnly.id, orderOnly);

    const winner = await claimEventDelivery(checkoutOnly.id);

    expect(winner.action).toBe("deliver");
    expect(rows.get(orderOnly.id)?.status).toBe("SUPERSEDED");
    await expect(claimEventDelivery(orderOnly.id)).resolves.toEqual({ action: "skip" });
  });

  it("keeps the pre-I/O identity owner when the first post-send DB write fails", async () => {
    const attemptedAt = new Date("2026-07-27T10:00:00.000Z");
    const afterLease = new Date("2026-07-27T10:06:00.000Z");
    const fallback = makeRow({ orderName: "1001" });
    rows.set(fallback.id, fallback);

    const firstClaim = await claimEventDelivery(fallback.id, attemptedAt);
    expect(firstClaim.action).toBe("deliver");
    if (firstClaim.action !== "deliver") throw new Error("expected fallback claim");
    expect(rows.get(fallback.id)).toMatchObject({
      deliveryClaimOwner: "WORKER_ATTEMPTING",
      deliveryClaimToken: firstClaim.claim.token,
    });

    const baseUpdate = mockUpdateMany.getMockImplementation()!;
    let rejectAcceptedWrite = true;
    mockUpdateMany.mockImplementation(async (...args: unknown[]) => {
      const input = args[0] as { data?: { deliveryClaimOwner?: string } };
      if (
        rejectAcceptedWrite &&
        input.data?.deliveryClaimOwner === "WORKER_ACCEPTED"
      ) {
        rejectAcceptedWrite = false;
        throw new Error("database unavailable after destination acceptance");
      }
      return baseUpdate(...args);
    });

    const outboundEventIds = [fallback.eventId];
    await expect(
      markEventDeliveryAccepted(firstClaim.claim, { accepted: true })
    ).rejects.toBeInstanceOf(EventDeliveryOwnershipError);
    expect(rows.get(fallback.id)?.deliveryClaimOwner).toBe("WORKER_ATTEMPTING");

    rows.set("canonical-meta", makeRow({
      id: "canonical-meta",
      eventId: canonicalRetryEvent.eventId,
      source: "webhook",
      orderName: "1001",
      createdAt: new Date("2026-07-27T10:01:00.000Z"),
    }));

    // Even after the attempt lease expires, webhook takeover cannot replace an
    // identity that may already have been accepted by the destination.
    await expect(claimEventDelivery("canonical-meta", afterLease)).resolves.toEqual({
      action: "skip",
    });

    const retryClaim = await claimEventDelivery(fallback.id, afterLease);
    expect(retryClaim.action).toBe("deliver");
    if (retryClaim.action !== "deliver") throw new Error("expected same-id retry");
    outboundEventIds.push(fallback.eventId);
    await markEventDeliveryAccepted(retryClaim.claim, { accepted: true });
    await completeEventDeliveryClaim(retryClaim.claim, { accepted: true });

    await expect(claimEventDelivery("canonical-meta", afterLease)).resolves.toEqual({
      action: "skip",
    });
    expect(new Set(outboundEventIds)).toEqual(new Set([fallback.eventId]));
    expect(rows.get("canonical-meta")?.status).toBe("SUPERSEDED");
  });

  it("settles without another outbound after acceptance was saved but SENT commit failed", async () => {
    const attemptedAt = new Date("2026-07-27T11:00:00.000Z");
    const afterLease = new Date("2026-07-27T11:06:00.000Z");
    const fallback = makeRow({ orderName: "1002" });
    rows.set(fallback.id, fallback);

    const firstClaim = await claimEventDelivery(fallback.id, attemptedAt);
    if (firstClaim.action !== "deliver") throw new Error("expected fallback claim");
    const outboundCalls = 1;
    await markEventDeliveryAccepted(firstClaim.claim, { events_received: 1 });

    const baseUpdate = mockUpdateMany.getMockImplementation()!;
    let rejectSentCommit = true;
    mockUpdateMany.mockImplementation(async (...args: unknown[]) => {
      const input = args[0] as { data?: { status?: string } };
      if (rejectSentCommit && input.data?.status === "SENT") {
        rejectSentCommit = false;
        throw new Error("completion commit unavailable");
      }
      return baseUpdate(...args);
    });
    await expect(
      completeEventDeliveryClaim(firstClaim.claim, { events_received: 1 })
    ).rejects.toBeInstanceOf(EventDeliveryOwnershipError);

    rows.set("canonical-meta", makeRow({
      id: "canonical-meta",
      eventId: canonicalRetryEvent.eventId,
      source: "webhook",
      orderName: "1002",
    }));
    await expect(claimEventDelivery("canonical-meta", afterLease)).resolves.toEqual({
      action: "skip",
    });

    // The accepted owner performs settlement during claim and returns skip.
    await expect(claimEventDelivery(fallback.id, afterLease)).resolves.toEqual({
      action: "skip",
    });
    await expect(claimEventDelivery("canonical-meta", afterLease)).resolves.toEqual({
      action: "skip",
    });
    expect(outboundCalls).toBe(1);
    expect(rows.get(fallback.id)?.status).toBe("SENT");
    expect(rows.get("canonical-meta")?.status).toBe("SUPERSEDED");
  });

  it("lets a canonical reservation win first and makes the fallback skip", async () => {
    const fallback = makeRow({ orderName: "1001" });
    const canonical = makeRow({
      id: "canonical-meta",
      eventId: canonicalRetryEvent.eventId,
      source: "webhook",
      orderName: "1001",
    });
    rows.set(fallback.id, fallback);
    rows.set(canonical.id, canonical);

    const canonicalClaim = await claimEventDelivery(canonical.id);
    expect(canonicalClaim.action).toBe("deliver");
    expect(rows.get(fallback.id)?.status).toBe("SUPERSEDED");
    await expect(claimEventDelivery(fallback.id)).resolves.toEqual({ action: "skip" });
    expect(rows.get(canonical.id)?.deliveryClaimOwner).toBe("WORKER_ATTEMPTING");
  });

  it("suppresses every unsettled alias when another fallback is already SENT", async () => {
    const sentFallback = makeRow({
      id: "sent-fallback",
      orderName: "1001",
      status: "SENT",
    });
    const pendingFallback = makeRow({
      id: "pending-fallback",
      eventId: "shopify-purchase:ws-1:cart-1",
      orderName: "1001",
    });
    const canonical = makeRow({
      id: "canonical-meta",
      eventId: canonicalRetryEvent.eventId,
      source: "webhook",
      orderName: "1001",
    });
    rows.set(sentFallback.id, sentFallback);
    rows.set(pendingFallback.id, pendingFallback);
    rows.set(canonical.id, canonical);

    await expect(claimEventDelivery(canonical.id)).resolves.toEqual({ action: "skip" });
    expect(rows.get(sentFallback.id)?.status).toBe("SENT");
    expect(rows.get(pendingFallback.id)?.status).toBe("SUPERSEDED");
    expect(rows.get(canonical.id)?.status).toBe("SUPERSEDED");
  });

  it("returns the latest same-ID webhook retry envelope after claiming", async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    rows.set("same-id", makeRow({
      id: "same-id",
      eventId: canonicalRetryEvent.eventId,
      source: "webhook",
      orderName: "1001",
      retryPayloadEncrypted: "canonical-envelope",
      retryPayloadIv: "iv",
      retryPayloadTag: "tag",
      retryPayloadExpiresAt: expiresAt,
    }));

    const claimed = await claimEventDelivery("same-id");
    expect(claimed.action).toBe("deliver");
    if (claimed.action !== "deliver") throw new Error("expected delivery claim");
    expect(claimed.event).toEqual(canonicalRetryEvent);
    expect(claimed.event?.fbc).toBe("fb.1.1700000000000.canonical");
  });

  it("requires the exact claim token for SENT completion", async () => {
    rows.set("claimed", makeRow({
      id: "claimed",
      deliveryClaimToken: "right-token",
      deliveryClaimOwner: "WORKER_ATTEMPTING",
      deliveryClaimedAt: new Date(),
      deliveryClaimExpiresAt: new Date(Date.now() + 60_000),
    }));

    await expect(
      completeEventDeliveryClaim(
        { eventLogId: "claimed", token: "wrong-token" },
        { ok: true }
      )
    ).rejects.toBeInstanceOf(EventDeliveryOwnershipError);
    expect(rows.get("claimed")?.status).toBe("PENDING");

    await completeEventDeliveryClaim(
      { eventLogId: "claimed", token: "right-token" },
      { ok: true }
    );
    expect(rows.get("claimed")?.status).toBe("SENT");
    expect(rows.get("claimed")?.deliveryClaimToken).toBeNull();
  });

  it("preserves identity ownership after an ambiguous outbound failure", async () => {
    const failedAt = new Date("2026-07-27T10:00:00.000Z");
    const retryAt = new Date("2026-07-27T10:15:00.000Z");
    rows.set("claimed", makeRow({
      id: "claimed",
      deliveryClaimToken: "right-token",
      deliveryClaimOwner: "WORKER_ATTEMPTING",
      deliveryClaimExpiresAt: new Date("2026-07-27T10:05:00.000Z"),
    }));

    await failEventDeliveryClaim({
      eventLogId: "claimed",
      claim: { eventLogId: "claimed", token: "right-token" },
      outcome: "DELIVERY_AMBIGUOUS",
      status: "FAILED",
      errorMessage: "ownership busy",
      failedAt,
      nextRetryAt: retryAt,
    });
    expect(rows.get("claimed")).toMatchObject({
      status: "FAILED",
      deliveryClaimToken: "right-token",
      deliveryClaimOwner: "WORKER_ATTEMPTING",
      deliveryClaimExpiresAt: failedAt,
      nextRetryAt: retryAt,
    });

    await expect(
      reserveEventDeliveriesForWebhook(["claimed"], failedAt)
    ).rejects.toBeInstanceOf(EventDeliveryOwnershipError);

    const retry = await claimEventDelivery("claimed", failedAt);
    expect(retry.action).toBe("deliver");
    if (retry.action !== "deliver") throw new Error("expected same-owner retry");
    expect(retry.claim.token).not.toBe("right-token");
  });

  it("releases identity ownership after a definitive failure for canonical takeover", async () => {
    const failedAt = new Date("2026-07-27T10:00:00.000Z");
    rows.set("claimed", makeRow({
      id: "claimed",
      deliveryClaimToken: "right-token",
      deliveryClaimOwner: "WORKER_ATTEMPTING",
      deliveryClaimedAt: new Date("2026-07-27T09:59:59.000Z"),
      deliveryClaimExpiresAt: new Date("2026-07-27T10:05:00.000Z"),
    }));

    await failEventDeliveryClaim({
      eventLogId: "claimed",
      claim: { eventLogId: "claimed", token: "right-token" },
      outcome: "DEFINITELY_NOT_DELIVERED",
      status: "FAILED",
      errorMessage: "destination rejected payload",
      failedAt,
      nextRetryAt: null,
    });

    expect(rows.get("claimed")).toMatchObject({
      status: "FAILED",
      deliveryClaimToken: null,
      deliveryClaimOwner: null,
      deliveryClaimedAt: null,
      deliveryClaimExpiresAt: null,
    });

    const reservation = await reserveEventDeliveriesForWebhook(
      ["claimed"],
      failedAt
    );
    expect(rows.get("claimed")).toMatchObject({
      deliveryClaimToken: reservation.token,
      deliveryClaimOwner: "SHOPIFY_WEBHOOK",
      deliveryClaimedAt: failedAt,
    });
  });

  it("fails closed when the DB claim cannot be established", async () => {
    rows.set("fallback-meta", makeRow());
    mockUpdateMany.mockRejectedValueOnce(new Error("database unavailable"));

    const failure = await claimEventDelivery("fallback-meta").catch(
      (error: unknown) => error
    );
    expect(failure).toBeInstanceOf(EventDeliveryOwnershipError);
    expect((failure as Error & { cause?: Error }).cause?.message).toBe(
      "database unavailable"
    );
  });

  it("reserves multiple webhook rows in a serializable transaction", async () => {
    rows.set("meta", makeRow({ id: "meta", destination: "META" }));
    rows.set("tiktok", makeRow({ id: "tiktok", destination: "TIKTOK" }));

    const reservation = await reserveEventDeliveriesForWebhook(["tiktok", "meta"]);

    expect(reservation.eventLogIds).toEqual(["meta", "tiktok"]);
    expect(rows.get("meta")?.deliveryClaimOwner).toBe("SHOPIFY_WEBHOOK");
    expect(rows.get("tiktok")?.deliveryClaimToken).toBe(reservation.token);
    expect(mockTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "Serializable" }
    );
  });
});
