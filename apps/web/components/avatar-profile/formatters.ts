import type { ApiAvatar, ApiAvatarStatus } from "../../lib/api-client";

export type LiveAvatarSummary = {
  selectedAvatar: string;
  mode: string;
  sandbox: string;
};

export type VoiceSummary = {
  selectedVoice: string;
  providerLabel: string;
  speakingRate: string;
};

export function formatAvatarStatus(status: ApiAvatarStatus): string {
  const labels: Record<ApiAvatarStatus, string> = {
    active: "Activo",
    draft: "Borrador",
    disabled: "Inactivo",
  };

  return labels[status];
}

export function getAvatarStatusTone(status: ApiAvatarStatus) {
  if (status === "active") {
    return "success";
  }

  if (status === "disabled") {
    return "danger";
  }

  return "warning";
}

export function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Fecha no disponible";
  }

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function getLiveAvatarSummary(avatar: ApiAvatar): LiveAvatarSummary {
  const config = readRecord(avatar.liveAvatarConfig);

  return {
    selectedAvatar: readString(config.displayName, readString(config.avatarId, "Sin avatar seleccionado")),
    mode: readString(config.mode, "No definido"),
    sandbox: config.sandbox === true ? "Activo" : "No definido",
  };
}

export function getVoiceSummary(avatar: ApiAvatar): VoiceSummary {
  const config = readRecord(avatar.voiceConfig);

  return {
    selectedVoice: readString(config.displayName, readString(config.voiceId, "No definido")),
    providerLabel: formatProvider(readString(config.provider, "No definido")),
    speakingRate: readNumber(config.speakingRate, "No definido"),
  };
}

function formatProvider(provider: string): string {
  if (provider === "openai") {
    return "OpenAI";
  }

  if (provider === "elevenlabs") {
    return "ElevenLabs";
  }

  return provider;
}

function readRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function readNumber(value: unknown, fallback: string): string {
  return typeof value === "number" ? String(value) : fallback;
}
