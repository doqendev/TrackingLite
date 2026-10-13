export const DETAILED_EVENT_RETENTION_DAYS = 7;
export const REPORTING_RETENTION_DAYS = 30;
// Covers the existing 30-day dedup window and the complete current billing month.
// These rows contain compact operational identity, not event payloads or cookies.
export const DELIVERY_IDENTITY_RETENTION_DAYS = 35;
export const DAY_MS = 86_400_000;

export function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function detailedEventCutoff(now = new Date()): Date {
  return new Date(now.getTime() - DETAILED_EVENT_RETENTION_DAYS * DAY_MS);
}

