"use client";

import { clientEnv } from "@yuni/config";

export type ApiUser = {
  id: string;
  email: string;
  name: string | null;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApiAvatarStatus = "draft" | "active" | "disabled";

export type ApiAvatar = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  context: string;
  voiceConfig: unknown;
  liveAvatarConfig: unknown;
  status: ApiAvatarStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreateAvatarRequest = {
  name: string;
  description: string;
  instructions: string;
  context: string;
  voiceConfig: {
    provider: "openai";
    voiceId: string;
    speakingRate: number;
  };
  liveAvatarConfig: {
    provider: "liveavatar";
    avatarId: string;
    mode: "lite";
    sandbox: true;
  };
  status: "draft" | "active";
};

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

export function register(input: { email: string; password: string; name?: string }) {
  return apiRequest<{ user: ApiUser }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function login(input: { email: string; password: string }) {
  return apiRequest<{ user: ApiUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function logout() {
  return apiRequest<{ ok: true }>("/auth/logout", {
    method: "POST",
  });
}

export function getMe() {
  return apiRequest<{ user: ApiUser }>("/me");
}

export function createAvatar(input: CreateAvatarRequest) {
  return apiRequest<{ avatar: ApiAvatar }>("/avatars", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getAvatar(avatarId: string) {
  return apiRequest<{ avatar: ApiAvatar }>(`/avatars/${avatarId}`);
}
