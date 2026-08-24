import { FormField, Input, Textarea } from "@yuni/ui";
import type { AvatarBuilderController } from "../types";
import { StepHeading } from "../StepHeading";
import styles from "../AvatarBuilder.module.css";

export function IdentityStep({ builder }: { builder: AvatarBuilderController }) {
  return (
    <section className={styles.panel}>
      <StepHeading
        title="Identidad"
        description="Estos datos son los que van a ver vos y, mas adelante, quienes reciban un link publico."
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
          label="Descripcion"
          htmlFor="avatar-description"
          hint="Corta, concreta y visible para visitantes."
        >
          <Textarea
            id="avatar-description"
            value={builder.state.description}
            placeholder="Un avatar para responder consultas de producto."
            onChange={(event) => builder.updateField("description", event.currentTarget.value)}
          />
        </FormField>
      </div>
    </section>
  );
}
