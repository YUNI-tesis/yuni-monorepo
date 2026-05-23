import { Card } from "@yuni/ui";
import type { ApiAvatar } from "../../lib/api-client";
import { formatDateTime, getLiveAvatarSummary, getVoiceSummary } from "./formatters";
import styles from "./AvatarProfile.module.css";

export function AvatarInfoTab({ avatar }: { avatar: ApiAvatar }) {
  const liveAvatar = getLiveAvatarSummary(avatar);
  const voice = getVoiceSummary(avatar);

  return (
    <div className={styles.sectionGrid}>
      <div className={styles.stack}>
        <Card className={styles.stack} padding="md">
          <InfoField label="Instrucciones/persona" value={avatar.instructions || "Sin instrucciones configuradas."} />
          <InfoField label="Contexto" value={avatar.context || "Sin contexto textual configurado."} />
        </Card>

        <Card className={styles.stack} padding="md">
          <p className="yuni-eyebrow">Documentos</p>
          <div className={styles.documentsShell}>
            <strong>Todavia no hay documentos asociados</strong>
            <p className={styles.emptyText}>La subida e ingestion de documentos se implementa en un modulo posterior.</p>
          </div>
        </Card>
      </div>

      <aside className={styles.stack}>
        <Card className={styles.stack} padding="md">
          <p className="yuni-eyebrow">Live Avatar</p>
          <div className={styles.detailsGrid}>
            <InfoField label="Avatar seleccionado" value={liveAvatar.selectedAvatar} />
            <InfoField label="Modo" value={liveAvatar.mode} />
            <InfoField label="Sandbox" value={liveAvatar.sandbox} />
          </div>
        </Card>

        <Card className={styles.stack} padding="md">
          <p className="yuni-eyebrow">Voz</p>
          <div className={styles.detailsGrid}>
            <InfoField label="Voz seleccionada" value={voice.selectedVoice} />
            <InfoField label="Provider" value={voice.providerLabel} />
            <InfoField label="Velocidad" value={voice.speakingRate} />
          </div>
        </Card>

        <Card className={styles.stack} padding="md">
          <p className="yuni-eyebrow">Fechas</p>
          <InfoField label="Creado" value={formatDateTime(avatar.createdAt)} />
          <InfoField label="Actualizado" value={formatDateTime(avatar.updatedAt)} />
        </Card>
      </aside>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <p className={styles.fieldValue}>{value}</p>
    </div>
  );
}
