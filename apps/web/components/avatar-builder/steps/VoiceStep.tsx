"use client";

import { ErrorState, LoadingState, useToast } from "@yuni/ui";
import { VoiceSelector } from "../../voice/VoiceSelector";
import { StepHeading } from "../StepHeading";
import type { ElevenLabsVoiceOptionsState } from "../../../hooks/useElevenLabsVoiceOptions";
import type { AvatarBuilderController } from "../types";
import styles from "../AvatarBuilder.module.css";

export function VoiceStep({
  builder,
  voiceOptions,
}: {
  builder: AvatarBuilderController;
  voiceOptions: ElevenLabsVoiceOptionsState;
}) {
  const toast = useToast();

  return (
    <section className={styles.panel}>
      <StepHeading
        title="Voz"
        description="Escuchá las muestras y elegí el tono que mejor represente al avatar."
      />
      {voiceOptions.status === "loading" ? (
        <LoadingState title="Cargando voces" description="Estamos preparando el catálogo disponible." />
      ) : null}
      {voiceOptions.status === "error" ? (
        <ErrorState title="No pudimos cargar las voces" description={voiceOptions.error} />
      ) : null}
      {voiceOptions.status === "empty" ? (
        <ErrorState
          title="No hay voces disponibles"
          description="Todavía no hay voces configuradas para crear un avatar conversacional."
        />
      ) : null}
      {voiceOptions.status === "ready" ? (
        <VoiceSelector
          options={voiceOptions.options}
          selectedId={builder.state.voiceId}
          error={builder.errors.voiceId}
          onSelect={(voiceId) => builder.updateField("voiceId", voiceId)}
          onPreviewError={(voice) =>
            toast.error("Probá nuevamente o elegí otra voz.", {
              title: `No pudimos reproducir ${voice.displayName.split(" - ")[0] ?? "la muestra"}`,
              dedupeKey: `voice:${voice.id}:preview:error`,
            })
          }
        />
      ) : null}
    </section>
  );
}
