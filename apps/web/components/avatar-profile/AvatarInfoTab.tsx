import { Card, ErrorState, LoadingState } from "@yuni/ui";
import type { ApiAvatar } from "../../lib/api/avatar-api";
import { useLiveAvatarOptions } from "../../hooks/useLiveAvatarOptions";
import { LiveAvatarStage } from "../live-avatar/LiveAvatarStage";
import { formatDateTime, getLiveAvatarSummary, getVoiceSummary } from "./formatters";
import styles from "./AvatarProfile.module.css";

export function AvatarInfoTab({ avatar }: { avatar: ApiAvatar }) {
  const liveAvatar = getLiveAvatarSummary(avatar);
  const shouldResolveLiveAvatar = Boolean(liveAvatar.avatarId && !liveAvatar.hasVisualSnapshot);
  const liveAvatarOptions = useLiveAvatarOptions({ enabled: shouldResolveLiveAvatar });
  const resolvedLiveAvatar = liveAvatarOptions.options.find((option) => option.id === liveAvatar.avatarId) ?? null;
  const selectedLiveAvatar = liveAvatar.hasVisualSnapshot
    ? {
        displayName: liveAvatar.selectedAvatar,
        thumbnailUrl: liveAvatar.thumbnailUrl,
      }
    : resolvedLiveAvatar;
  const liveAvatarLookupFailed =
    shouldResolveLiveAvatar && liveAvatarOptions.status !== "loading" && !resolvedLiveAvatar;
  const liveAvatarEmptyLabel = liveAvatar.avatarId
    ? "No encontramos la vista visual de este avatar."
    : "No hay avatar visual configurado.";
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

        <Card className={styles.stack} padding="md">
          <p className="yuni-eyebrow">Fechas</p>
          <div className={styles.detailsGrid}>
            <InfoField label="Creado" value={formatDateTime(avatar.createdAt)} />
            <InfoField label="Actualizado" value={formatDateTime(avatar.updatedAt)} />
          </div>
        </Card>
      </div>

      <aside className={styles.stack}>
        <Card className={styles.stack} padding="md">
          <p className="yuni-eyebrow">Live Avatar</p>
          {shouldResolveLiveAvatar && liveAvatarOptions.status === "loading" ? (
            <LoadingState title="Cargando avatar" description="Estamos preparando la vista visual." />
          ) : shouldResolveLiveAvatar && liveAvatarOptions.status === "error" ? (
            <ErrorState
              title="No pudimos cargar la vista visual"
              description={liveAvatarOptions.error ?? "El perfil sigue disponible."}
            />
          ) : (
            <LiveAvatarStage
              avatar={selectedLiveAvatar}
              emptyLabel={liveAvatarLookupFailed ? liveAvatarEmptyLabel : "No hay avatar visual configurado."}
            />
          )}
        </Card>

        <Card className={styles.stack} padding="md">
          <p className="yuni-eyebrow">Voz</p>
          <div className={styles.detailsGrid}>
            <InfoField label="Voz seleccionada" value={voice.selectedVoice} />
            <InfoField label="Provider" value={voice.providerLabel} />
            <InfoField label="Velocidad" value={voice.speakingRate} />
          </div>
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
