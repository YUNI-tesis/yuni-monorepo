import { VoiceSelector } from "../../voice/VoiceSelector";
import { voiceOptions } from "../../../lib/voice-config";
import { StepHeading } from "../StepHeading";
import type { AvatarBuilderController } from "../types";
import styles from "../AvatarBuilder.module.css";

export function VoiceStep({ builder }: { builder: AvatarBuilderController }) {
  return (
    <section className={styles.panel}>
      <StepHeading title="Voz" description="Selecciona la voz para las respuestas habladas." />
      <VoiceSelector
        options={voiceOptions}
        selectedId={builder.state.voiceId}
        error={builder.errors.voiceId}
        onSelect={(voiceId) => builder.updateField("voiceId", voiceId)}
      />
    </section>
  );
}
