type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  level: LogLevel;
  msg: string;
  timestamp: string;
  [key: string]: unknown;
}

function log(level: LogLevel, msg: string, context?: Record<string, unknown>, data?: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    msg,
    timestamp: new Date().toISOString(),
    ...context,
    ...data,
  };

  if (level === "error") {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
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
