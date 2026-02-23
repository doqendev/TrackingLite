import IORedis from "ioredis";

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
      console.error(JSON.stringify({ level: "error", component: "redis", msg: err.message, timestamp: new Date().toISOString() }));
    });
  }
  return redis;
}
