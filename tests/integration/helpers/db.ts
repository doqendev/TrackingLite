import { db } from "@/lib/db";
import IORedis from "ioredis";

let redis: IORedis | null = null;

export function getTestRedis(): IORedis {
  if (!redis) {
    redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379");
  }
  return redis;
}

export async function cleanDatabase() {
  await db.eventLog.deleteMany();
  await db.workspace.deleteMany();
  await db.subscription.deleteMany();
  await db.session.deleteMany();
  await db.account.deleteMany();
  await db.verificationToken.deleteMany();
  await db.user.deleteMany();
}

export async function cleanRedis() {
  const client = getTestRedis();
  await client.flushdb();
}

export async function disconnectAll() {
  await db.$disconnect();
  if (redis) {
    redis.disconnect();
    redis = null;
  }
}
