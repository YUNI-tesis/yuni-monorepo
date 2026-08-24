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

async function parseError(response: Response) {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;

  return {
    message: body?.error?.message ?? "No pudimos completar la accion.",
    code: body?.error?.code,
    reason: body?.error?.reason,
    retryAfterSeconds: body?.error?.retryAfterSeconds,
  };
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(apiEndpoint(path), {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const error = await parseError(response);
    throw new ApiClientError(
      error.message,
      response.status,
      error.code,
      error.reason,
      error.retryAfterSeconds
    );
  }

  return response.json() as Promise<T>;
}

function readSendBeacon() {
  return typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function"
    ? navigator.sendBeacon.bind(navigator)
    : null;
}
