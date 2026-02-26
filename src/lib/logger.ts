type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  level: LogLevel;
  msg: string;
  timestamp: string;
  [key: string]: unknown;
}

const MAX_STACK_LINES = 25;

function serializeError(error: Error, seen: WeakSet<object>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: error.name,
    message: error.message,
  };

  if (error.stack) {
    out.stack = error.stack.split("\n").slice(0, MAX_STACK_LINES).join("\n");
  }

  // Preserve useful custom fields (e.g. code, statusCode, metadata)
  for (const key of Object.getOwnPropertyNames(error)) {
    if (key === "name" || key === "message" || key === "stack" || key === "cause") {
      continue;
    }
    out[key] = normalizeValue((error as Record<string, unknown>)[key], seen);
  }

  const withCause = error as Error & { cause?: unknown };
  if (withCause.cause !== undefined) {
    out.cause = normalizeValue(withCause.cause, seen);
  }

  return out;
}

function normalizeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Error) {
    return serializeError(value, seen);
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item, seen));
  }

  if (value && typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);

    const out: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      out[key] = normalizeValue(nestedValue, seen);
    }

    seen.delete(value);
    return out;
  }

  return value;
}

function formatEntry(entry: LogEntry): string {
  try {
    return JSON.stringify(entry);
  } catch {
    return JSON.stringify({
      level: "error",
      msg: "Failed to serialize log entry",
      timestamp: new Date().toISOString(),
    });
  }
}

function log(level: LogLevel, msg: string, context?: Record<string, unknown>, data?: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    msg,
    timestamp: new Date().toISOString(),
    pid: process.pid,
    ...context,
    ...data,
  };
  const normalized = normalizeValue(entry, new WeakSet<object>()) as LogEntry;

  if (level === "error") {
    console.error(formatEntry(normalized));
  } else {
    console.log(formatEntry(normalized));
  }
}

export function createLogger(context?: Record<string, unknown>) {
  return {
    info(msg: string, data?: Record<string, unknown>) {
      log("info", msg, context, data);
    },
    warn(msg: string, data?: Record<string, unknown>) {
      log("warn", msg, context, data);
    },
    error(msg: string, data?: Record<string, unknown>) {
      log("error", msg, context, data);
    },
    debug(msg: string, data?: Record<string, unknown>) {
      if (process.env.LOG_LEVEL === "debug") {
        log("debug", msg, context, data);
      }
    },
    child(extra: Record<string, unknown>) {
      return createLogger({ ...context, ...extra });
    },
  };
}

export const logger = createLogger();
