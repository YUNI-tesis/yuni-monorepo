import { FormField, Textarea } from "@yuni/ui";
import { StepHeading } from "../StepHeading";
import type { AvatarBuilderController } from "../types";
import styles from "../AvatarBuilder.module.css";

export function PersonaStep({ builder }: { builder: AvatarBuilderController }) {
  return (
    <section className={styles.panel}>
      <StepHeading
        title="Personalidad"
        description="Indicá cómo debe comportarse y responder durante una conversación."
      />
      <FormField
        label="Instrucciones de comportamiento"
        htmlFor="avatar-instructions"
        hint="Ejemplo: respondé con claridad, preguntá cuando falte información y evitá inventar."
        error={builder.errors.instructions}
      >
        <Textarea
          id="avatar-instructions"
          className={styles.instructionsInput}
          value={builder.state.instructions}
          invalid={Boolean(builder.errors.instructions)}
          placeholder="Describí el tono, los límites y la forma de responder."
          onChange={(event) => builder.updateField("instructions", event.currentTarget.value)}
        />
      </FormField>
    </section>
  );
}
