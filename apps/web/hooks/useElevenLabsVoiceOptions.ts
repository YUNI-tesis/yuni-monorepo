"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ApiClientError } from "../lib/api/http-client";
import {
  getElevenLabsVoiceOptions,
  type ApiElevenLabsVoiceOption,
} from "../lib/api/voice-provider-api";
import { currentVoiceOptionName, type VoiceOption } from "../lib/voice-config";

export type ElevenLabsVoiceOptionsState =
  | {
      status: "loading";
      options: VoiceOption[];
      error: null;
    }
  | {
      status: "ready" | "empty";
      options: VoiceOption[];
      error: null;
    }
  | {
      status: "error";
      options: VoiceOption[];
      error: string;
    };

export type UseElevenLabsVoiceOptionsOptions = {
  currentVoiceId?: string | undefined;
  currentVoiceDisplayName?: string | undefined;
  currentVoiceDescription?: string | undefined;
  currentVoiceProvider?: VoiceOption["provider"] | undefined;
  includeCurrentFallback?: boolean;
  enabled?: boolean;
};

export function useElevenLabsVoiceOptions(
  options: UseElevenLabsVoiceOptionsOptions = {}
): ElevenLabsVoiceOptionsState {
  const {
    currentVoiceId,
    currentVoiceDisplayName,
    currentVoiceDescription,
    currentVoiceProvider,
    includeCurrentFallback = false,
    enabled = true,
  } = options;
  const router = useRouter();
  const [state, setState] = useState<ElevenLabsVoiceOptionsState>({
    status: "loading",
    options: [],
    error: null,
  });

  useEffect(() => {
    let isMounted = true;

    if (!enabled) {
      setState({ status: "empty", options: [], error: null });
      return () => {
        isMounted = false;
      };
    }

    setState({ status: "loading", options: [], error: null });

    getElevenLabsVoiceOptions()
      .then(({ voices }) => {
        if (!isMounted) {
          return;
        }

        const normalizedVoices = voices.map(toVoiceOption);

        setState({
          status: normalizedVoices.length > 0 ? "ready" : "empty",
          options: normalizedVoices,
          error: null,
        });
      })
      .catch((caughtError) => {
        if (caughtError instanceof ApiClientError && caughtError.status === 401) {
          router.push("/auth/login");
          return;
        }

        if (!isMounted) {
          return;
        }

        setState({
          status: "error",
          options: [],
          error: "No pudimos cargar las voces disponibles. Intenta nuevamente en unos minutos.",
        });
      });

    return () => {
      isMounted = false;
    };
  }, [enabled, router]);

  return useMemo(() => {
    if (!enabled) {
      return { status: "empty", options: [], error: null };
    }

    const resolvedOptions = includeCurrentFallback
      ? withCurrentVoiceOption(state.options, {
          currentVoiceId,
          currentVoiceDisplayName,
          currentVoiceDescription,
          currentVoiceProvider,
        })
      : state.options;

    if (state.status === "loading") {
      return state;
    }

    if (state.status === "error") {
      return {
        ...state,
        options: resolvedOptions,
      };
    }

    return {
      ...state,
      status: resolvedOptions.length > 0 ? "ready" : "empty",
      options: resolvedOptions,
    };
  }, [
    currentVoiceDescription,
    currentVoiceDisplayName,
    currentVoiceId,
    currentVoiceProvider,
    enabled,
    includeCurrentFallback,
    state,
  ]);
}

export function withCurrentVoiceOption(
  options: VoiceOption[],
  input: {
    currentVoiceId?: string | undefined;
    currentVoiceDisplayName?: string | undefined;
    currentVoiceDescription?: string | undefined;
    currentVoiceProvider?: VoiceOption["provider"] | undefined;
  }
): VoiceOption[] {
  if (!input.currentVoiceId || options.some((option) => option.id === input.currentVoiceId)) {
    return options;
  }

  return [
    {
      id: input.currentVoiceId,
      displayName: input.currentVoiceDisplayName || currentVoiceOptionName,
      description: input.currentVoiceDescription || "Se preserva la voz actual guardada en este avatar.",
      provider: input.currentVoiceProvider ?? "elevenlabs",
      toneLabel: "Actual",
      recommendedFor: "Mantener la voz guardada en este avatar.",
      previewUrl: null,
      category: null,
      labels: {},
    },
    ...options,
  ];
}

function toVoiceOption(voice: ApiElevenLabsVoiceOption): VoiceOption {
  return {
    ...voice,
    toneLabel: createToneLabel(voice),
    recommendedFor: voice.recommendedFor || "Voz guardada en ElevenLabs.",
  };
}

function createToneLabel(voice: ApiElevenLabsVoiceOption): string {
  return voice.labels.use_case ?? voice.labels.gender ?? voice.category ?? "ElevenLabs";
}
