import type { ConsentMode, Destination, Prisma } from "@prisma/client";
import type { Queue } from "bullmq";
import { db } from "@/lib/db";
import {
  getEventQueue,
  getGA4Queue,
  getOpenAIQueue,
  getPinterestQueue,
  getTiktokQueue,
} from "@/lib/queue";
import type { DestinationEventJob, MetaEventJob } from "@/lib/queue";
import { encryptEventRetryEnvelope, type EventRetryEnvelope } from "@/lib/event-retry-envelope";
import { enqueueReplayJob } from "@/lib/event-replay-queue";
import { shouldSendToDestination, type CustomerConsent } from "@/lib/consent";
import { filterDestinationsForWorkspace } from "@/lib/workspace-mode";
import { normalizePurchaseIdentifier } from "@/lib/purchase-event-id";
import {
  persistInternalAttributionEvent,
  supersedeInternalAttributionEvent,
} from "@/lib/internal-attribution";

// Shopify's checkouts/create often arrives before the shopper has typed an
// email, and checkouts/update carries it shortly after. A server-created
// InitiateCheckout waits this long so later updates enrich the same pending
// row instead of sending an anonymous event first.
export const CHECKOUT_WEBHOOK_HOLD_MS = 5 * 60 * 1000;

/**
 * One InitiateCheckout per Shopify checkout. The Custom Pixel and the signed
 * checkout/order webhooks all derive this ID from the checkout token, so the
 * EventLog outbox (unique per workspace, event ID and destination) and the ad
 * platforms' own event-ID deduplication see a single event.
 */
export function buildCheckoutEventId(workspaceId: string, checkoutToken: unknown): string | null {
  const scope = normalizePurchaseIdentifier(workspaceId) ?? "unknown";
  const token = normalizePurchaseIdentifier(checkoutToken);
  return token ? `shopify-checkout:${scope}:${token}` : null;
}

export type CheckoutEventWorkspace = {
  id: string;
  productMode?: string | null;
  installType?: string | null;
  consentMode: ConsentMode;
  enableInitiateCheckout?: boolean | null;
  enableMeta?: boolean | null;
  metaPixelId?: string | null;
  metaAccessTokenEncrypted?: string | null;
  enableTikTok?: boolean | null;
  tiktokAccessTokenEncrypted?: string | null;
  enableOpenAI?: boolean | null;
  openaiPixelId?: string | null;
  openaiApiKeyEncrypted?: string | null;
  enableGA4?: boolean | null;
  ga4MeasurementId?: string | null;
  ga4ApiSecretEncrypted?: string | null;
  enablePinterest?: boolean | null;
  pinterestConversionTokenEncrypted?: string | null;
};

type CheckoutDestination = { destination: Destination; queue: Queue; jobName: string };

// Klaviyo is left out on purpose: the Custom Pixel already sends Klaviyo its own
// Started Checkout with the shopper's contact details. Reddit and Google Ads
// have no InitiateCheckout mapping.
function checkoutDestinations(workspace: CheckoutEventWorkspace): CheckoutDestination[] {
  const destinations: CheckoutDestination[] = [];
  if (workspace.enableMeta && workspace.metaPixelId && workspace.metaAccessTokenEncrypted) {
    destinations.push({ destination: "META", queue: getEventQueue(), jobName: "send-meta-event" });
  }
  if (workspace.enableTikTok && workspace.tiktokAccessTokenEncrypted) {
    destinations.push({ destination: "TIKTOK", queue: getTiktokQueue(), jobName: "send-tiktok-event" });
  }
  if (workspace.enableOpenAI && workspace.openaiPixelId && workspace.openaiApiKeyEncrypted) {
    destinations.push({ destination: "OPENAI", queue: getOpenAIQueue(), jobName: "send-openai-event" });
  }
  if (workspace.enableGA4 && workspace.ga4MeasurementId && workspace.ga4ApiSecretEncrypted) {
    destinations.push({ destination: "GA4", queue: getGA4Queue(), jobName: "send-ga4-event" });
  }
  if (workspace.enablePinterest && workspace.pinterestConversionTokenEncrypted) {
    destinations.push({ destination: "PINTEREST", queue: getPinterestQueue(), jobName: "send-pinterest-event" });
  }
  return destinations;
}

export type ServerCheckoutEvent = Omit<EventRetryEnvelope["event"], "eventName" | "eventId" | "timestamp">;

export interface ServerCheckoutEventInput {
  workspace: CheckoutEventWorkspace;
  requestId: string;
  checkoutToken: string;
  cartToken: string | null;
  /** When the checkout started; the event keeps this time on every send. */
  occurredAt: Date;
  /** Delay before a newly created row is sent; 0 sends as soon as a worker claims it. */
  holdMs: number;
  /** Add the event only when this checkout has no InitiateCheckout yet (order fallback). */
  onlyIfMissing: boolean;
  consent: CustomerConsent;
  /** Shopper identity comes from the signed Shopify payload, never the browser. */
  event: ServerCheckoutEvent;
  columns: {
    payload: Prisma.InputJsonObject;
    pageUrl: string | null;
    value: number | null;
    currency: string | null;
    numItems: number | null;
    customerIp: string | null;
    userAgent: string | null;
    fbp: string | null;
    fbc: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    utmContent: string | null;
    utmTerm: string | null;
    gclid: string | null;
    gbraid: string | null;
    wbraid: string | null;
    ttclid: string | null;
    rdtCid: string | null;
    epik: string | null;
  };
  referrer: string | null;
}

export type ServerCheckoutEventResult =
  | { status: "queued"; eventId: string; created: string[]; refreshed: string[]; skipped: string[] }
  | { status: "skipped"; reason: string; eventId?: string };

function isUniqueConstraintError(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { code?: unknown }).code === "P2002";
}

const UNCLAIMED_PENDING = {
  status: "PENDING" as const,
  deliveryClaimToken: null,
  deliveryClaimOwner: null,
  deliveryClaimedAt: null,
  deliveryClaimExpiresAt: null,
};

/**
 * Persist and queue one server-side InitiateCheckout for a Shopify checkout.
 *
 * Per destination: a row under another event ID for the same checkout (an older
 * Custom Pixel with a random ID) wins and nothing is added; a pending, unclaimed
 * row under this checkout's ID is enriched in place; a claimed or settled row is
 * never reopened; otherwise a new row is created and held for `holdMs`.
 */
export async function queueServerInitiateCheckout(
  input: ServerCheckoutEventInput
): Promise<ServerCheckoutEventResult> {
  const { workspace } = input;
  if (!workspace.enableInitiateCheckout) return { status: "skipped", reason: "disabled" };

  const eventId = buildCheckoutEventId(workspace.id, input.checkoutToken);
  if (!eventId) return { status: "skipped", reason: "missing_checkout_token" };

  const eligible = filterDestinationsForWorkspace(workspace, checkoutDestinations(workspace)).filter(
    (dest) => shouldSendToDestination(workspace.consentMode, input.consent, dest.destination)
  );
  const internalReport = {
    workspaceId: workspace.id,
    eventName: "InitiateCheckout" as const,
    eventId,
    dedupKey: input.checkoutToken,
  };

  if (eligible.length === 0) {
    const analyticsOnly =
      input.consent.analytics === true &&
      (input.consent.marketing === false || input.consent.saleOfData === false);
    if (analyticsOnly) {
      await persistInternalAttributionEvent({
        ...internalReport,
        url: input.event.url || null,
        referrer: input.referrer,
        utmSource: input.columns.utmSource,
        utmMedium: input.columns.utmMedium,
        utmCampaign: input.columns.utmCampaign,
        utmContent: input.columns.utmContent,
        utmTerm: input.columns.utmTerm,
        value: input.columns.value,
        currency: input.columns.currency,
        numItems: input.columns.numItems,
      });
      return { status: "skipped", reason: "internal_analytics_only", eventId };
    }
    return { status: "skipped", reason: "no_eligible_destinations", eventId };
  }

  const tokenAliases = Array.from(
    new Set([input.checkoutToken, normalizePurchaseIdentifier(input.checkoutToken)].filter(
      (value): value is string => !!value
    ))
  );
  const existing = await db.eventLog.findMany({
    where: {
      workspaceId: workspace.id,
      eventName: "InitiateCheckout",
      destination: { in: eligible.map((dest) => dest.destination) },
      status: { not: "SUPERSEDED" },
      OR: [{ eventId }, { checkoutToken: { in: tokenAliases } }],
    },
    select: { id: true, eventId: true, destination: true },
  });

  const event: EventRetryEnvelope["event"] = {
    ...input.event,
    eventName: "InitiateCheckout",
    eventId,
    timestamp: input.occurredAt.getTime(),
  };
  const rowData = {
    ...input.columns,
    checkoutToken: input.checkoutToken,
    cartToken: input.cartToken,
    source: "webhook",
    occurredAt: input.occurredAt,
    ...encryptEventRetryEnvelope({ version: 1, event }),
  };
  const metaEvent: MetaEventJob["event"] = {
    eventName: event.eventName,
    eventId: event.eventId,
    timestamp: event.timestamp,
    url: event.url,
    referrer: event.referrer,
    trackclearSessionId: event.trackclearSessionId,
    hashedEmail: event.hashedEmail,
    hashedPhone: event.hashedPhone,
    fbp: event.fbp,
    fbc: event.fbc,
    fbclid: event.fbclid,
    gbraid: event.gbraid,
    wbraid: event.wbraid,
    userData: event.userData,
    customData: event.customData,
    clientIp: event.clientIp,
    userAgent: event.userAgent,
  };

  const refreshPending = async (id: string) => {
    const updated = await db.eventLog.updateMany({ where: { id, ...UNCLAIMED_PENDING }, data: rowData });
    return updated.count === 1;
  };

  const created: string[] = [];
  const refreshed: string[] = [];
  const skipped: string[] = [];
  for (const dest of eligible) {
    const rows = existing.filter((row) => row.destination === dest.destination);
    if (rows.some((row) => row.eventId !== eventId) || (input.onlyIfMissing && rows.length > 0)) {
      skipped.push(dest.destination);
      continue;
    }

    let eventLogId: string | null = null;
    let isNew = false;
    const sameEvent = rows.find((row) => row.eventId === eventId);
    if (sameEvent) {
      if (await refreshPending(sameEvent.id)) eventLogId = sameEvent.id;
    } else {
      try {
        const entry = await db.eventLog.create({
          data: {
            workspaceId: workspace.id,
            eventName: "InitiateCheckout",
            eventId,
            destination: dest.destination,
            status: "PENDING",
            deliveryTargetId: dest.destination === "OPENAI" ? workspace.openaiPixelId ?? null : null,
            ...rowData,
          },
          select: { id: true },
        });
        eventLogId = entry.id;
        isNew = true;
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        // Another producer created this checkout's row first. Only an
        // order-based fallback may stop here; anything else enriches it.
        const raced = await db.eventLog.findUnique({
          where: {
            workspaceId_eventId_destination: {
              workspaceId: workspace.id,
              eventId,
              destination: dest.destination,
            },
          },
          select: { id: true },
        });
        if (!raced) throw error;
        if (!input.onlyIfMissing && (await refreshPending(raced.id))) eventLogId = raced.id;
      }
    }

    if (!eventLogId) {
      skipped.push(dest.destination);
      continue;
    }

    const job: MetaEventJob | DestinationEventJob =
      dest.destination === "META"
        ? { workspaceId: workspace.id, requestId: input.requestId, event: metaEvent, eventLogId }
        : {
            workspaceId: workspace.id,
            destination: dest.destination,
            requestId: input.requestId,
            eventLogId,
            event,
          };
    await enqueueReplayJob(dest.queue, dest.jobName, eventLogId, job, {
      preferReplayData: true,
      delayMs: isNew ? input.holdMs : undefined,
    });
    (isNew ? created : refreshed).push(dest.destination);
  }

  if (created.length > 0 || refreshed.length > 0) {
    await supersedeInternalAttributionEvent(internalReport);
    return { status: "queued", eventId, created, refreshed, skipped };
  }
  return { status: "skipped", reason: "already_handled", eventId };
}
