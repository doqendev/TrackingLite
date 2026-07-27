import type { Queue } from "bullmq";
import type { DestinationEventJob, MetaEventJob } from "@/lib/queue";

export type ReplayJobData = MetaEventJob | DestinationEventJob;
export type ReplayEnqueueResult = "queued" | "already-queued" | "active" | "completed";
export type ReplayEnqueueOptions = {
  /** Prefer fresh canonical webhook fields over retained browser job fields. */
  preferReplayData?: boolean;
};

export function eventReplayJobId(eventLogId: string): string {
  return `event-${eventLogId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUsefulValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return true;
}

function mergeUsefulRecords(
  prior: unknown,
  replay: unknown,
  preferReplayData: boolean
): Record<string, unknown> {
  const priorRecord = isRecord(prior) ? prior : {};
  const replayRecord = isRecord(replay) ? replay : {};
  if (!preferReplayData) {
    return Object.keys(priorRecord).length > 0 ? priorRecord : replayRecord;
  }

  const merged: Record<string, unknown> = { ...priorRecord };
  for (const [key, value] of Object.entries(replayRecord)) {
    if (isUsefulValue(value) || !(key in merged)) merged[key] = value;
  }
  return merged;
}

function mergeRetainedJobData(
  existingData: unknown,
  replayData: ReplayJobData,
  preferReplayData = false
): ReplayJobData {
  if (!isRecord(existingData) || !isRecord(existingData.event)) return replayData;

  const priorEvent = existingData.event;
  const replayEvent = replayData.event as Record<string, unknown>;
  const mergedEvent: Record<string, unknown> = { ...priorEvent, ...replayEvent };

  // Retained jobs may still have richer, short-lived browser identity than the
  // sanitized EventLog. Empty webhook/replay values must never erase it. A
  // canonical webhook wins only when it has a useful value of its own.
  for (const field of [
    "timestamp",
    "url",
    "referrer",
    "clientIp",
    "userAgent",
    "fbp",
    "fbc",
    "fbclid",
    "gbraid",
    "wbraid",
    "ttclid",
    "ttp",
    "gclid",
    "rdtCid",
    "epik",
    "gaClientId",
  ]) {
    const preferred = preferReplayData ? replayEvent[field] : priorEvent[field];
    const fallback = preferReplayData ? priorEvent[field] : replayEvent[field];
    mergedEvent[field] = isUsefulValue(preferred)
      ? preferred
      : isUsefulValue(fallback)
        ? fallback
        : null;
  }
  // These define the durable EventLog identity and must always match the replay.
  mergedEvent.eventName = replayEvent.eventName;
  mergedEvent.eventId = replayEvent.eventId;
  mergedEvent.userData = mergeUsefulRecords(
    priorEvent.userData,
    replayEvent.userData,
    preferReplayData
  );
  mergedEvent.customData = mergeUsefulRecords(
    priorEvent.customData,
    replayEvent.customData,
    preferReplayData
  );

  return { ...replayData, event: mergedEvent } as ReplayJobData;
}

type RetainedJob = NonNullable<Awaited<ReturnType<Queue["getJob"]>>>;

async function reconcileRetainedJob(
  queue: Queue,
  existing: RetainedJob,
  jobName: string,
  jobId: string,
  data: ReplayJobData,
  options: ReplayEnqueueOptions,
  queuedResult: "queued" | "already-queued"
): Promise<ReplayEnqueueResult> {
  const state = await existing.getState();
  if (state === "failed") {
    await existing.updateData(
      mergeRetainedJobData(existing.data, data, options.preferReplayData)
    );
    await existing.retry("failed", {
      resetAttemptsMade: true,
      resetAttemptsStarted: true,
    });
    return "queued";
  }
  if (state === "completed") return "completed";
  if (state === "active") {
    // The worker already captured job.data. A canonical webhook must remain in
    // its durable inbox and reconcile after that active delivery settles.
    return "active";
  }
  if (state === "unknown") {
    // The retained job disappeared between getJob() and getState(). Re-adding
    // with the same deterministic ID is safe. Re-read it because a concurrent
    // producer can win this add too, leaving its payload under the shared ID.
    await queue.add(jobName, data, { jobId });
    if (options.preferReplayData) {
      const replacement = await queue.getJob(jobId);
      if (replacement) {
        const replacementState = await replacement.getState();
        if (replacementState === "active") return "active";
        if (replacementState === "completed") return "completed";
        if (replacementState === "failed") {
          await replacement.updateData(
            mergeRetainedJobData(replacement.data, data, options.preferReplayData)
          );
          await replacement.retry("failed", {
            resetAttemptsMade: true,
            resetAttemptsStarted: true,
          });
        } else if (
          ["waiting", "delayed", "prioritized", "waiting-children"].includes(
            replacementState
          )
        ) {
          await replacement.updateData(
            mergeRetainedJobData(replacement.data, data, options.preferReplayData)
          );
        }
      }
    }
    return "queued";
  }

  if (["waiting", "delayed", "prioritized", "waiting-children"].includes(state)) {
    await existing.updateData(
      mergeRetainedJobData(existing.data, data, options.preferReplayData)
    );
  }

  return queuedResult;
}

/**
 * Re-enqueue one EventLog without creating a duplicate while BullMQ retains its
 * completed or failed job. Callers must atomically claim the EventLog first.
 */
export async function enqueueReplayJob(
  queue: Queue,
  jobName: string,
  eventLogId: string,
  data: ReplayJobData,
  options: ReplayEnqueueOptions = {}
): Promise<ReplayEnqueueResult> {
  const jobId = eventReplayJobId(eventLogId);
  const existing = await queue.getJob(jobId);
  if (existing) {
    return reconcileRetainedJob(
      queue,
      existing,
      jobName,
      jobId,
      data,
      options,
      "already-queued"
    );
  }

  try {
    await queue.add(jobName, data, { jobId });
  } catch (error) {
    // A concurrent producer may have won the deterministic-ID race between
    // getJob() and add(). Only suppress the add error when that durable job can
    // actually be observed and reconciled.
    const racedJob = await queue.getJob(jobId).catch(() => null);
    if (!racedJob) throw error;
    return reconcileRetainedJob(
      queue,
      racedJob,
      jobName,
      jobId,
      data,
      options,
      "already-queued"
    );
  }

  if (!options.preferReplayData) return "queued";

  // Re-read after add: another producer may have inserted the same job ID and
  // BullMQ can return without replacing its payload. Reconciliation guarantees
  // a waiting browser job receives the authoritative webhook data.
  const retained = await queue.getJob(jobId);
  if (!retained) return "queued";
  return reconcileRetainedJob(
    queue,
    retained,
    jobName,
    jobId,
    data,
    options,
    "queued"
  );
}
