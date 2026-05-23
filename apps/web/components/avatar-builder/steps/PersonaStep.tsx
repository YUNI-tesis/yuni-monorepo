import { FormField, Textarea } from "@yuni/ui";
import { StepHeading } from "../StepHeading";
import type { AvatarBuilderController } from "../types";
import styles from "../AvatarBuilder.module.css";

export function PersonaStep({ builder }: { builder: AvatarBuilderController }) {
  return (
    <section className={styles.panel}>
      <StepHeading title="Persona" description="Defini como debe comportarse el agente cuando responda." />
      <FormField
        label="Instrucciones"
        htmlFor="avatar-instructions"
        hint="Ejemplo: responde con claridad, pregunta cuando falte contexto y evita inventar."
        error={builder.errors.instructions}
      >
        <Textarea
          id="avatar-instructions"
          value={builder.state.instructions}
          invalid={Boolean(builder.errors.instructions)}
          placeholder="Responde de forma clara y amable."
          onChange={(event) => builder.updateField("instructions", event.currentTarget.value)}
        />
      </FormField>
    </section>
  );
}
