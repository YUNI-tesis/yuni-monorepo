import { ErrorState, LoadingState } from "@yuni/ui";
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
  return (
    <section className={styles.panel}>
      <StepHeading title="Voz" description="Selecciona la voz para las respuestas habladas." />
      {voiceOptions.status === "loading" ? (
        <LoadingState title="Cargando voces" description="Estamos trayendo tus voces de ElevenLabs." />
      ) : null}
      {voiceOptions.status === "error" ? (
        <ErrorState title="No pudimos cargar las voces" description={voiceOptions.error} />
      ) : null}
      {voiceOptions.status === "empty" ? (
        <ErrorState
          title="No hay voces disponibles"
          description="Agrega una voz en My Voices de ElevenLabs para crear un avatar conversacional."
        />
      ) : null}
      {voiceOptions.status === "ready" ? (
        <VoiceSelector
          options={voiceOptions.options}
          selectedId={builder.state.voiceId}
          error={builder.errors.voiceId}
          onSelect={(voiceId) => builder.updateField("voiceId", voiceId)}
        />
      ) : null}
    </section>
  );
}
