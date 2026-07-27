import { db } from "@/lib/db";
import IORedis from "ioredis";
import { closeSharedRedis } from "@/lib/redis";
import {
  getSafeIntegrationDatabaseUrl,
  getSafeIntegrationRedisUrl,
} from "./safety";

let redis: IORedis | null = null;

export function getTestRedis(): IORedis {
  if (!redis) {
    redis = new IORedis(getSafeIntegrationRedisUrl());
  }
  return redis;
}

export async function cleanDatabase() {
  getSafeIntegrationDatabaseUrl();
  const tables = await db.$queryRawUnsafe<Array<{ tablename: string }>>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'"
  );
  if (tables.length === 0) return;

  const tableNames = tables
    .map(({ tablename }) => `"${tablename.replace(/"/g, '""')}"`)
    .join(", ");
  await db.$executeRawUnsafe(
    `TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE`
  );
}

export async function cleanRedis() {
  const client = getTestRedis();
  await client.flushdb();
}

export async function disconnectAll() {
  await db.$disconnect();
  closeSharedRedis();
  if (redis) {
    redis.disconnect();
    redis = null;
  }
}
