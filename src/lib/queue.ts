import { Queue } from "bullmq";
import IORedis from "ioredis";
import { QUEUE_CONFIG } from "./constants";

let connection: IORedis | null = null;

function getConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
  }
  return connection;
}

let _eventQueue: Queue | null = null;

export function getEventQueue(): Queue {
  if (!_eventQueue) {
    _eventQueue = new Queue(QUEUE_CONFIG.QUEUE_NAME, {
      connection: getConnection() as never,
      defaultJobOptions: {
        attempts: QUEUE_CONFIG.MAX_ATTEMPTS,
        backoff: {
          type: "exponential",
          delay: QUEUE_CONFIG.BACKOFF_DELAY_MS,
        },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }
  return _eventQueue;
}

export interface MetaEventJob {
  workspaceId: string;
  pixelId: string;
  accessToken: string;
  accessTokenIv: string;
  accessTokenTag: string;
  testEventCode?: string | null;
  event: {
    eventName: string;
    eventId: string;
    timestamp: number;
    url: string;
    referrer: string;
    fbp?: string | null;
    fbc?: string | null;
    userData: Record<string, unknown>;
    customData: Record<string, unknown>;
    clientIp: string;
    userAgent: string;
  };
  eventLogId: string;
}
