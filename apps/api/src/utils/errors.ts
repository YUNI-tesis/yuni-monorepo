export type ApiErrorCode =
  | "BAD_REQUEST"
  | "BAD_GATEWAY"
  | "CONFLICT"
  | "INTERNAL_SERVER_ERROR"
  | "NOT_FOUND"
  | "SERVICE_UNAVAILABLE"
  | "UNAUTHORIZED";

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    issues?: unknown;
  };
};

export function apiError(code: ApiErrorCode, message: string, issues?: unknown): ApiErrorBody {
  return {
    error: {
      code,
      message,
      ...(issues !== undefined ? { issues } : {}),
    },
  };
}

export function unauthorizedError(message = "Unauthorized") {
  return apiError("UNAUTHORIZED", message);
}

export function validationError(issues: unknown, message = "Invalid request body") {
  return apiError("BAD_REQUEST", message, issues);
}

export function conflictError(message: string) {
  return apiError("CONFLICT", message);
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

export function serviceUnavailableError(message = "Service unavailable") {
  return apiError("SERVICE_UNAVAILABLE", message);
}
