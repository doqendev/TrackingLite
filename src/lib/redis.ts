import IORedis from "ioredis";

let redis: IORedis | null = null;

export function getSharedRedis(): IORedis {
  if (!redis) {
    redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      lazyConnect: true,
    });
  }
  return redis;
}
