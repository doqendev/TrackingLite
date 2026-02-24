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

const defaultJobOptions = {
  attempts: QUEUE_CONFIG.MAX_ATTEMPTS,
  backoff: {
    type: "exponential" as const,
    delay: QUEUE_CONFIG.BACKOFF_DELAY_MS,
  },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

// Meta queue (existing)
let _eventQueue: Queue | null = null;

export function getEventQueue(): Queue {
  if (!_eventQueue) {
    _eventQueue = new Queue(QUEUE_CONFIG.QUEUE_NAME, {
      connection: getConnection() as never,
      defaultJobOptions,
    });
  }
  return _eventQueue;
}

// TikTok queue
let _tiktokQueue: Queue | null = null;

export function getTiktokQueue(): Queue {
  if (!_tiktokQueue) {
    _tiktokQueue = new Queue(QUEUE_CONFIG.TIKTOK_QUEUE_NAME, {
      connection: getConnection() as never,
      defaultJobOptions,
    });
  }
  return _tiktokQueue;
}

// GA4 queue
let _ga4Queue: Queue | null = null;

export function getGA4Queue(): Queue {
  if (!_ga4Queue) {
    _ga4Queue = new Queue(QUEUE_CONFIG.GA4_QUEUE_NAME, {
      connection: getConnection() as never,
      defaultJobOptions,
    });
  }
  return _ga4Queue;
}

// Klaviyo queue
let _klaviyoQueue: Queue | null = null;

export function getKlaviyoQueue(): Queue {
  if (!_klaviyoQueue) {
    _klaviyoQueue = new Queue(QUEUE_CONFIG.KLAVIYO_QUEUE_NAME, {
      connection: getConnection() as never,
      defaultJobOptions,
    });
  }
  return _klaviyoQueue;
}

// Reddit queue
let _redditQueue: Queue | null = null;

export function getRedditQueue(): Queue {
  if (!_redditQueue) {
    _redditQueue = new Queue(QUEUE_CONFIG.REDDIT_QUEUE_NAME, {
      connection: getConnection() as never,
      defaultJobOptions,
    });
  }
  return _redditQueue;
}

// Pinterest queue
let _pinterestQueue: Queue | null = null;

export function getPinterestQueue(): Queue {
  if (!_pinterestQueue) {
    _pinterestQueue = new Queue(QUEUE_CONFIG.PINTEREST_QUEUE_NAME, {
      connection: getConnection() as never,
      defaultJobOptions,
    });
  }
  return _pinterestQueue;
}

export interface MetaEventJob {
  workspaceId: string;
  requestId?: string;
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
  eventLogId: string | null;  // null for fire-and-forget events (PageView, ViewContent)
}

export interface DestinationEventJob {
  workspaceId: string;
  destination: string;
  requestId?: string;
  eventLogId: string | null;  // null for fire-and-forget events (PageView, ViewContent)
  event: {
    eventName: string;
    eventId: string;
    timestamp: number;
    url: string;
    referrer: string;
    fbp?: string | null;
    fbc?: string | null;
    ttclid?: string | null;
    gclid?: string | null;
    rdtCid?: string | null;
    epik?: string | null;
    gaClientId?: string | null;
    userData: Record<string, unknown>;
    customData: Record<string, unknown>;
    clientIp: string;
    userAgent: string;
  };
}
