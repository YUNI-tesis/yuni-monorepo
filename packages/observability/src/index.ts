export type LogLevel = "info" | "warn" | "error";

export interface Logger {
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
}

function writeLog(scope: string, level: LogLevel, message: string, metadata?: Record<string, unknown>) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    scope,
    message,
    ...(metadata ? { metadata } : {}),
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export function createLogger(scope: string): Logger {
  return {
    info: (message, metadata) => writeLog(scope, "info", message, metadata),
    warn: (message, metadata) => writeLog(scope, "warn", message, metadata),
    error: (message, metadata) => writeLog(scope, "error", message, metadata),
  };
}
