type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

function log(level: LogLevel, message: string, data?: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    message,
    data,
    timestamp: new Date().toISOString(),
  };

  if (level === "error") {
    console.error(`[${entry.timestamp}] ERROR: ${message}`, data || "");
  } else if (level === "warn") {
    console.warn(`[${entry.timestamp}] WARN: ${message}`, data || "");
  } else {
    console.log(`[${entry.timestamp}] ${level.toUpperCase()}: ${message}`, data || "");
  }
}

export const logger = {
  info: (msg: string, data?: Record<string, unknown>) => log("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => log("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) => log("error", msg, data),
  debug: (msg: string, data?: Record<string, unknown>) => log("debug", msg, data),
};
