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
        description="Agregá información breve y documentos que el avatar podrá consultar en las conversaciones."
      />
      <FormField label="Contexto textual" htmlFor="avatar-context">
        <Textarea
          id="avatar-context"
          value={builder.state.context}
          placeholder="Contexto inicial de prueba, informacion del producto, tono esperado..."
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
