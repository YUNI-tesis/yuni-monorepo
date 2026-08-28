"use client";

import { apiRequest } from "./http-client";

export type ApiUser = {
  id: string;
  email: string;
  name: string | null;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export function register(input: { email: string; password: string; name?: string }) {
  return apiRequest<{ user: ApiUser }>("/auth/register", {
    auth: "none",
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function login(input: { email: string; password: string }) {
  return apiRequest<{ user: ApiUser }>("/auth/login", {
    auth: "none",
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function logout() {
  return apiRequest<{ ok: true }>("/auth/logout", {
    auth: "none",
    method: "POST",
  });
}

export function getMe() {
  return apiRequest<{ user: ApiUser }>("/me");
}
