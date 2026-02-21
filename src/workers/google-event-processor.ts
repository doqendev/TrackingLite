import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import {
  sendGoogleAdsConversion,
  getConversionLabel,
  GoogleAdsError,
} from "@/lib/destinations/google-ads";
import { decrypt } from "@/lib/encryption";
import { db } from "@/lib/db";
import { QUEUE_CONFIG } from "@/lib/constants";
import { createLogger } from "@/lib/logger";
import { getWorkspaceForDestination } from "@/lib/workspace-cache";
import type { DestinationEventJob } from "@/lib/queue";

async function processGoogleEvent(job: Job<DestinationEventJob>): Promise<void> {
  const { workspaceId, eventLogId, event } = job.data;

  const log = createLogger({
    component: "google-worker",
    jobId: job.id,
    workspaceId,
    eventName: event.eventName,
    requestId: job.data.requestId,
  });

  log.info("Processing job", { eventLogId: eventLogId ?? "fire-and-forget" });

  try {
    // Resolve credentials: backward compat for old-format jobs, otherwise DB lookup
    const decryptLabel = (enc: unknown, iv: unknown, tag: unknown): string => {
      if (!enc || !iv || !tag) return "";
      return decrypt(enc as string, iv as string, tag as string);
    };

    let conversionId: string;
    let decryptedCredentials: Record<string, string>;

    const oldCredentials = (job.data as unknown as Record<string, unknown>).credentials as Record<string, string> | undefined;

    if (oldCredentials?.conversionId) {
      // Old format: credentials in job data (drain existing queued jobs)
      if (!oldCredentials.conversionIdIv || !oldCredentials.conversionIdTag) {
        if (eventLogId) {
          await db.eventLog.update({
            where: { id: eventLogId },
            data: { status: "FAILED", errorMessage: "Google Ads conversion ID not configured" },
          });
        }
        return;
      }
      conversionId = decrypt(oldCredentials.conversionId, oldCredentials.conversionIdIv, oldCredentials.conversionIdTag);
      decryptedCredentials = {
        viewContentLabel: decryptLabel(oldCredentials.viewContentLabel, oldCredentials.viewContentLabelIv, oldCredentials.viewContentLabelTag),
        addToCartLabel: decryptLabel(oldCredentials.addToCartLabel, oldCredentials.addToCartLabelIv, oldCredentials.addToCartLabelTag),
        checkoutLabel: decryptLabel(oldCredentials.checkoutLabel, oldCredentials.checkoutLabelIv, oldCredentials.checkoutLabelTag),
        purchaseLabel: decryptLabel(oldCredentials.purchaseLabel, oldCredentials.purchaseLabelIv, oldCredentials.purchaseLabelTag),
      };
    } else {
      // New format: look up workspace from DB
      const workspace = await getWorkspaceForDestination(workspaceId, "GOOGLE_ADS");
      if (!workspace || !workspace.isActive) {
        throw new Error(`Workspace ${workspaceId} not found or inactive`);
      }
      if (!workspace.googleAdsConversionIdEncrypted) {
        if (eventLogId) {
          await db.eventLog.update({
            where: { id: eventLogId },
            data: { status: "FAILED", errorMessage: "Google Ads conversion ID not configured" },
          });
        }
        return;
      }
      conversionId = decrypt(
        workspace.googleAdsConversionIdEncrypted as string,
        workspace.googleAdsConversionIdIv as string,
        workspace.googleAdsConversionIdTag as string
      );
      decryptedCredentials = {
        viewContentLabel: decryptLabel(workspace.googleAdsViewContentLabelEncrypted, workspace.googleAdsViewContentLabelIv, workspace.googleAdsViewContentLabelTag),
        addToCartLabel: decryptLabel(workspace.googleAdsAddToCartLabelEncrypted, workspace.googleAdsAddToCartLabelIv, workspace.googleAdsAddToCartLabelTag),
        checkoutLabel: decryptLabel(workspace.googleAdsCheckoutLabelEncrypted, workspace.googleAdsCheckoutLabelIv, workspace.googleAdsCheckoutLabelTag),
        purchaseLabel: decryptLabel(workspace.googleAdsPurchaseLabelEncrypted, workspace.googleAdsPurchaseLabelIv, workspace.googleAdsPurchaseLabelTag),
      };
    }

    log.debug("Decrypted conversionId", { length: conversionId.length });
    log.debug("Decrypted labels", {
      viewContent: !!decryptedCredentials.viewContentLabel,
      addToCart: !!decryptedCredentials.addToCartLabel,
      checkout: !!decryptedCredentials.checkoutLabel,
      purchase: !!decryptedCredentials.purchaseLabel,
    });

    // Look up the per-event label from decrypted credentials
    const conversionLabel = getConversionLabel(
      event.eventName,
      decryptedCredentials
    );
    log.debug("Resolved conversion label", { hasLabel: !!conversionLabel });

    if (!conversionLabel) {
      // Event type has no label configured — skip silently
      if (eventLogId) {
        await db.eventLog.update({
          where: { id: eventLogId },
          data: {
            status: "SENT",
            metaResponse: {
              skipped: true,
              reason: `No conversion label configured for ${event.eventName}`,
            } as never,
          },
        });
      }
      log.info("Job skipped: no label configured for event");
      return;
    }

    const cd = event.customData as Record<string, unknown>;
    const value = cd.value !== undefined && cd.value !== null ? Number(cd.value) : undefined;
    const currency = cd.currency ? String(cd.currency) : undefined;
    const orderId = cd.orderId ? String(cd.orderId) : undefined;
    const gclid = event.gclid ? String(event.gclid) : undefined;

    const response = await sendGoogleAdsConversion({
      conversionId,
      conversionLabel,
      value,
      currency,
      orderId,
      gclid,
      eventName: event.eventName,
    });

    if (eventLogId) {
      await db.eventLog.update({
        where: { id: eventLogId },
        data: { status: "SENT", metaResponse: response as never },
      });
    }

    log.info("Job completed");
  } catch (error) {
    const errorMessage =
      error instanceof GoogleAdsError
        ? `Google Ads HTTP ${error.statusCode}: ${error.message}`
        : error instanceof Error
        ? `${error.name}: ${error.message}`
        : "Unknown error";

    log.error("Job error", { error: errorMessage });

    if (eventLogId) {
      await db.eventLog
        .update({
          where: { id: eventLogId },
          data: {
            status: "FAILED",
            errorMessage,
            retryCount: { increment: 1 },
          },
        })
        .catch((dbErr) => {
          log.error("Failed to update EventLog", { eventLogId, error: dbErr instanceof Error ? dbErr.message : String(dbErr) });
        });
    }

    // Re-throw so BullMQ can retry with exponential backoff
    throw error;
  }
}

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

export const googleWorker = new Worker<DestinationEventJob>(
  QUEUE_CONFIG.GOOGLE_QUEUE_NAME,
  processGoogleEvent,
  {
    connection: connection as never,
    concurrency: 10,
    lockDuration: 60000,
  }
);

const workerLog = createLogger({ component: "google-worker" });

googleWorker.on("completed", (job) => {
  workerLog.info("Job completed", { jobId: job.id });
});

googleWorker.on("failed", (job, err) => {
  workerLog.error("Job failed", { jobId: job?.id, error: err.message });
});

googleWorker.on("error", (err) => {
  workerLog.error("Worker error", { error: err.message });
});

export { processGoogleEvent };
