"use client";

import { clientEnv } from "@yuni/config";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly reason?: string
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

type ApiErrorBody = {
  error?: {
    message?: string;
    code?: string;
    reason?: string;
  };
};

async function parseError(response: Response) {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;

  return {
    message: body?.error?.message ?? "No pudimos completar la accion.",
    code: body?.error?.code,
    reason: body?.error?.reason,
  };
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${clientEnv.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const error = await parseError(response);
    throw new ApiClientError(error.message, response.status, error.code, error.reason);
  }

  return response.json() as Promise<T>;
}
