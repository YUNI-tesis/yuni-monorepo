"use client";

import { useEffect, useMemo, useState } from "react";
import type { CreateAvatarRequest } from "../lib/api/avatar-api";
import type { ApiLiveAvatarOption } from "../lib/api/live-avatar-api";
import { createLiveAvatarConfig } from "../lib/avatar-config";
import { createVoiceConfig, type VoiceOption } from "../lib/voice-config";

export const avatarBuilderSteps = ["Identidad", "Avatar", "Voz", "Persona", "Contexto", "Review"] as const;

export type AvatarBuilderStep = (typeof avatarBuilderSteps)[number];

export type AvatarBuilderState = {
  name: string;
  description: string;
  liveAvatarId: string;
  voiceId: string;
  instructions: string;
  context: string;
  files: File[];
};

export type AvatarBuilderField = keyof AvatarBuilderState;

export type AvatarBuilderValidation = Partial<Record<AvatarBuilderField | "form", string>>;

export function createInitialAvatarBuilderState(): AvatarBuilderState {
  return {
    name: "",
    description: "",
    liveAvatarId: "",
    voiceId: "",
    instructions: "",
    context: "",
    files: [],
  };
}

export function validateAvatarBuilderState(state: AvatarBuilderState): AvatarBuilderValidation {
  const errors: AvatarBuilderValidation = {};

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

  return errors;
}

export function validateAvatarBuilderStep(
  state: AvatarBuilderState,
  stepIndex: number
): AvatarBuilderValidation {
  const errors = validateAvatarBuilderState(state);
  const step = avatarBuilderSteps[stepIndex];

  if (step === "Identidad") {
    return pickErrors(errors, ["name"]);
  }

  if (step === "Avatar") {
    return pickErrors(errors, ["liveAvatarId"]);
  }

  if (step === "Voz") {
    return pickErrors(errors, ["voiceId"]);
  }

  if (step === "Persona") {
    return pickErrors(errors, ["instructions"]);
  }

  return {};
}

export function buildCreateAvatarRequest(
  state: AvatarBuilderState,
  selectedLiveAvatar?: ApiLiveAvatarOption | null,
  selectedVoice?: VoiceOption | null
): CreateAvatarRequest {
  return {
    name: state.name.trim(),
    description: state.description.trim(),
    instructions: state.instructions.trim(),
    context: state.context.trim(),
    voiceConfig: createVoiceConfig({
      voiceId: state.voiceId,
      selectedVoice: selectedVoice ?? null,
    }),
    liveAvatarConfig: createLiveAvatarConfig({
      avatarId: state.liveAvatarId,
      selectedAvatar: selectedLiveAvatar,
    }),
    status: "active",
  };
}

export function useAvatarBuilder(liveAvatarOptions: ApiLiveAvatarOption[] = [], voiceOptions: VoiceOption[] = []) {
  const [state, setState] = useState(createInitialAvatarBuilderState);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [errors, setErrors] = useState<AvatarBuilderValidation>({});
  const currentStep = avatarBuilderSteps[currentStepIndex];
  const canGoBack = currentStepIndex > 0;
  const isLastStep = currentStepIndex === avatarBuilderSteps.length - 1;
  const selectedLiveAvatar = useMemo(
    () => liveAvatarOptions.find((option) => option.id === state.liveAvatarId) ?? null,
    [liveAvatarOptions, state.liveAvatarId]
  );
  const selectedVoice = useMemo(
    () => voiceOptions.find((option) => option.id === state.voiceId) ?? null,
    [state.voiceId, voiceOptions]
  );

  useEffect(() => {
    if (state.liveAvatarId || liveAvatarOptions.length === 0) {
      return;
    }

    setState((currentState) => {
      if (currentState.liveAvatarId) {
        return currentState;
      }

      return { ...currentState, liveAvatarId: liveAvatarOptions[0]?.id ?? "" };
    });
  }, [liveAvatarOptions, state.liveAvatarId]);

  useEffect(() => {
    if (state.voiceId || voiceOptions.length === 0) {
      return;
    }

    setState((currentState) => {
      if (currentState.voiceId) {
        return currentState;
      }

      return { ...currentState, voiceId: voiceOptions[0]?.id ?? "" };
    });
  }, [state.voiceId, voiceOptions]);

  function updateField<Field extends keyof AvatarBuilderState>(field: Field, value: AvatarBuilderState[Field]) {
    setState((currentState) => ({ ...currentState, [field]: value }));
    setErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };
      delete nextErrors[field];
      delete nextErrors.form;
      return nextErrors;
    });
  }

  function goBack() {
    setCurrentStepIndex((index) => Math.max(0, index - 1));
    setErrors({});
  }

  function goNext() {
    const stepErrors = validateAvatarBuilderStep(state, currentStepIndex);

    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return false;
    }

    setCurrentStepIndex((index) => Math.min(avatarBuilderSteps.length - 1, index + 1));
    setErrors({});
    return true;
  }

  function validateAll() {
    const validationErrors = validateAvatarBuilderState(state);
    setErrors(validationErrors);
    return Object.keys(validationErrors).length === 0;
  }

  function setFormError(message: string) {
    setErrors((currentErrors) => ({ ...currentErrors, form: message }));
  }

  return {
    state,
    errors,
    currentStep,
    currentStepIndex,
    canGoBack,
    isLastStep,
    selectedLiveAvatar,
    selectedVoice,
    updateField,
    goBack,
    goNext,
    validateAll,
    setFormError,
  };
}

function pickErrors(
  errors: AvatarBuilderValidation,
  fields: Array<keyof AvatarBuilderState>
): AvatarBuilderValidation {
  return fields.reduce<AvatarBuilderValidation>((selectedErrors, field) => {
    if (errors[field]) {
      selectedErrors[field] = errors[field];
    }

    return selectedErrors;
  }, {});
}
