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
    message: redactSensitiveText(message),
    ...(metadata ? { metadata: sanitizeRecord(metadata) } : {}),
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

function sanitizeRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, isSensitiveKey(key) ? "[redacted]" : sanitize(entry)])
  );
}

function sanitize(value: unknown): unknown {
  if (typeof value === "string") return redactSensitiveText(value);
  if (Array.isArray(value)) return value.map(sanitize);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: redactSensitiveText(value.message) };
  }
  if (value && typeof value === "object") return sanitizeRecord(value as Record<string, unknown>);
  return value;
}

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase();
  const canonical = normalized.replace(/[-_ ]/g, "");
  return (
    normalized.startsWith("x-forwarded-") ||
    normalized === "forwarded" ||
    normalized === "x-real-ip" ||
    normalized === "cf-connecting-ip" ||
    canonical.includes("authorization") ||
    canonical.includes("token") ||
    canonical.includes("password") ||
    canonical.includes("cookie") ||
    canonical.includes("secret") ||
    canonical.includes("apikey") ||
    canonical.endsWith("email")
  );
}

function redactSensitiveText(value: string) {
  return value
    .replace(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "[redacted-email]")
    .replace(/(bearer\s+)[^\s,;]+/gi, "$1[redacted]")
    .replace(/((?:api[-_ ]?key|token|password|cookie|secret)\s*[=:]\s*)[^\s,;]+/gi, "$1[redacted]");
}

export function createLogger(scope: string): Logger {
  return {
    info: (message, metadata) => writeLog(scope, "info", message, metadata),
    warn: (message, metadata) => writeLog(scope, "warn", message, metadata),
    error: (message, metadata) => writeLog(scope, "error", message, metadata),
  };
}
