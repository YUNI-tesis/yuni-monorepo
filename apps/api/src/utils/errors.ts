export type ApiErrorCode =
  | "BAD_REQUEST"
  | "BAD_GATEWAY"
  | "CONFLICT"
  | "FORBIDDEN"
  | "INTERNAL_SERVER_ERROR"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "UNAUTHORIZED";

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    issues?: unknown;
    reason?: string;
    retryAfterSeconds?: number;
  };
};

export function apiError(
  code: ApiErrorCode,
  message: string,
  issues?: unknown,
  reason?: string
): ApiErrorBody {
  return {
    error: {
      code,
      message,
      ...(issues !== undefined ? { issues } : {}),
      ...(reason ? { reason } : {}),
    },
  };
}

export function unauthorizedError(message = "Unauthorized") {
  return apiError("UNAUTHORIZED", message);
}

export function validationError(issues: unknown, message = "Invalid request body", reason?: string) {
  return apiError("BAD_REQUEST", message, issues, reason);
}

export function conflictError(message: string) {
  return apiError("CONFLICT", message);
}

export function forbiddenError(message = "Forbidden") {
  return apiError("FORBIDDEN", message);
}

export function conflictErrorWithReason(message: string, reason: string) {
  return apiError("CONFLICT", message, undefined, reason);
}

export function notFoundError(message = "Resource not found") {
  return apiError("NOT_FOUND", message);
}

export function internalServerError(message = "Internal server error") {
  return apiError("INTERNAL_SERVER_ERROR", message);
}

export function badGatewayError(message = "Bad gateway") {
  return apiError("BAD_GATEWAY", message);
}

export function serviceUnavailableError(message = "Service unavailable", reason?: string) {
  return apiError("SERVICE_UNAVAILABLE", message, undefined, reason);
}

export function rateLimitedError(
  message = "Too many requests",
  reason = "PLATFORM_RATE_LIMIT",
  retryAfterSeconds?: number
) {
  const body = apiError("RATE_LIMITED", message, undefined, reason);
  if (retryAfterSeconds !== undefined) body.error.retryAfterSeconds = retryAfterSeconds;
  return body;
}
