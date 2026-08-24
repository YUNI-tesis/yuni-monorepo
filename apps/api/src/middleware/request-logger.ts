import type { MiddlewareHandler } from "hono";
import { createLogger } from "@yuni/observability";
import { serverConfig } from "@yuni/config";

const logger = createLogger("@yuni/api:http");
const sensitiveKeys = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "password",
  "passwordhash",
  "token",
  "accesstoken",
  "refreshtoken",
  "apikey",
  "secret",
  "email",
  "participantemail",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
  "forwarded",
  "cf-connecting-ip",
]);

const requestIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

export function shouldIncludeErrorStack(
  environment: Pick<typeof serverConfig, "appEnv" | "nodeEnv"> = serverConfig
) {
  return environment.appEnv !== "production" && environment.nodeEnv !== "production";
}

export function toSafeLoggedError(
  error: unknown,
  environment: Pick<typeof serverConfig, "appEnv" | "nodeEnv"> = serverConfig
) {
  if (!(error instanceof Error)) {
    return typeof error === "string" ? redactSensitiveText(error) : sanitizeValue("error", error);
  }

  if (!shouldIncludeErrorStack(environment)) {
    return { name: error.name, message: "Internal request error" };
  }

  return {
    name: error.name,
    message: redactSensitiveText(error.message),
    ...(error.stack ? { stack: redactSensitiveText(error.stack) } : {}),
  };
}

function requestId() {
  return crypto.randomUUID();
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (isSensitiveKey(key)) {
    return "[redacted]";
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue("", item));
  }

  if (value && typeof value === "object") {
    return sanitizeObject(value);
  }

  return typeof value === "string" ? redactSensitiveText(value) : value;
}

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase();
  const canonical = normalized.replace(/[-_]/g, "");
  return (
    sensitiveKeys.has(normalized) ||
    normalized.startsWith("x-forwarded-") ||
    normalized.includes("authorization") ||
    normalized.includes("token") ||
    normalized.includes("password") ||
    normalized.includes("cookie") ||
    normalized.includes("secret") ||
    canonical.includes("apikey") ||
    normalized.endsWith("email")
  );
}

function redactSensitiveText(value: string) {
  return value
    .replace(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "[redacted-email]")
    .replace(/(bearer\s+)[^\s,;]+/gi, "$1[redacted]")
    .replace(/((?:api[-_ ]?key|token|password|cookie|secret)\s*[=:]\s*)[^\s,;]+/gi, "$1[redacted]");
}

function sanitizeObject(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, sanitizeValue(key, entry)])
  );
}

function headersToMetadata(headers: Headers) {
  const metadata: Record<string, string> = {};

  for (const [key, value] of headers.entries()) {
    metadata[key] = isSensitiveKey(key) ? "[redacted]" : redactSensitiveText(value);
  }

  return metadata;
}

export function requestLogger(): MiddlewareHandler {
  return async (context, next) => {
    const requestedId = context.req.header("x-request-id")?.trim();
    const id = requestedId && requestIdPattern.test(requestedId) ? requestedId : requestId();
    const startedAt = performance.now();
    const method = context.req.method;
    const path = context.req.path;

    context.header("x-request-id", id);
    logger.info(`--> ${method} ${path}`, {
      requestId: id,
      method,
      path,
      query: sanitizeObject(context.req.query()),
      headers: headersToMetadata(context.req.raw.headers),
    });

    try {
      await next();
    } catch (error) {
      const durationMs = Math.round(performance.now() - startedAt);

      logger.error("request failed", {
        requestId: id,
        method,
        path,
        durationMs,
        error: toSafeLoggedError(error),
      });

      throw error;
    }

    const durationMs = Math.round(performance.now() - startedAt);
    const status = context.res.status;
    const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";

    logger[level](`<-- ${method} ${path} ${status} ${durationMs}ms`, {
      requestId: id,
      method,
      path,
      status,
      durationMs,
      responseHeaders: headersToMetadata(context.res.headers),
    });
  };
}
