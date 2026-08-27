"use client";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly reason?: string,
    readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export function toUserFacingApiError(error: unknown, fallback: string) {
  return error instanceof ApiClientError ? error.message : fallback;
}

export function apiEndpoint(path: string) {
  return `/api${path}`;
}

export function queueApiJsonBeacon(
  path: string,
  payload: unknown,
  sendBeacon: ((url: string, data?: BodyInit | null) => boolean) | null = readSendBeacon()
) {
  if (!sendBeacon) return false;

  try {
    // Strings use the CORS-safelisted text/plain content type, avoiding a
    // preflight during page teardown. Hono still parses the JSON payload.
    return sendBeacon(apiEndpoint(path), JSON.stringify(payload));
  } catch {
    return false;
  }
}

type ApiErrorBody = {
  error?: {
    message?: string;
    code?: string;
    reason?: string;
    retryAfterSeconds?: number;
  };
};

export type ApiRequestAuth = "session" | "none" | "public-token";

export type ApiRequestInit = RequestInit & {
  auth?: ApiRequestAuth;
};

const invalidSessionReasons = new Set(["SESSION_REQUIRED", "SESSION_INVALID"]);
const sessionExpiredPath = "/auth/login?reason=session-expired";
let sessionExpirationStarted = false;

async function parseError(response: Response) {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;

  return {
    message: body?.error?.message ?? "No pudimos completar la accion.",
    code: body?.error?.code,
    reason: body?.error?.reason,
    retryAfterSeconds: body?.error?.retryAfterSeconds,
  };
}

export function isSessionExpirationError(error: unknown): error is ApiClientError {
  return (
    error instanceof ApiClientError &&
    error.status === 401 &&
    Boolean(error.reason && invalidSessionReasons.has(error.reason))
  );
}

export function replaceBrowserLocation(path: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.location.replace(path);
}

function expireBrowserSession() {
  if (typeof window === "undefined" || sessionExpirationStarted) {
    return;
  }

  sessionExpirationStarted = true;
  replaceBrowserLocation(sessionExpiredPath);
}

export async function apiRequest<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { auth = "session", ...requestInit } = init;
  const response = await fetch(apiEndpoint(path), {
    ...requestInit,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...requestInit.headers,
    },
  });

  if (!response.ok) {
    const error = await parseError(response);
    const clientError = new ApiClientError(
      error.message,
      response.status,
      error.code,
      error.reason,
      error.retryAfterSeconds
    );

    if (auth === "session" && isSessionExpirationError(clientError)) {
      expireBrowserSession();
    }

    throw clientError;
  }

  return response.json() as Promise<T>;
}

function readSendBeacon() {
  return typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function"
    ? navigator.sendBeacon.bind(navigator)
    : null;
}
