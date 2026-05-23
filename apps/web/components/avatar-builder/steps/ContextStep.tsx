import { FileDrop, FormField, Textarea } from "@yuni/ui";
import { StepHeading } from "../StepHeading";
import type { AvatarBuilderController } from "../types";
import styles from "../AvatarBuilder.module.css";

export function ContextStep({ builder }: { builder: AvatarBuilderController }) {
  return (
    <section className={styles.panel}>
      <StepHeading
        title="Contexto"
        description="Agrega informacion base. Los archivos quedan listos visualmente para el modulo de documentos."
      />
      <FormField label="Contexto textual" htmlFor="avatar-context">
        <Textarea
          id="avatar-context"
          value={builder.state.context}
          placeholder="Contexto inicial de prueba, informacion del producto, tono esperado..."
          onChange={(event) => builder.updateField("context", event.currentTarget.value)}
        />
      </FormField>
      <FileDrop
        title="Subir contexto"
        description="PDF, TXT o DOCX para futuras pruebas visuales."
        accept=".pdf,.txt,.doc,.docx"
        files={builder.state.files}
        onFilesSelected={(files) => builder.updateField("files", files)}
      />
    </section>
  );
}
