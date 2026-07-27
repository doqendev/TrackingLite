import IORedis from "ioredis";
import { createLogger } from "./logger";

const redisLog = createLogger({ component: "redis" });

let redis: IORedis | null = null;

export function getSharedRedis(): IORedis {
  if (!redis) {
    redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        return Math.min(times * 200, 3000);
      },
    });
    redis.on("error", (err) => {
      redisLog.error("Redis connection error", { error: err });
    });
  }
  return redis;
}

export function closeSharedRedis(): void {
  redis?.disconnect();
  redis = null;
}
