import { FormField, Input, Textarea } from "@yuni/ui";
import type { AvatarBuilderController } from "../types";
import { StepHeading } from "../StepHeading";
import styles from "../AvatarBuilder.module.css";

export function IdentityStep({ builder }: { builder: AvatarBuilderController }) {
  return (
    <section className={styles.panel}>
      <StepHeading
        title="Identidad"
        description="Definí cómo vas a reconocerlo y qué información verán quienes interactúen con él."
      />
      <div className={styles.formGrid}>
        <FormField label="Nombre" htmlFor="avatar-name" error={builder.errors.name}>
          <Input
            id="avatar-name"
            value={builder.state.name}
            invalid={Boolean(builder.errors.name)}
            placeholder="YUNI Demo"
            onChange={(event) => builder.updateField("name", event.currentTarget.value)}
          />
        </FormField>
        <FormField
          label="Descripción"
          htmlFor="avatar-description"
          hint="Se muestra en el perfil y ayuda a diferenciarlo de otros avatares."
        >
          <Textarea
            id="avatar-description"
            className={styles.descriptionInput}
            value={builder.state.description}
            placeholder="Contá brevemente para qué sirve este avatar."
            onChange={(event) => builder.updateField("description", event.currentTarget.value)}
          />
        </FormField>
      </div>
    </section>
  );
}
