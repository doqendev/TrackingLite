import { randomUUID } from "node:crypto";
import type { EventStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  clearedEventRetryEnvelope,
  decryptEventRetryEnvelope,
  type EventRetryEnvelope,
} from "@/lib/event-retry-envelope";

const WORKER_CLAIM_OWNER = "WORKER";
const WORKER_ATTEMPTING_CLAIM_OWNER = "WORKER_ATTEMPTING";
const WORKER_ACCEPTED_CLAIM_OWNER = "WORKER_ACCEPTED";
const WEBHOOK_CLAIM_OWNER = "SHOPIFY_WEBHOOK";
const WORKER_CLAIM_TTL_MS = 5 * 60 * 1000;
const WEBHOOK_RESERVATION_TTL_MS = 60 * 1000;
const DELIVERABLE_STATUSES: EventStatus[] = ["PENDING", "RETRYING", "FAILED"];

export interface EventDeliveryClaim {
  eventLogId: string | null;
  token: string | null;
}

export type EventDeliveryFailureOutcome =
  | "DEFINITELY_NOT_DELIVERED"
  | "DELIVERY_AMBIGUOUS";

export type EventDeliveryClaimResult =
  | {
      action: "deliver";
      claim: EventDeliveryClaim;
      /** Fresh canonical data from the encrypted EventLog retry envelope. */
      event: EventRetryEnvelope["event"] | null;
    }
  | { action: "skip" };

export interface WebhookDeliveryReservation {
  token: string;
  eventLogIds: string[];
}

export class EventDeliveryOwnershipError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "EventDeliveryOwnershipError";
    if (cause !== undefined) this.cause = cause;
  }
}

export function clearedEventDeliveryClaim(): {
  deliveryClaimToken: null;
  deliveryClaimOwner: null;
  deliveryClaimedAt: null;
  deliveryClaimExpiresAt: null;
} {
  return {
    deliveryClaimToken: null,
    deliveryClaimOwner: null,
    deliveryClaimedAt: null,
    deliveryClaimExpiresAt: null,
  };
}

/** A new identity owner may only replace no owner or an expired webhook lock. */
function claimIsAvailableForTakeover(now: Date) {
  return {
    OR: [
      { deliveryClaimToken: null },
      {
        deliveryClaimOwner: WEBHOOK_CLAIM_OWNER,
        deliveryClaimExpiresAt: { lte: now },
      },
    ],
  };
}

/** The same EventLog may renew an uncertain worker attempt after its lease. */
function workerClaimIsAvailable(now: Date) {
  return {
    OR: [
      { deliveryClaimToken: null },
      {
        deliveryClaimOwner: {
          in: [WORKER_CLAIM_OWNER, WORKER_ATTEMPTING_CLAIM_OWNER],
        },
        deliveryClaimExpiresAt: { lte: now },
      },
      {
        deliveryClaimOwner: WEBHOOK_CLAIM_OWNER,
        deliveryClaimExpiresAt: { lte: now },
      },
    ],
  };
}

/**
 * Lightweight early guard retained for old queued jobs. The authoritative
 * ownership decision is claimEventDelivery immediately before outbound I/O.
 */
export async function isEventDeliverySuperseded(
  eventLogId: string | null | undefined
): Promise<boolean> {
  if (!eventLogId) return false;
  try {
    const eventLog = await db.eventLog.findUnique({
      where: { id: eventLogId },
      select: { status: true },
    });
    return eventLog?.status === "SUPERSEDED";
  } catch (error) {
    throw new EventDeliveryOwnershipError(
      `Unable to read durable delivery state for ${eventLogId}`,
      error
    );
  }
}

function purchaseAliases(eventLog: {
  orderId: string | null;
  orderName: string | null;
  checkoutToken: string | null;
  cartToken: string | null;
}) {
  return [
    eventLog.orderId ? { orderId: eventLog.orderId } : null,
    eventLog.orderName ? { orderName: eventLog.orderName } : null,
    eventLog.checkoutToken ? { checkoutToken: eventLog.checkoutToken } : null,
    eventLog.cartToken ? { cartToken: eventLog.cartToken } : null,
  ].filter((alias): alias is Exclude<typeof alias, null> => alias !== null);
}

function isDurableDeliveryOwner(
  eventLog: {
    deliveryClaimToken: string | null;
    deliveryClaimOwner: string | null;
    deliveryClaimExpiresAt: Date | null;
  },
  now: Date
): boolean {
  if (!eventLog.deliveryClaimToken) return false;
  if (
    eventLog.deliveryClaimOwner === WORKER_CLAIM_OWNER ||
    eventLog.deliveryClaimOwner === WORKER_ATTEMPTING_CLAIM_OWNER ||
    eventLog.deliveryClaimOwner === WORKER_ACCEPTED_CLAIM_OWNER
  ) {
    // A worker attempt permanently owns this Purchase identity. Its lease may
    // expire so the same EventLog can retry, but a sibling/canonical id cannot
    // replace it after an ambiguous destination response.
    return true;
  }
  return eventLog.deliveryClaimOwner === WEBHOOK_CLAIM_OWNER &&
    (!eventLog.deliveryClaimExpiresAt ||
      eventLog.deliveryClaimExpiresAt.getTime() > now.getTime());
}

function comparePurchasePeers(
  left: { id: string; source: string | null; createdAt: Date },
  right: { id: string; source: string | null; createdAt: Date }
): number {
  // Preserve the richer Shopify webhook identity when neither side has already
  // sent or acquired an active claim. Fallback-only peers then elect by durable
  // insertion order and id, so every concurrent worker computes one winner.
  const leftSourceRank = left.source === "webhook" ? 0 : 1;
  const rightSourceRank = right.source === "webhook" ? 0 : 1;
  if (leftSourceRank !== rightSourceRank) return leftSourceRank - rightSourceRank;
  const createdAtOrder = left.createdAt.getTime() - right.createdAt.getTime();
  return createdAtOrder || left.id.localeCompare(right.id);
}

/**
 * Elect one Purchase identity and acquire its worker claim in the same
 * serializable transaction. This closes fallback/fallback and
 * fallback/webhook races where different event ids share any connected
 * order/checkout/cart alias component.
 */
async function establishAliasedPurchaseClaim(
  eventLogId: string,
  now: Date
): Promise<EventDeliveryClaimResult | null> {
  const token = randomUUID();

  return db.$transaction(
    async (transaction) => {
      const current = await transaction.eventLog.findUnique({
        where: { id: eventLogId },
        select: {
          id: true,
          workspaceId: true,
          eventName: true,
          eventId: true,
          destination: true,
          status: true,
          source: true,
          orderId: true,
          orderName: true,
          checkoutToken: true,
          cartToken: true,
          deliveryClaimToken: true,
          deliveryClaimOwner: true,
          deliveryClaimedAt: true,
          deliveryClaimExpiresAt: true,
          metaResponse: true,
          retryPayloadEncrypted: true,
          retryPayloadIv: true,
          retryPayloadTag: true,
          retryPayloadExpiresAt: true,
          createdAt: true,
        },
      });

      if (!current || current.status === "SENT" || current.status === "SUPERSEDED") {
        return { action: "skip" };
      }
      if (current.eventName !== "Purchase") {
        return null;
      }

      const aliases = purchaseAliases(current);
      if (aliases.length === 0) return null;

      // Resolve the full connected alias component, not only direct matches.
      // A browser row can bridge checkoutToken -> orderName, so querying just
      // the current row's aliases would let a third orderName-only row escape
      // election after the bridge became SUPERSEDED.
      const aliasValues = {
        orderId: new Set(current.orderId ? [current.orderId] : []),
        orderName: new Set(current.orderName ? [current.orderName] : []),
        checkoutToken: new Set(
          current.checkoutToken ? [current.checkoutToken] : []
        ),
        cartToken: new Set(current.cartToken ? [current.cartToken] : []),
      };
      const connectedPeers = new Map<
        string,
        {
          id: string;
          status: EventStatus;
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
        }
      >();

      while (true) {
        const aliasPredicates = [
          ...Array.from(aliasValues.orderId, (orderId) => ({ orderId })),
          ...Array.from(aliasValues.orderName, (orderName) => ({ orderName })),
          ...Array.from(aliasValues.checkoutToken, (checkoutToken) => ({
            checkoutToken,
          })),
          ...Array.from(aliasValues.cartToken, (cartToken) => ({ cartToken })),
        ];
        const matchedPeers = await transaction.eventLog.findMany({
          where: {
            workspaceId: current.workspaceId,
            eventName: "Purchase",
            destination: current.destination,
            OR: aliasPredicates,
          },
          select: {
            id: true,
            status: true,
            source: true,
            orderId: true,
            orderName: true,
            checkoutToken: true,
            cartToken: true,
            deliveryClaimToken: true,
            deliveryClaimOwner: true,
            deliveryClaimedAt: true,
            deliveryClaimExpiresAt: true,
            createdAt: true,
          },
        });

        let expanded = false;
        for (const peer of matchedPeers) {
          if (!connectedPeers.has(peer.id)) {
            connectedPeers.set(peer.id, peer);
            expanded = true;
          }
          for (const field of [
            "orderId",
            "orderName",
            "checkoutToken",
            "cartToken",
          ] as const) {
            const value = peer[field];
            if (value && !aliasValues[field].has(value)) {
              aliasValues[field].add(value);
              expanded = true;
            }
          }
        }
        if (!expanded) break;
      }

      // Defensive inclusion for lightweight test doubles and any future query
      // shape changes. In production the current row matches its own aliases.
      if (!connectedPeers.has(current.id)) connectedPeers.set(current.id, current);
      const peers = Array.from(connectedPeers.values()).filter(
        (peer) => peer.status === "SENT" || DELIVERABLE_STATUSES.includes(peer.status)
      );

      const sortedPeers = [...peers].sort(comparePurchasePeers);
      const sentWinner = sortedPeers.find((peer) => peer.status === "SENT");
      const activePeers = sortedPeers.filter(
        (peer) =>
          DELIVERABLE_STATUSES.includes(peer.status) &&
          isDurableDeliveryOwner(peer, now)
      );

      // SENT always owns the conversion. Otherwise an active claim owns it;
      // this includes the non-expiring WORKER_ACCEPTED state and webhook
      // reservations. With no durable owner, the stable comparator elects one.
      const winner = sentWinner ?? activePeers[0] ?? sortedPeers[0];
      if (!winner) {
        throw new EventDeliveryOwnershipError(
          `No durable Purchase election candidate exists for ${current.id}`
        );
      }

      // A duplicate job for an already-active row must never reuse another
      // worker's lease token. The owning attempt (or settlement retry) proceeds.
      if (winner.id === current.id && isDurableDeliveryOwner(current, now)) {
        const acceptedSettlement =
          current.deliveryClaimOwner === WORKER_ACCEPTED_CLAIM_OWNER;
        const retryableSameIdentity =
          (current.deliveryClaimOwner === WORKER_CLAIM_OWNER ||
            current.deliveryClaimOwner === WORKER_ATTEMPTING_CLAIM_OWNER) &&
          !!current.deliveryClaimExpiresAt &&
          current.deliveryClaimExpiresAt.getTime() <= now.getTime();
        if (!acceptedSettlement && !retryableSameIdentity) {
          throw new EventDeliveryOwnershipError(
            `Another worker currently owns delivery for ${current.id}`
          );
        }
      }

      // Every losing deliverable row becomes terminal before a newly elected
      // winner can leave this transaction and perform outbound I/O. Existing
      // active claims are never revoked; encountering one other than the chosen
      // winner is an unsafe legacy state and therefore fails closed.
      for (const peer of [...sortedPeers].sort((left, right) => left.id.localeCompare(right.id))) {
        if (peer.id === winner.id || !DELIVERABLE_STATUSES.includes(peer.status)) {
          continue;
        }
        const superseded = await transaction.eventLog.updateMany({
          where: {
            id: peer.id,
            status: { in: DELIVERABLE_STATUSES },
            ...claimIsAvailableForTakeover(now),
          },
          data: {
            status: "SUPERSEDED",
            errorMessage:
              winner.source === "webhook"
                ? "Superseded by canonical Shopify webhook Purchase"
                : "Superseded by alias-matched Purchase delivery owner",
            nextRetryAt: null,
            ...clearedEventRetryEnvelope(),
            ...clearedEventDeliveryClaim(),
          },
        });
        if (superseded.count !== 1) {
          const latest = await transaction.eventLog.findUnique({
            where: { id: peer.id },
            select: { status: true },
          });
          if (latest?.status === "SENT" || latest?.status === "SUPERSEDED") {
            continue;
          }
          throw new EventDeliveryOwnershipError(
            `Alias-matched Purchase ${peer.id} changed during delivery election`
          );
        }
      }

      if (winner.id !== current.id) return { action: "skip" };

      // A retry of a request already accepted by the destination performs only
      // settlement. Losers were made terminal above in this same transaction,
      // so none can become an outbound winner between the SENT commit and return.
      if (
        current.deliveryClaimOwner === WORKER_ACCEPTED_CLAIM_OWNER &&
        current.deliveryClaimToken
      ) {
        const settled = await transaction.eventLog.updateMany({
          where: {
            id: current.id,
            deliveryClaimToken: current.deliveryClaimToken,
            deliveryClaimOwner: WORKER_ACCEPTED_CLAIM_OWNER,
            status: { in: DELIVERABLE_STATUSES },
          },
          data: {
            status: "SENT",
            metaResponse: (current.metaResponse ?? {
              accepted: true,
              settlementRecovered: true,
            }) as Prisma.InputJsonValue,
            errorMessage: null,
            nextRetryAt: null,
            ...clearedEventRetryEnvelope(),
            ...clearedEventDeliveryClaim(),
          },
        });
        if (settled.count !== 1) {
          throw new EventDeliveryOwnershipError(
            `Accepted delivery settlement changed during alias election for ${current.id}`
          );
        }
        return { action: "skip" };
      }

      const claimed = await transaction.eventLog.updateMany({
        where: {
          id: current.id,
          status: { in: DELIVERABLE_STATUSES },
          ...workerClaimIsAvailable(now),
        },
        data: {
          deliveryClaimToken: token,
          deliveryClaimOwner: WORKER_ATTEMPTING_CLAIM_OWNER,
          deliveryClaimedAt: now,
          deliveryClaimExpiresAt: new Date(now.getTime() + WORKER_CLAIM_TTL_MS),
          lastAttemptAt: now,
        },
      });
      if (claimed.count !== 1) {
        throw new EventDeliveryOwnershipError(
          `Purchase delivery winner ${current.id} changed before claim acquisition`
        );
      }

      return {
        action: "deliver",
        claim: { eventLogId: current.id, token },
        event: readFreshRetryEvent(current, now),
      };
    },
    { isolationLevel: "Serializable" }
  );
}

function readFreshRetryEvent(
  eventLog: {
    eventName: string;
    eventId: string;
    retryPayloadEncrypted: string | null;
    retryPayloadIv: string | null;
    retryPayloadTag: string | null;
    retryPayloadExpiresAt: Date | null;
  },
  now: Date
): EventRetryEnvelope["event"] | null {
  const hasEnvelopeColumn = !!(
    eventLog.retryPayloadEncrypted ||
    eventLog.retryPayloadIv ||
    eventLog.retryPayloadTag ||
    eventLog.retryPayloadExpiresAt
  );
  const envelope = decryptEventRetryEnvelope(eventLog, now);
  if (!envelope) {
    // Missing and expired envelopes intentionally fall back to retained BullMQ
    // data. A present, unexpired envelope that cannot decrypt is corruption and
    // must fail closed instead of sending stale browser identity.
    if (
      hasEnvelopeColumn &&
      (!eventLog.retryPayloadExpiresAt ||
        eventLog.retryPayloadExpiresAt.getTime() > now.getTime())
    ) {
      throw new EventDeliveryOwnershipError(
        `Current retry envelope for ${eventLog.eventId} is incomplete or unreadable`
      );
    }
    return null;
  }
  if (
    envelope.event.eventId !== eventLog.eventId ||
    envelope.event.eventName !== eventLog.eventName
  ) {
    throw new EventDeliveryOwnershipError(
      `Current retry envelope does not match EventLog identity ${eventLog.eventId}`
    );
  }
  return envelope.event;
}

/**
 * Establish durable ownership immediately before destination I/O.
 *
 * The worker and Shopify webhook both CAS the same EventLog claim columns. If
 * the worker wins, webhook reconciliation defers until this claim settles. If
 * the webhook wins, a different-ID fallback becomes SUPERSEDED and cannot be
 * claimed. Same-ID webhook upgrades are read only after the worker has won the
 * claim, so the returned encrypted retry event is always the latest committed
 * canonical payload rather than stale BullMQ job.data.
 */
async function establishEventDeliveryClaim(
  eventLogId: string | null | undefined,
  now = new Date()
): Promise<EventDeliveryClaimResult> {
  // Legacy retained jobs predating full EventLog coverage remain drainable.
  if (!eventLogId) {
    return {
      action: "deliver",
      claim: { eventLogId: null, token: null },
      event: null,
    };
  }

  const eventLog = await db.eventLog.findUnique({
    where: { id: eventLogId },
    select: {
      id: true,
      workspaceId: true,
      eventName: true,
      eventId: true,
      destination: true,
      status: true,
      source: true,
      orderId: true,
      orderName: true,
      checkoutToken: true,
      cartToken: true,
      deliveryClaimToken: true,
      deliveryClaimOwner: true,
      metaResponse: true,
    },
  });

  // A retained job without its durable outbox row must never send blindly.
  if (!eventLog || eventLog.status === "SENT" || eventLog.status === "SUPERSEDED") {
    return { action: "skip" };
  }

  if (eventLog.eventName === "Purchase") {
    const election = await establishAliasedPurchaseClaim(eventLog.id, now);
    if (election) return election;
  }

  // A prior attempt received an accepted destination response but could not
  // commit SENT. Aliased fallback Purchases settle inside their election
  // transaction above; every other event can finish the direct token CAS here.
  if (
    eventLog.deliveryClaimOwner === WORKER_ACCEPTED_CLAIM_OWNER &&
    eventLog.deliveryClaimToken
  ) {
    await completeEventDeliveryClaim(
      { eventLogId: eventLog.id, token: eventLog.deliveryClaimToken },
      eventLog.metaResponse ?? { accepted: true, settlementRecovered: true }
    );
    return { action: "skip" };
  }

  const token = randomUUID();
  const claimed = await db.eventLog.updateMany({
    where: {
      id: eventLog.id,
      status: { in: DELIVERABLE_STATUSES },
      ...workerClaimIsAvailable(now),
    },
    data: {
      deliveryClaimToken: token,
      deliveryClaimOwner: WORKER_ATTEMPTING_CLAIM_OWNER,
      deliveryClaimedAt: now,
      deliveryClaimExpiresAt: new Date(now.getTime() + WORKER_CLAIM_TTL_MS),
      lastAttemptAt: now,
    },
  });

  if (claimed.count !== 1) {
    const current = await db.eventLog.findUnique({
      where: { id: eventLog.id },
      select: {
        status: true,
        deliveryClaimOwner: true,
        deliveryClaimExpiresAt: true,
      },
    });
    if (!current || current.status === "SENT" || current.status === "SUPERSEDED") {
      return { action: "skip" };
    }
    throw new EventDeliveryOwnershipError(
      current.deliveryClaimOwner === WEBHOOK_CLAIM_OWNER
        ? `Shopify webhook currently owns delivery reconciliation for ${eventLog.id}`
        : `Another worker currently owns delivery for ${eventLog.id}`
    );
  }

  try {
    const fresh = await db.eventLog.findUnique({
      where: { id: eventLog.id },
      select: {
        eventName: true,
        eventId: true,
        status: true,
        deliveryClaimToken: true,
        deliveryClaimOwner: true,
        retryPayloadEncrypted: true,
        retryPayloadIv: true,
        retryPayloadTag: true,
        retryPayloadExpiresAt: true,
      },
    });
    if (
      !fresh ||
      !DELIVERABLE_STATUSES.includes(fresh.status) ||
      fresh.deliveryClaimToken !== token ||
      fresh.deliveryClaimOwner !== WORKER_ATTEMPTING_CLAIM_OWNER
    ) {
      throw new EventDeliveryOwnershipError(
        `Delivery claim for ${eventLog.id} could not be verified after acquisition`
      );
    }

    return {
      action: "deliver",
      claim: { eventLogId: eventLog.id, token },
      event: readFreshRetryEvent(fresh, now),
    };
  } catch (error) {
    // Do not strand a worker lease when the authoritative envelope cannot be
    // read. The attempt still fails closed and BullMQ may retry safely.
    await db.eventLog
      .updateMany({
        where: {
          id: eventLog.id,
          deliveryClaimToken: token,
          deliveryClaimOwner: WORKER_ATTEMPTING_CLAIM_OWNER,
        },
        data: clearedEventDeliveryClaim(),
      })
      .catch(() => {});
    throw error;
  }
}

export async function claimEventDelivery(
  eventLogId: string | null | undefined,
  now = new Date()
): Promise<EventDeliveryClaimResult> {
  try {
    return await establishEventDeliveryClaim(eventLogId, now);
  } catch (error) {
    if (error instanceof EventDeliveryOwnershipError) throw error;
    throw new EventDeliveryOwnershipError(
      `Unable to establish durable delivery ownership${eventLogId ? ` for ${eventLogId}` : ""}`,
      error
    );
  }
}

/**
 * Atomically reserve all matching rows before canonical webhook takeover. The
 * sorted interactive transaction avoids partial destination ownership and
 * minimizes deadlock risk when two duplicate webhook deliveries race.
 */
export async function reserveEventDeliveriesForWebhook(
  eventLogIds: string[],
  now = new Date()
): Promise<WebhookDeliveryReservation> {
  const ids = Array.from(new Set(eventLogIds)).sort();
  const token = randomUUID();
  if (ids.length === 0) return { token, eventLogIds: ids };

  await db.$transaction(
    async (transaction) => {
      for (const id of ids) {
        const reserved = await transaction.eventLog.updateMany({
          where: {
            id,
            status: { in: DELIVERABLE_STATUSES },
            ...claimIsAvailableForTakeover(now),
          },
          data: {
            deliveryClaimToken: token,
            deliveryClaimOwner: WEBHOOK_CLAIM_OWNER,
            deliveryClaimedAt: now,
            deliveryClaimExpiresAt: new Date(
              now.getTime() + WEBHOOK_RESERVATION_TTL_MS
            ),
          },
        });
        if (reserved.count !== 1) {
          throw new EventDeliveryOwnershipError(
            `EventLog ${id} changed state or is owned by an active worker`
          );
        }
      }
    },
    { isolationLevel: "Serializable" }
  );

  return { token, eventLogIds: ids };
}

/** Mark a successful/skipped outbound attempt only when this worker still owns it. */
export async function completeEventDeliveryClaim(
  claim: EventDeliveryClaim,
  response: unknown
): Promise<void> {
  if (!claim.eventLogId || !claim.token) return;
  let completed: { count: number };
  try {
    completed = await db.eventLog.updateMany({
      where: {
        id: claim.eventLogId,
        deliveryClaimToken: claim.token,
        deliveryClaimOwner: {
          in: [
            WORKER_CLAIM_OWNER,
            WORKER_ATTEMPTING_CLAIM_OWNER,
            WORKER_ACCEPTED_CLAIM_OWNER,
          ],
        },
        status: { in: DELIVERABLE_STATUSES },
      },
      data: {
        status: "SENT",
        metaResponse: response as Prisma.InputJsonValue,
        errorMessage: null,
        nextRetryAt: null,
        ...clearedEventRetryEnvelope(),
        ...clearedEventDeliveryClaim(),
      },
    });
  } catch (error) {
    throw new EventDeliveryOwnershipError(
      `Unable to commit delivery completion for ${claim.eventLogId}`,
      error
    );
  }
  if (completed.count !== 1) {
    throw new EventDeliveryOwnershipError(
      `Delivery completion lost ownership for ${claim.eventLogId}`
    );
  }
}

/**
 * Persist proof that the destination accepted the request before clearing the
 * lease. If the subsequent SENT commit fails, this non-expiring owner makes
 * every worker retry settlement-only and makes Shopify canonical takeover
 * defer instead of creating a different outbound Purchase identity.
 */
export async function markEventDeliveryAccepted(
  claim: EventDeliveryClaim,
  response: unknown,
  acceptedAt = new Date()
): Promise<void> {
  if (!claim.eventLogId || !claim.token) return;
  let accepted: { count: number };
  try {
    accepted = await db.eventLog.updateMany({
      where: {
        id: claim.eventLogId,
        deliveryClaimToken: claim.token,
        deliveryClaimOwner: {
          in: [WORKER_CLAIM_OWNER, WORKER_ATTEMPTING_CLAIM_OWNER],
        },
        status: { in: DELIVERABLE_STATUSES },
      },
      data: {
        deliveryClaimOwner: WORKER_ACCEPTED_CLAIM_OWNER,
        deliveryClaimedAt: acceptedAt,
        deliveryClaimExpiresAt: null,
        metaResponse: response as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    throw new EventDeliveryOwnershipError(
      `Unable to preserve accepted delivery ownership for ${claim.eventLogId}`,
      error
    );
  }
  if (accepted.count !== 1) {
    const current = await db.eventLog.findUnique({
      where: { id: claim.eventLogId },
      select: { status: true },
    });
    if (current?.status === "SENT") return;
    throw new EventDeliveryOwnershipError(
      `Accepted delivery lost ownership for ${claim.eventLogId}`
    );
  }
}

/**
 * Persist one failed attempt without overwriting a webhook reservation or a
 * terminal result. An ambiguous outbound attempt keeps this EventLog as the
 * permanent identity owner. A known pre-I/O failure or explicit non-transient
 * destination rejection releases the identity so a later canonical webhook
 * may take over.
 */
export async function failEventDeliveryClaim(input: {
  eventLogId: string | null | undefined;
  claim: EventDeliveryClaim | null;
  outcome: EventDeliveryFailureOutcome;
  status: "RETRYING" | "FAILED";
  errorMessage: string;
  nextRetryAt: Date | null;
  failedAt?: Date;
}): Promise<void> {
  if (!input.eventLogId) return;
  const failedAt = input.failedAt ?? new Date();
  const where = input.claim?.token
    ? {
        id: input.eventLogId,
        deliveryClaimToken: input.claim.token,
        deliveryClaimOwner: {
          in: [WORKER_CLAIM_OWNER, WORKER_ATTEMPTING_CLAIM_OWNER],
        },
        status: { in: DELIVERABLE_STATUSES },
      }
    : {
        id: input.eventLogId,
        status: { in: DELIVERABLE_STATUSES },
        ...claimIsAvailableForTakeover(failedAt),
      };
  const failed = await db.eventLog.updateMany({
    where,
    data: {
      status: input.status,
      errorMessage: input.errorMessage,
      retryCount: { increment: 1 },
      lastAttemptAt: failedAt,
      nextRetryAt: input.nextRetryAt,
      ...(input.claim?.token
        ? input.outcome === "DEFINITELY_NOT_DELIVERED"
          ? clearedEventDeliveryClaim()
          : {
              deliveryClaimOwner: WORKER_ATTEMPTING_CLAIM_OWNER,
              deliveryClaimExpiresAt: failedAt,
            }
        : {}),
    },
  });
  if (input.claim?.token && failed.count !== 1) {
    throw new EventDeliveryOwnershipError(
      `Delivery failure lost ownership for ${input.eventLogId}`
    );
  }
}

/**
 * Compatibility wrapper for callers that only need a yes/no ownership guard.
 * New destination workers use claimEventDelivery and token-checked completion.
 */
export async function shouldSkipEventDelivery(
  eventLogId: string | null | undefined
): Promise<boolean> {
  const claimed = await claimEventDelivery(eventLogId);
  if (claimed.action === "skip") return true;
  if (claimed.claim.token) {
    // This wrapper must not strand a lease. It is retained only for rolling
    // compatibility; current workers never call it.
    await db.eventLog.updateMany({
      where: {
        id: claimed.claim.eventLogId!,
        deliveryClaimToken: claimed.claim.token,
        deliveryClaimOwner: {
          in: [WORKER_CLAIM_OWNER, WORKER_ATTEMPTING_CLAIM_OWNER],
        },
      },
      data: clearedEventDeliveryClaim(),
    });
  }
  return false;
}
