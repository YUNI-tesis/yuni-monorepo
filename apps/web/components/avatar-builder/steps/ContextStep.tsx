import { FormField, Textarea } from "@yuni/ui";
import { DocumentFileDrop } from "../../context/DocumentFileDrop";
import { StepHeading } from "../StepHeading";
import type { AvatarBuilderController } from "../types";
import styles from "../AvatarBuilder.module.css";

export function ContextStep({ builder }: { builder: AvatarBuilderController }) {
  return (
    <section className={styles.panel}>
      <StepHeading
        title="Contexto"
        description="Sumá información y documentos que el avatar podrá consultar al responder."
      />
      <FormField
        label="Contexto textual"
        htmlFor="avatar-context"
        hint="Podés ampliar o actualizar este contenido más adelante desde la pestaña Contexto."
        error={builder.errors.context}
      >
        <Textarea
          id="avatar-context"
          className={styles.contextInput}
          value={builder.state.context}
          invalid={Boolean(builder.errors.context)}
          placeholder="Información del producto, preguntas frecuentes, criterios de atención..."
          onChange={(event) => builder.updateField("context", event.currentTarget.value)}
          maxLength={20_000}
        />
      </FormField>
      <DocumentFileDrop
        files={builder.state.files}
        onFilesSelected={(files) => builder.updateField("files", files)}
      />
    </section>
  );
}
