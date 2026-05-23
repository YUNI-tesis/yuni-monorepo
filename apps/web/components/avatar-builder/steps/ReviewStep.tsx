import { Badge } from "@yuni/ui";
import { StepHeading } from "../StepHeading";
import type { AvatarBuilderController } from "../types";
import styles from "../AvatarBuilder.module.css";

export function ReviewStep({ builder }: { builder: AvatarBuilderController }) {
  return (
    <section className={styles.panel}>
      <StepHeading title="Review" description="Revisa la configuracion antes de crear el avatar." />
      <dl className={styles.review}>
        <ReviewItem label="Nombre" value={builder.state.name || "Sin nombre"} />
        <ReviewItem label="Descripcion" value={builder.state.description || "Sin descripcion"} />
        <ReviewItem label="Avatar visual" value={builder.selectedLiveAvatar?.name ?? "Sin seleccionar"} />
        <ReviewItem label="Voz" value={builder.selectedVoice?.name ?? "Sin seleccionar"} />
        <ReviewItem label="Instrucciones" value={builder.state.instructions || "Sin instrucciones"} />
        <ReviewItem label="Contexto" value={builder.state.context || "Sin contexto textual"} />
        <ReviewItem label="Archivos" value={formatSelectedFiles(builder.state.files.length)} />
      </dl>
      <div className={styles.configBadges} aria-label="Configuracion tecnica">
        <Badge tone="success">Live Avatar</Badge>
        <Badge tone="success">Lite</Badge>
        <Badge tone="success">Sandbox activo</Badge>
        <Badge tone="neutral">OpenAI voice</Badge>
      </div>
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
