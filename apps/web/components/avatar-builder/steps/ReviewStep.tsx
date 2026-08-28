import { StepHeading } from "../StepHeading";
import type { AvatarBuilderController } from "../types";
import styles from "../AvatarBuilder.module.css";

export function ReviewStep({ builder }: { builder: AvatarBuilderController }) {
  return (
    <section className={styles.panel}>
      <StepHeading title="Revisión final" description="Confirmá la configuración antes de crear el avatar." />
      <dl className={styles.review}>
        <ReviewItem label="Nombre" value={builder.state.name || "Sin nombre"} />
        <ReviewItem label="Descripción" value={builder.state.description || "Sin descripción"} />
        <ReviewItem
          label="Avatar visual"
          value={builder.selectedLiveAvatar?.displayName ?? "Sin seleccionar"}
        />
        <ReviewItem label="Voz" value={builder.selectedVoice?.displayName ?? "Sin seleccionar"} />
        <ReviewItem label="Instrucciones" value={builder.state.instructions || "Sin instrucciones"} />
        <ReviewItem label="Contexto" value={builder.state.context || "Sin contexto textual"} />
        <ReviewItem label="Archivos" value={formatSelectedFiles(builder.state.files.length)} />
      </dl>
    </section>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.reviewItem}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatSelectedFiles(fileCount: number) {
  if (fileCount === 0) {
    return "Sin archivos";
  }

  if (fileCount === 1) {
    return "1 archivo seleccionado";
  }

  return `${fileCount} archivos seleccionados`;
}
