import type { AgentAvatar } from "@/lib/schemas";
import type { AvatarOption, AvatarSession, RealtimeAvatarProvider } from "./types";

const DEFAULT_BASE_URL = "https://api.liveavatar.com";
const DEFAULT_SANDBOX_AVATAR_IDS = ["dd73ea75-1218-4ef3-92ce-606d5f7fbc0a"];

function getSandboxFallbackAvatars(): AvatarOption[] {
  return getSandboxAvatarIds().map((externalAvatarId, index) => ({
    id: `liveavatar:${externalAvatarId}`,
    provider: "liveavatar",
    externalAvatarId,
    displayName: index === 0 ? "Wayne Sandbox" : `Sandbox avatar ${index + 1}`,
    quality: "high",
    isAvailable: true,
  }));
}

function getApiKey(): string {
  const apiKey = process.env.LIVEAVATAR_API_KEY;
  if (!apiKey) {
    throw new Error("LIVEAVATAR_API_KEY is not configured");
  }
  return apiKey;
}

function getBaseUrl(): string {
  return (process.env.LIVEAVATAR_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function isSandboxMode(): boolean {
  return process.env.LIVEAVATAR_SANDBOX !== "false";
}

function getSandboxAvatarIds(): string[] {
  return (process.env.LIVEAVATAR_SANDBOX_AVATAR_IDS || DEFAULT_SANDBOX_AVATAR_IDS.join(","))
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

async function liveAvatarFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": getApiKey(),
      ...init.headers,
    },
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");

  if (!response.ok) {
    const payloadRecord = asRecord(payload);
    const data = Array.isArray(payloadRecord?.data) ? payloadRecord.data[0] : payloadRecord?.data;
    const dataRecord = asRecord(data);
    const message =
      getString(dataRecord, "message") ||
      getString(payloadRecord, "message") ||
      getString(payloadRecord, "error") ||
      (typeof payload === "string" ? payload : null) ||
      `LiveAvatar request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

type LiveAvatarRaw = Record<string, unknown>;

function asRecord(value: unknown): LiveAvatarRaw | null {
  return typeof value === "object" && value !== null ? (value as LiveAvatarRaw) : null;
}

function getString(record: LiveAvatarRaw | null, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

function unwrapList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  if (Array.isArray(root?.data)) return root.data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.avatars)) return data.avatars;
  if (Array.isArray(root?.avatars)) return root.avatars;
  return [];
}

function normalizeAvatar(raw: unknown, source: "public" | "user"): AvatarOption | null {
  const record = asRecord(raw);
  const externalAvatarId =
    getString(record, "avatar_id") || getString(record, "id") || getString(record, "avatarId");
  if (!externalAvatarId) return null;

  const displayName =
    getString(record, "name") ||
    getString(record, "display_name") ||
    getString(record, "avatar_name") ||
    `${source === "public" ? "Public" : "Custom"} avatar`;

  return {
    id: `liveavatar:${externalAvatarId}`,
    provider: "liveavatar",
    externalAvatarId,
    displayName,
    thumbnailUrl:
      getString(record, "thumbnail_url") ||
      getString(record, "preview_url") ||
      getString(record, "image_url") ||
      getString(record, "previewImageUrl"),
    quality: "high",
    isAvailable: true,
  };
}

async function listEndpoint(path: string, source: "public" | "user"): Promise<AvatarOption[]> {
  try {
    const payload = await liveAvatarFetch(path);
    return unwrapList(payload)
      .map((avatar) => normalizeAvatar(avatar, source))
      .filter((avatar): avatar is AvatarOption => Boolean(avatar));
  } catch (error) {
    console.warn(`[LiveAvatar] Failed to list ${source} avatars:`, error);
    return [];
  }
}

export const liveAvatarProvider: RealtimeAvatarProvider = {
  id: "liveavatar",
  label: "LiveAvatar",
  isRemote: true,
  isConfigured: () => Boolean(process.env.LIVEAVATAR_API_KEY),
  async listAvatars() {
    const [publicAvatars, userAvatars] = await Promise.all([
      listEndpoint("/v1/avatars/public?page_size=100", "public"),
      listEndpoint("/v1/avatars", "user"),
    ]);

    const unique = new Map<string, AvatarOption>();
    for (const avatar of [...userAvatars, ...publicAvatars]) {
      unique.set(avatar.externalAvatarId || avatar.id, avatar);
    }

    const avatars = Array.from(unique.values());
    if (!isSandboxMode()) return avatars;

    const sandboxAvatarIds = new Set(getSandboxAvatarIds());
    const sandboxAvatars = avatars.filter(
      (avatar) => avatar.externalAvatarId && sandboxAvatarIds.has(avatar.externalAvatarId)
    );

    for (const avatar of getSandboxFallbackAvatars()) {
      if (!sandboxAvatars.some((candidate) => candidate.externalAvatarId === avatar.externalAvatarId)) {
        sandboxAvatars.push(avatar);
      }
    }

    return sandboxAvatars;
  },
  async createSession(avatar: AgentAvatar): Promise<AvatarSession> {
    const sandboxMode = isSandboxMode();
    const sandboxAvatarIds = getSandboxAvatarIds();
    const externalAvatarId =
      sandboxMode && (!avatar.externalAvatarId || !sandboxAvatarIds.includes(avatar.externalAvatarId))
        ? sandboxAvatarIds[0]
        : avatar.externalAvatarId;

    if (!externalAvatarId) {
      throw new Error("The selected remote avatar is missing an external avatar id");
    }

    const payload = await liveAvatarFetch("/v1/sessions/token", {
      method: "POST",
      body: JSON.stringify({
        mode: "LITE",
        avatar_id: externalAvatarId,
        is_sandbox: sandboxMode,
      }),
    });

    const payloadRecord = asRecord(payload);
    const data = asRecord(payloadRecord?.data) || payloadRecord;
    const sessionToken = getString(data, "session_token") || getString(data, "sessionToken");
    const sessionId = getString(data, "session_id") || getString(data, "sessionId");

    if (!sessionToken) {
      throw new Error("LiveAvatar did not return a session token");
    }

    return {
      id: sessionId || `liveavatar:${Date.now()}`,
      provider: "liveavatar",
      mode: "remote",
      sessionToken,
      apiUrl: getBaseUrl(),
      avatarId: externalAvatarId,
      sandboxMode,
      externalSessionId: sessionId,
      sdk: "liveavatar-web-sdk",
      metadata: {
        avatarId: externalAvatarId,
        apiUrl: getBaseUrl(),
        sandboxMode,
      },
    };
  },
  async stopSession(sessionId: string, reason = "USER_CLOSED") {
    await liveAvatarFetch("/v1/sessions/stop", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, reason }),
    }).catch((error) => {
      console.warn("[LiveAvatar] Failed to stop session:", error);
    });
  },
  async getStatus() {
    if (!process.env.LIVEAVATAR_API_KEY) return { configured: false };
    const payload = await liveAvatarFetch("/v1/users/credits").catch((error) => ({
      error: error instanceof Error ? error.message : "Failed to fetch credits",
    }));
    const payloadRecord = asRecord(payload);
    return { configured: true, credits: payloadRecord?.data || payload };
  },
};
