import { Worker, Job, UnrecoverableError, DelayedError } from "bullmq";
import IORedis from "ioredis";
import { db } from "@/lib/db";
import {
  buildGoogleAdsIngestRequest, googleAdsDeliveryTargetId, googleAdsUploadNotBefore, normalizeGoogleAdsConversionActionId,
  normalizeGoogleAdsCustomerId, normalizeToGoogleAdsEvent, sendToGoogleAds, GoogleAdsApiError,
} from "@/lib/destinations/google-ads";
import { GOOGLE_STATUS_FIRST_CHECK_MS } from "@/lib/google-ads-request-status";
import { shouldSendToDestination } from "@/lib/consent";
import { isDestinationAllowedForWorkspace } from "@/lib/workspace-mode";
import { lookupSessionContextByIdentifiers } from "@/lib/session-enrichment";
import { QUEUE_CONFIG } from "@/lib/constants";
import { createLogger } from "@/lib/logger";
import { isCircuitClosed, recordSuccess, recordFailure, shouldRecordCircuitFailure,
  shouldRetryDeliveryFailure, CircuitOpenError } from "@/lib/circuit-breaker";
import { DESTINATION_WORKER_CONCURRENCY, WORKER_LOCK_DURATION_MS,
  WORKER_MAX_STALLED_COUNT, WORKER_STALLED_INTERVAL_MS } from "./worker-options";
import type { DestinationEventJob } from "@/lib/queue";
import { claimEventDelivery, completeEventDeliveryClaim, failEventDeliveryClaim,
  isEventDeliverySuperseded, markEventDeliveryAccepted, type EventDeliveryClaim } from "@/lib/event-delivery-guard";

/**
 * Holds an upload until Google accepts its click (see GOOGLE_CLICK_SETTLE_MS).
 * The job is moved back to delayed, and the row's nextRetryAt keeps durable
 * recovery from treating the held row as stale until it is due.
 */
async function holdUntilGoogleAcceptsClick(
  job: Job<DestinationEventJob>, eventLogId: string, token: string | undefined
): Promise<boolean> {
  const row = await db.eventLog.findUnique({ where: { id: eventLogId }, select: { occurredAt: true } });
  if (!row?.occurredAt) return false;
  const notBefore = googleAdsUploadNotBefore(row.occurredAt);
  if (notBefore.getTime() <= Date.now()) return false;
  await db.eventLog.updateMany({ where: { id: eventLogId, status: "PENDING" }, data: { nextRetryAt: notBefore } });
  await job.moveToDelayed(notBefore.getTime(), token);
  return true;
}

export async function processGoogleAdsEvent(job: Job<DestinationEventJob>, token?: string): Promise<void> {
  const { workspaceId, eventLogId } = job.data;
  let claim: EventDeliveryClaim | null = null;
  let outboundStarted = false;
  let accepted = false;
  try {
    if (!eventLogId) throw new GoogleAdsApiError("Google Ads requires a durable delivery record", 400);
    if (await isEventDeliverySuperseded(eventLogId)) return;
    if (await holdUntilGoogleAcceptsClick(job, eventLogId, token)) throw new DelayedError();
    if (!await isCircuitClosed("GOOGLE_ADS", workspaceId)) throw new CircuitOpenError("GOOGLE_ADS", workspaceId);
    const ownership = await claimEventDelivery(eventLogId);
    if (ownership.action === "skip") return;
    claim = ownership.claim;
    // Never reconstruct expired shopper context or event times from a retained job.
    if (!ownership.event) throw new GoogleAdsApiError("Google Ads retry context expired or missing", 400);
    const event = ownership.event as DestinationEventJob["event"];
    const [workspace, row] = await Promise.all([
      db.workspace.findUnique({ where: { id: workspaceId } }),
      db.eventLog.findUnique({ where: { id: eventLogId }, select: {
        workspaceId: true, destination: true, occurredAt: true, deliveryTargetId: true,
        orderId: true, orderName: true, checkoutToken: true, cartToken: true,
      } }),
    ]);
    if (!workspace?.isActive || !workspace.enableGoogleAds || !isDestinationAllowedForWorkspace(workspace, "GOOGLE_ADS")) {
      throw new GoogleAdsApiError("Google Ads delivery disabled for this workspace", 400);
    }
    const customerId = normalizeGoogleAdsCustomerId(workspace.googleAdsCustomerId);
    const conversionActionId = normalizeGoogleAdsConversionActionId(workspace.googleAdsConversionActionId);
    if (!customerId || !conversionActionId) {
      throw new GoogleAdsApiError("Google Ads account or conversion action not configured", 400);
    }
    const target = googleAdsDeliveryTargetId(customerId, conversionActionId);
    if (!row || row.workspaceId !== workspaceId || row.destination !== "GOOGLE_ADS" ||
        !row.occurredAt || row.deliveryTargetId !== target || event.googleAdsTargetId !== target) {
      throw new GoogleAdsApiError("Google Ads delivery target or original timestamp changed or missing", 400);
    }
    if (event.eventName !== "Purchase" || !workspace.enablePurchase) {
      throw new GoogleAdsApiError("Google Ads event disabled", 400);
    }
    const latest = await lookupSessionContextByIdentifiers(workspaceId, {
      trackclearSessionId: event.trackclearSessionId,
      email: typeof event.userData.email === "string" ? event.userData.email : null,
      orderId: row.orderId, orderName: row.orderName,
      checkoutToken: row.checkoutToken, cartToken: row.cartToken,
    }, { failClosed: true });
    const capturedConsent = {
      marketing: event.consent?.marketingAllowed, saleOfData: event.consent?.saleOfDataAllowed,
    };
    if (!shouldSendToDestination(workspace.consentMode, capturedConsent, "GOOGLE_ADS") ||
        (latest?.marketingClearedAt && latest.marketingClearedAt >= row.occurredAt.getTime()) ||
        latest?.consent?.marketing === false || latest?.consent?.saleOfData === false) {
      throw new GoogleAdsApiError("Google Ads delivery blocked by consent", 400);
    }
    const normalized = normalizeToGoogleAdsEvent({ ...event, timestamp: row.occurredAt.getTime() }, Date.now(), row.orderId);
    const request = buildGoogleAdsIngestRequest({
      customerId, conversionActionId,
      loginCustomerId: normalizeGoogleAdsCustomerId(workspace.googleAdsLoginCustomerId),
    }, normalized, event.consent);
    outboundStarted = true;
    const receipt = await sendToGoogleAds(request);
    accepted = true;
    // Google processes the upload asynchronously. The request ID is kept with
    // the accepted state so the status poller can confirm or report it later.
    const acceptedAt = new Date();
    await markEventDeliveryAccepted(claim, receipt, acceptedAt, {
      destinationRequestId: receipt.requestId,
      destinationRequestStatus: "PROCESSING",
      destinationStatusCheckedAt: null,
      destinationStatusNextCheckAt: new Date(acceptedAt.getTime() + GOOGLE_STATUS_FIRST_CHECK_MS),
    });
    await recordSuccess("GOOGLE_ADS", workspaceId).catch(() => {});
    await completeEventDeliveryClaim(claim, receipt);
  } catch (error) {
    // A held upload has been rescheduled; it is neither failed nor retried.
    if (error instanceof DelayedError) throw error;
    const terminal = error instanceof GoogleAdsApiError && !shouldRetryDeliveryFailure(error);
    const transient = !terminal;
    if (shouldRecordCircuitFailure(error)) await recordFailure("GOOGLE_ADS", workspaceId).catch(() => {});
    const retryAfter = error instanceof GoogleAdsApiError ? error.retryAfterMs : 0;
    const message = error instanceof GoogleAdsApiError || error instanceof CircuitOpenError
      ? error.message : "Google Ads delivery temporarily unavailable";
    // A Retry-After delay is handled by durable recovery, avoiding immediate
    // BullMQ retries while the provider is explicitly rate limiting us.
    const willRetry = transient && retryAfter === 0 && job.attemptsMade + 1 < (job.opts.attempts ?? 3);
    if (eventLogId && !accepted) {
      const now = new Date();
      await failEventDeliveryClaim({ eventLogId, claim,
        outcome: !outboundStarted || error instanceof GoogleAdsApiError
          ? "DEFINITELY_NOT_DELIVERED" : "DELIVERY_AMBIGUOUS",
        status: willRetry ? "RETRYING" : "FAILED", errorMessage: message, failedAt: now,
        nextRetryAt: !willRetry && transient ? new Date(now.getTime() + Math.max(retryAfter, 15 * 60 * 1000)) : null,
      });
    }
    if (terminal || retryAfter > 0) throw new UnrecoverableError(message);
    throw error;
  }
}

const log = createLogger({ component: "google-ads-worker" });
const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null, lazyConnect: true,
});
export const googleAdsWorker = new Worker<DestinationEventJob>(QUEUE_CONFIG.GOOGLE_ADS_QUEUE_NAME,
  processGoogleAdsEvent, { connection: connection as never, autorun: false,
    concurrency: DESTINATION_WORKER_CONCURRENCY, lockDuration: WORKER_LOCK_DURATION_MS,
    stalledInterval: WORKER_STALLED_INTERVAL_MS, maxStalledCount: WORKER_MAX_STALLED_COUNT });
connection.on("error", () => log.error("Worker Redis connection unavailable"));
googleAdsWorker.on("error", () => log.error("Google Ads worker error"));
googleAdsWorker.on("failed", (job) => log.warn("Google Ads job failed", { jobId: job?.id }));
googleAdsWorker.on("stalled", (jobId) => log.warn("Google Ads job stalled", { jobId }));
