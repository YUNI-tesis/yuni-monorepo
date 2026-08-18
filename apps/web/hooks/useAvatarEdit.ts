"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getAvatar, type ApiAvatar, type UpdateAvatarRequest } from "../lib/api/avatar-api";
import { ApiClientError } from "../lib/api/http-client";
import type { ApiLiveAvatarOption } from "../lib/api/live-avatar-api";
import { createLiveAvatarConfig } from "../lib/avatar-config";
import { createVoiceConfig, type VoiceOption } from "../lib/voice-config";

export type AvatarEditState = {
  name: string;
  description: string;
  status: ApiAvatar["status"];
  liveAvatarId: string;
  liveAvatarDisplayName: string;
  liveAvatarThumbnailUrl: string | null;
  voiceProvider: VoiceOption["provider"];
  voiceId: string;
  voiceDisplayName: string;
  voiceDescription: string;
  instructions: string;
  context: string;
  files: File[];
};

export type AvatarEditField = keyof AvatarEditState;
export type AvatarEditValidation = Partial<Record<AvatarEditField | "form" | "success", string>>;

export type AvatarEditLoadState =
  | {
      status: "loading";
      avatar: null;
      state: null;
      error: null;
    }
  | {
      status: "ready";
      avatar: ApiAvatar;
      state: AvatarEditState;
      error: null;
    }
  | {
      status: "not-found" | "error";
      avatar: null;
      state: null;
      error: string;
    };

export function createAvatarEditStateFromAvatar(avatar: ApiAvatar): AvatarEditState {
  const liveAvatarConfig = readRecord(avatar.liveAvatarConfig);
  const voiceConfig = readRecord(avatar.voiceConfig);

  return {
    name: avatar.name,
    description: avatar.description,
    status: avatar.status,
    liveAvatarId: readString(liveAvatarConfig.avatarId, ""),
    liveAvatarDisplayName: readString(liveAvatarConfig.displayName, ""),
    liveAvatarThumbnailUrl: readNullableString(liveAvatarConfig.thumbnailUrl),
    voiceProvider: readVoiceProvider(voiceConfig.provider),
    voiceId: readString(voiceConfig.voiceId, ""),
    voiceDisplayName: readString(voiceConfig.displayName, ""),
    voiceDescription: readString(voiceConfig.description, ""),
    instructions: avatar.instructions,
    context: avatar.context,
    files: [],
  };
}

export function validateAvatarEditState(state: AvatarEditState): AvatarEditValidation {
  const errors: AvatarEditValidation = {};

  if (!state.name.trim()) {
    errors.name = "El nombre es obligatorio.";
  }

  if (!state.liveAvatarId) {
    errors.liveAvatarId = "Selecciona un avatar visual.";
  }

  if (!state.voiceId) {
    errors.voiceId = "Selecciona una voz.";
  }

  if (!state.instructions.trim()) {
    errors.instructions = "Las instrucciones son obligatorias.";
  }

  if (state.context.length > 20_000) {
    errors.context = "El contexto textual admite hasta 20.000 caracteres.";
  }

  return errors;
}

export function buildUpdateAvatarRequest(
  state: AvatarEditState,
  selectedLiveAvatar?: ApiLiveAvatarOption | null,
  selectedVoice?: VoiceOption | null
): UpdateAvatarRequest {
  return {
    name: state.name.trim(),
    description: state.description.trim(),
    status: state.status,
    instructions: state.instructions.trim(),
    context: state.context.trim(),
    voiceConfig: createVoiceConfig({
      voiceId: state.voiceId,
      selectedVoice: selectedVoice ?? null,
      fallbackProvider: state.voiceProvider,
      fallbackDisplayName: state.voiceDisplayName,
      fallbackDescription: state.voiceDescription,
    }),
    liveAvatarConfig: createLiveAvatarConfig({
      avatarId: state.liveAvatarId,
      selectedAvatar: selectedLiveAvatar,
      fallbackDisplayName: state.liveAvatarDisplayName,
      fallbackThumbnailUrl: state.liveAvatarThumbnailUrl,
    }),
  };
}

export function useAvatarEdit(avatarId: string) {
  const router = useRouter();
  const [loadState, setLoadState] = useState<AvatarEditLoadState>({
    status: "loading",
    avatar: null,
    state: null,
    error: null,
  });
  const [errors, setErrors] = useState<AvatarEditValidation>({});

  useEffect(() => {
    let isMounted = true;

    setErrors({});
    setLoadState({ status: "loading", avatar: null, state: null, error: null });

    getAvatar(avatarId)
      .then(({ avatar }) => {
        if (isMounted) {
          setLoadState({
            status: "ready",
            avatar,
            state: createAvatarEditStateFromAvatar(avatar),
            error: null,
          });
        }
      })
      .catch((caughtError) => {
        if (caughtError instanceof ApiClientError && caughtError.status === 401) {
          router.push("/auth/login");
          return;
        }

        if (!isMounted) {
          return;
        }

        if (caughtError instanceof ApiClientError && caughtError.status === 404) {
          setLoadState({
            status: "not-found",
            avatar: null,
            state: null,
            error: "No encontramos este avatar.",
          });
          return;
        }

        setLoadState({
          status: "error",
          avatar: null,
          state: null,
          error: caughtError instanceof Error ? caughtError.message : "No pudimos cargar el avatar.",
        });
      });

    return () => {
      isMounted = false;
    };
  }, [avatarId, router]);

  function updateField<Field extends keyof AvatarEditState>(field: Field, value: AvatarEditState[Field]) {
    setLoadState((currentLoadState) => {
      if (currentLoadState.status !== "ready") {
        return currentLoadState;
      }

      return {
        ...currentLoadState,
        state: {
          ...currentLoadState.state,
          [field]: value,
        },
      };
    });
    setErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };
      delete nextErrors[field];
      delete nextErrors.form;
      delete nextErrors.success;
      return nextErrors;
    });
  }

  function validateAll() {
    const currentState = loadState.state;

    if (!currentState) {
      setErrors({ form: "No pudimos preparar el formulario." });
      return false;
    }

    const validationErrors = validateAvatarEditState(currentState);
    setErrors(validationErrors);
    return Object.keys(validationErrors).length === 0;
  }

  function setFormError(message: string) {
    setErrors((currentErrors) => {
      const nextErrors = { ...currentErrors, form: message };
      delete nextErrors.success;
      return nextErrors;
    });
  }

  function setSuccess(message: string) {
    setErrors((currentErrors) => {
      const nextErrors = { ...currentErrors, success: message };
      delete nextErrors.form;
      return nextErrors;
    });
  }

  return {
    loadState,
    errors,
    updateField,
    validateAll,
    setFormError,
    setSuccess,
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

function readVoiceProvider(value: unknown): VoiceOption["provider"] {
  return value === "openai" || value === "elevenlabs" ? value : "elevenlabs";
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
