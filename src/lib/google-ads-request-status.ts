import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { retrieveGoogleAdsRequestStatus, GoogleAdsApiError } from "@/lib/destinations/google-ads";

/**
 * Google's Data Manager API accepts uploads immediately and processes them
 * later. Its guidance: first check after 30 minutes, back off by 1.3x up to an
 * hour between checks, and stop after 24 hours. A SENT Google Ads row therefore
 * also carries destinationRequestStatus:
 *   PROCESSING -> SUCCESS | PARTIAL_SUCCESS | FAILED | TIMED_OUT
 * Only Google's enum reasons and record counts are stored, never record data.
 */
export const GOOGLE_STATUS_FIRST_CHECK_MS = 30 * 60 * 1000;
export const GOOGLE_STATUS_MAX_INTERVAL_MS = 60 * 60 * 1000;
export const GOOGLE_STATUS_GIVE_UP_MS = 24 * 60 * 60 * 1000;
const BACKOFF = 1.3;
const BATCH_SIZE = 50;
const PARALLEL_CHECKS = 5;
// The status pass shares the 5-minute recovery cycle; never let it run long.
const PASS_BUDGET_MS = 90 * 1000;

const log = createLogger({ component: "google-ads-status" });

export type GoogleAdsDestinationRequestStatus =
  | "PROCESSING" | "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED" | "TIMED_OUT";

export function nextGoogleStatusCheckAt(
  previousCheckAt: Date | null, scheduledAt: Date | null, now: Date
): Date {
  const previousDelay = previousCheckAt && scheduledAt
    ? Math.max(scheduledAt.getTime() - previousCheckAt.getTime(), GOOGLE_STATUS_FIRST_CHECK_MS)
    : GOOGLE_STATUS_FIRST_CHECK_MS;
  const delay = Math.min(Math.round(previousDelay * BACKOFF), GOOGLE_STATUS_MAX_INTERVAL_MS);
  return new Date(now.getTime() + delay);
}

type DueRow = {
  id: string;
  destinationRequestId: string | null;
  destinationStatusCheckedAt: Date | null;
  destinationStatusNextCheckAt: Date | null;
  lastAttemptAt: Date | null;
  createdAt: Date;
};

async function checkRow(row: DueRow, now: Date): Promise<GoogleAdsDestinationRequestStatus> {
  const acceptedAt = row.lastAttemptAt ?? row.createdAt;
  const expired = now.getTime() - acceptedAt.getTime() >= GOOGLE_STATUS_GIVE_UP_MS;
  let status: GoogleAdsDestinationRequestStatus = "PROCESSING";
  let detail: Prisma.InputJsonValue;
  try {
    if (!row.destinationRequestId) throw new GoogleAdsApiError("Google Ads request ID missing", 400);
    const result = await retrieveGoogleAdsRequestStatus(row.destinationRequestId);
    if (result.status === "SUCCESS" || result.status === "PARTIAL_SUCCESS" || result.status === "FAILED") {
      status = result.status;
    }
    detail = {
      googleStatus: result.status,
      recordCount: result.recordCount,
      errors: result.errors,
      warnings: result.warnings,
    };
  } catch (error) {
    detail = {
      lastError: error instanceof GoogleAdsApiError ? error.message : "Google Ads status check unavailable",
    };
  }
  if (status === "PROCESSING" && expired) status = "TIMED_OUT";
  await db.eventLog.updateMany({
    where: { id: row.id, destination: "GOOGLE_ADS", destinationRequestStatus: "PROCESSING" },
    data: {
      destinationRequestStatus: status,
      destinationStatusCheckedAt: now,
      destinationStatusNextCheckAt: status === "PROCESSING"
        ? nextGoogleStatusCheckAt(row.destinationStatusCheckedAt ?? acceptedAt, row.destinationStatusNextCheckAt, now)
        : null,
      destinationStatusDetail: detail,
    },
  });
  return status;
}

export async function pollGoogleAdsRequestStatuses(
  now: () => Date = () => new Date()
): Promise<Record<GoogleAdsDestinationRequestStatus, number>> {
  const counts: Record<GoogleAdsDestinationRequestStatus, number> = {
    PROCESSING: 0, SUCCESS: 0, PARTIAL_SUCCESS: 0, FAILED: 0, TIMED_OUT: 0,
  };
  const startedAt = now();
  const due: DueRow[] = await db.eventLog.findMany({
    where: {
      destination: "GOOGLE_ADS",
      destinationRequestStatus: "PROCESSING",
      destinationStatusNextCheckAt: { lte: startedAt },
    },
    select: {
      id: true, destinationRequestId: true, destinationStatusCheckedAt: true,
      destinationStatusNextCheckAt: true, lastAttemptAt: true, createdAt: true,
    },
    orderBy: { destinationStatusNextCheckAt: "asc" },
    take: BATCH_SIZE,
  });
  for (let index = 0; index < due.length; index += PARALLEL_CHECKS) {
    if (now().getTime() - startedAt.getTime() > PASS_BUDGET_MS) break;
    const results = await Promise.allSettled(
      due.slice(index, index + PARALLEL_CHECKS).map((row) => checkRow(row, now()))
    );
    for (const result of results) {
      if (result.status === "fulfilled") counts[result.value]++;
    }
  }
  if (due.length > 0) log.info("Google Ads request statuses checked", { checked: due.length, ...counts });
  return counts;
}
