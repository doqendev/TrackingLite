import { Prisma } from "@prisma/client";

// Prisma timestamps are UTC timestamp-without-time-zone columns. Explicit ISO
// text avoids session timezone conversion of raw Date query parameters.
export function utcTimestamp(date: Date): Prisma.Sql {
  return Prisma.sql`${date.toISOString()}::timestamp`;
}
