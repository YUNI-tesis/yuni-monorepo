import { AppRouteError } from "@/lib/api-errors";
import type { AgentAvatar } from "@/lib/schemas";

const LIVEAVATAR_API_URL = "https://api.liveavatar.com";
const AVATAR_CACHE_TTL_MS = 5 * 60 * 1000;

type AvatarCacheEntry = {
  expiresAt: number;
  data: HeyGenAvatarOption[];
};

let avatarCache: AvatarCacheEntry | null = null;

export interface HeyGenAvatarOption {
  avatarId: string;
  name: string;
  previewImageUrl?: string;
  gender?: string;
}

interface LiveAvatarApiResponse<T> {
  code: number;
  data: T;
  message?: string;
}

function extractAvatarItems(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
  }

  if (payload && typeof payload === "object") {
    const source = payload as Record<string, unknown>;
    const nestedCandidates = [
      source.avatars,
      source.items,
      source.data,
      source.results,
      source.public_avatars,
    ];

    for (const candidate of nestedCandidates) {
      if (Array.isArray(candidate)) {
        return candidate.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
      }
    }
  }

  return [];
}

export function getLiveAvatarApiKey(): string | null {
  return process.env.LIVEAVATAR_API_KEY || process.env.HEYGEN_API_KEY || null;
}

export function hasLiveAvatarCredentials(): boolean {
  return Boolean(getLiveAvatarApiKey());
}

async function liveAvatarRequest<T>(
  path: string,
  init: RequestInit = {},
  apiKey = getLiveAvatarApiKey()
): Promise<T> {
  if (!apiKey) {
    throw new AppRouteError("LIVEAVATAR_API_KEY or HEYGEN_API_KEY is not configured", 503);
  }

  const response = await fetch(`${LIVEAVATAR_API_URL}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "X-API-KEY": apiKey,
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as LiveAvatarApiResponse<T> | null;

  if (!response.ok || !payload || payload.code !== 1000) {
    const message =
      payload?.message ||
      `LiveAvatar request failed with status ${response.status}`;
    throw new AppRouteError(message, response.status || 502);
  }

  return payload.data;
}

function pickPreviewImageUrl(source: Record<string, unknown>): string | undefined {
  const candidates = [
    source.preview_image_url,
    source.previewImageUrl,
    source.preview_url,
    source.image_url,
    source.thumbnail_url,
  ];

  return candidates.find((value): value is string => typeof value === "string" && value.length > 0);
}

function normalizeAvatar(item: Record<string, unknown>): HeyGenAvatarOption | null {
  const avatarId =
    (typeof item.avatar_id === "string" && item.avatar_id) ||
    (typeof item.id === "string" && item.id) ||
    (typeof item.avatarId === "string" && item.avatarId) ||
    "";

  if (!avatarId) {
    return null;
  }

  const name =
    (typeof item.name === "string" && item.name) ||
    (typeof item.avatar_name === "string" && item.avatar_name) ||
    avatarId;

  return {
    avatarId,
    name,
    previewImageUrl: pickPreviewImageUrl(item),
    gender: typeof item.gender === "string" ? item.gender : undefined,
  };
}

export async function listHeyGenAvatars(forceRefresh = false): Promise<HeyGenAvatarOption[]> {
  if (!forceRefresh && avatarCache && avatarCache.expiresAt > Date.now()) {
    return avatarCache.data;
  }

  const publicAvatars = await liveAvatarRequest<unknown>("/v1/avatars/public", {
    method: "GET",
  });

  const normalized = extractAvatarItems(publicAvatars)
    .map((item) => normalizeAvatar((item || {}) as Record<string, unknown>))
    .filter((item): item is HeyGenAvatarOption => Boolean(item));

  avatarCache = {
    data: normalized,
    expiresAt: Date.now() + AVATAR_CACHE_TTL_MS,
  };

  return normalized;
}

export function getDefaultAvatarConfig(): AgentAvatar {
  return {
    provider: "builtin",
  };
}

export async function createHeyGenSessionToken(options: {
  avatarId: string;
  language?: string;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const metadata = options.metadata || {};
  const voiceId =
    typeof metadata.voiceId === "string" && metadata.voiceId.length > 0
      ? metadata.voiceId
      : undefined;
  const contextId =
    typeof metadata.contextId === "string" && metadata.contextId.length > 0
      ? metadata.contextId
      : undefined;

  const tokenData = await liveAvatarRequest<{
    session_token?: string;
    token?: string;
  }>("/v1/sessions/token", {
    method: "POST",
    body: JSON.stringify({
      mode: "FULL",
      avatar_id: options.avatarId,
      avatar_persona: {
        language: options.language || (typeof metadata.language === "string" ? metadata.language : "es"),
        ...(voiceId ? { voice_id: voiceId } : {}),
        ...(contextId ? { context_id: contextId } : {}),
      },
      video_settings: {
        quality: "high",
        encoding: "VP8",
      },
    }),
  });

  const sessionToken = tokenData.session_token || tokenData.token;

  if (!sessionToken) {
    throw new AppRouteError("LiveAvatar did not return a session token", 502);
  }

  return sessionToken;
}
