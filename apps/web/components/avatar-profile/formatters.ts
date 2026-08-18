import type { ApiAvatar } from "../../lib/api/avatar-api";

export const avatarProfileTabs = [
  { value: "info", label: "Información" },
  { value: "contexto", label: "Contexto" },
  { value: "compartir", label: "Compartir" },
  { value: "actividad", label: "Actividad" },
] as const;

export type AvatarProfileTab = (typeof avatarProfileTabs)[number]["value"];

export type LiveAvatarSummary = {
  avatarId: string;
  selectedAvatar: string;
  thumbnailUrl: string | null;
  hasVisualSnapshot: boolean;
  mode: string;
  sandbox: string;
  sandboxEnabled: boolean;
};

export type VoiceSummary = {
  selectedVoice: string;
  description: string;
};

export type AvatarProfileTone = "success" | "warning" | "danger" | "neutral";

export type AvatarHeaderState = {
  label: string;
  tone: AvatarProfileTone;
};

export function resolveAvatarProfileTab(value: string | null | undefined): AvatarProfileTab {
  if (value === "share") {
    return "compartir";
  }

  if (value === "activity") {
    return "actividad";
  }

  return avatarProfileTabs.some((tab) => tab.value === value) ? (value as AvatarProfileTab) : "info";
}

export function getAvatarHeaderState(avatar: ApiAvatar): AvatarHeaderState {
  if (avatar.status === "disabled") {
    return {
      label: "Inactivo",
      tone: "neutral",
    };
  }

  if (avatar.status === "draft") {
    return {
      label: "Borrador",
      tone: "warning",
    };
  }

  if (avatar.providerStatus === "needs_attention") {
    return {
      label: "Revisar configuración",
      tone: "danger",
    };
  }

  if (!hasConfiguredVoice(avatar) || !hasConfiguredLiveAvatar(avatar)) {
    return {
      label: "Configuración incompleta",
      tone: "warning",
    };
  }

  if (avatar.providerStatus === "preparing") {
    return {
      label: "Preparando cambios",
      tone: "warning",
    };
  }

  return {
    label: "Listo para usar",
    tone: "success",
  };
}

export function hasConfiguredVoice(avatar: ApiAvatar): boolean {
  const config = readRecord(avatar.voiceConfig);

  return readString(config.voiceId, "").trim().length > 0;
}

export function hasConfiguredLiveAvatar(avatar: ApiAvatar): boolean {
  const config = readRecord(avatar.liveAvatarConfig);

  return readString(config.avatarId, "").trim().length > 0;
}

export function getLiveAvatarSummary(avatar: ApiAvatar): LiveAvatarSummary {
  const config = readRecord(avatar.liveAvatarConfig);
  const avatarId = readString(config.avatarId, "");
  const displayName = readString(config.displayName, "");
  const thumbnailUrl = readNullableString(config.thumbnailUrl);

  return {
    avatarId,
    selectedAvatar: displayName || "Sin avatar seleccionado",
    thumbnailUrl,
    hasVisualSnapshot: Boolean(displayName),
    mode: readString(config.mode, "No definido"),
    sandbox: config.sandbox === true ? "Activo" : "No definido",
    sandboxEnabled: config.sandbox === true,
  };
}

export function getVoiceSummary(avatar: ApiAvatar): VoiceSummary {
  const config = readRecord(avatar.voiceConfig);

  return {
    selectedVoice: readString(config.displayName, readString(config.voiceId, "No definido")),
    description: readString(config.description, "Sin descripción configurada."),
  };
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

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
