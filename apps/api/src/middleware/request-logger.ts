import type { MiddlewareHandler } from "hono";
import { createLogger } from "@yuni/observability";

const logger = createLogger("@yuni/api:http");
const sensitiveKeys = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "password",
  "passwordHash",
  "token",
  "accessToken",
  "refreshToken",
  "apiKey",
  "secret",
]);

function requestId() {
  return crypto.randomUUID();
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (sensitiveKeys.has(key)) {
    return "[redacted]";
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeObject(item));
  }

  if (value && typeof value === "object") {
    return sanitizeObject(value);
  }

  return value;
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
    metadata[key] = sensitiveKeys.has(key) ? "[redacted]" : value;
  }

  return metadata;
}

export function requestLogger(): MiddlewareHandler {
  return async (context, next) => {
    const id = context.req.header("x-request-id") ?? requestId();
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
        error:
          error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
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
