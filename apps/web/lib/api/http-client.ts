"use client";

import { clientEnv } from "@yuni/config";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

type ApiErrorBody = {
  error?: {
    message?: string;
  };
};

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;

  return body?.error?.message ?? "No pudimos completar la accion.";
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
    throw new ApiClientError(await parseError(response), response.status);
  }

  return response.json() as Promise<T>;
}
