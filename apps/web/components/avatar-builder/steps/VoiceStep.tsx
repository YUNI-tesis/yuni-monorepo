import { FormField, Select } from "@yuni/ui";
import { voiceOptions } from "../options";
import { StepHeading } from "../StepHeading";
import type { AvatarBuilderController } from "../types";
import styles from "../AvatarBuilder.module.css";

export function VoiceStep({ builder }: { builder: AvatarBuilderController }) {
  const selectedVoice = voiceOptions.find((voice) => voice.id === builder.state.voiceId);

  return (
    <section className={styles.panel}>
      <StepHeading title="Voz" description="Selecciona la voz inicial para respuestas habladas." />
      <FormField label="Voz" htmlFor="avatar-voice" error={builder.errors.voiceId}>
        <Select
          id="avatar-voice"
          value={builder.state.voiceId}
          invalid={Boolean(builder.errors.voiceId)}
          onValueChange={(value) => builder.updateField("voiceId", value)}
        >
          {voiceOptions.map((voice) => (
            <option key={voice.id} value={voice.id}>
              {voice.name}
            </option>
          ))}
        </Select>
      </FormField>
      {selectedVoice ? (
        <div className={styles.voicePreview}>
          <strong>{selectedVoice.name}</strong>
          <span>{selectedVoice.description}</span>
        </div>
      ) : null}
    </section>
  );
}
