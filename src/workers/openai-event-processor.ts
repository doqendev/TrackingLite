import { Worker, Job, UnrecoverableError } from "bullmq";
import IORedis from "ioredis";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { normalizeToOpenAIEvent, sendToOpenAI, OpenAIApiError } from "@/lib/destinations/openai";
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

export async function processOpenAIEvent(job: Job<DestinationEventJob>): Promise<void> {
  const { workspaceId, eventLogId } = job.data;
  let claim: EventDeliveryClaim | null = null;
  let outboundStarted = false;
  let accepted = false;
  try {
    if (!eventLogId) throw new OpenAIApiError("ChatGPT Ads requires a durable delivery record", 400);
    if (await isEventDeliverySuperseded(eventLogId)) return;
    if (!await isCircuitClosed("OPENAI", workspaceId)) throw new CircuitOpenError("OPENAI", workspaceId);
    const ownership = await claimEventDelivery(eventLogId);
    if (ownership.action === "skip") return;
    claim = ownership.claim;
    // Never reconstruct expired shopper context or event times from a retained job.
    if (!ownership.event) throw new OpenAIApiError("ChatGPT Ads retry context expired or missing", 400);
    const event = ownership.event as DestinationEventJob["event"];
    const [workspace, row] = await Promise.all([
      db.workspace.findUnique({ where: { id: workspaceId } }),
      db.eventLog.findUnique({ where: { id: eventLogId }, select: {
        workspaceId: true, destination: true, occurredAt: true, deliveryTargetId: true,
        orderId: true, orderName: true, checkoutToken: true, cartToken: true,
      } }),
    ]);
    if (!workspace?.isActive || !workspace.enableOpenAI || !isDestinationAllowedForWorkspace(workspace, "OPENAI")) {
      throw new OpenAIApiError("ChatGPT Ads delivery disabled for this workspace", 400);
    }
    if (!row || row.workspaceId !== workspaceId || row.destination !== "OPENAI" ||
        !row.occurredAt || !row.deliveryTargetId || row.deliveryTargetId !== workspace.openaiPixelId ||
        row.deliveryTargetId !== event.openaiPixelId) {
      throw new OpenAIApiError("ChatGPT Ads delivery target or original timestamp changed or missing", 400);
    }
    const toggles: Record<string, boolean> = {
      PageView: workspace.enablePageView, ViewContent: workspace.enableViewContent,
      AddToCart: workspace.enableAddToCart, InitiateCheckout: workspace.enableInitiateCheckout,
      Purchase: workspace.enablePurchase,
    };
    if (!toggles[event.eventName]) throw new OpenAIApiError("ChatGPT Ads event disabled", 400);
    if (!workspace.openaiApiKeyEncrypted || !workspace.openaiApiKeyIv || !workspace.openaiApiKeyTag) {
      throw new OpenAIApiError("ChatGPT Ads credentials not configured", 400);
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
    if (!shouldSendToDestination(workspace.consentMode, capturedConsent, "OPENAI") ||
        (latest?.marketingClearedAt && latest.marketingClearedAt >= row.occurredAt.getTime()) ||
        latest?.consent?.marketing === false || latest?.consent?.saleOfData === false) {
      throw new OpenAIApiError("ChatGPT Ads delivery blocked by consent", 400);
    }
    const normalized = normalizeToOpenAIEvent({ ...event, timestamp: row.occurredAt.getTime() });
    const key = decrypt(workspace.openaiApiKeyEncrypted, workspace.openaiApiKeyIv, workspace.openaiApiKeyTag);
    outboundStarted = true;
    const receipt = await sendToOpenAI(row.deliveryTargetId, key, normalized);
    accepted = true;
    await markEventDeliveryAccepted(claim, receipt);
    await recordSuccess("OPENAI", workspaceId).catch(() => {});
    await completeEventDeliveryClaim(claim, receipt);
  } catch (error) {
    const terminal = error instanceof OpenAIApiError && !shouldRetryDeliveryFailure(error);
    const transient = !terminal;
    if (shouldRecordCircuitFailure(error)) await recordFailure("OPENAI", workspaceId).catch(() => {});
    const retryAfter = error instanceof OpenAIApiError ? error.retryAfterMs : 0;
    const message = error instanceof OpenAIApiError || error instanceof CircuitOpenError
      ? error.message : "ChatGPT Ads delivery temporarily unavailable";
    // A Retry-After delay is handled by durable recovery, avoiding immediate
    // BullMQ retries while the provider is explicitly rate limiting us.
    const willRetry = transient && retryAfter === 0 && job.attemptsMade + 1 < (job.opts.attempts ?? 3);
    if (eventLogId && !accepted) {
      const now = new Date();
      await failEventDeliveryClaim({ eventLogId, claim,
        outcome: !outboundStarted || error instanceof OpenAIApiError
          ? "DEFINITELY_NOT_DELIVERED" : "DELIVERY_AMBIGUOUS",
        status: willRetry ? "RETRYING" : "FAILED", errorMessage: message, failedAt: now,
        nextRetryAt: !willRetry && transient ? new Date(now.getTime() + Math.max(retryAfter, 15 * 60 * 1000)) : null,
      });
    }
    if (terminal || retryAfter > 0) throw new UnrecoverableError(message);
    throw error;
  }
}

const log = createLogger({ component: "openai-worker" });
const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null, lazyConnect: true,
});
export const openaiWorker = new Worker<DestinationEventJob>(QUEUE_CONFIG.OPENAI_QUEUE_NAME,
  processOpenAIEvent, { connection: connection as never, autorun: false,
    concurrency: DESTINATION_WORKER_CONCURRENCY, lockDuration: WORKER_LOCK_DURATION_MS,
    stalledInterval: WORKER_STALLED_INTERVAL_MS, maxStalledCount: WORKER_MAX_STALLED_COUNT });
connection.on("error", () => log.error("Worker Redis connection unavailable"));
openaiWorker.on("error", () => log.error("ChatGPT Ads worker error"));
openaiWorker.on("failed", (job) => log.warn("ChatGPT Ads job failed", { jobId: job?.id }));
openaiWorker.on("stalled", (jobId) => log.warn("ChatGPT Ads job stalled", { jobId }));
