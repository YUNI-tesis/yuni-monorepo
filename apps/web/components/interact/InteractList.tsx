"use client";

import { useRouter } from "next/navigation";
import { Badge, Button, Card, ErrorState, LoadingState, PageHeader } from "@yuni/ui";
import { useAvatarList } from "../../hooks/useAvatarList";
import { formatAvatarStatusLabel, formatProviderSyncLabel } from "../../lib/avatar-dashboard";
import type { ApiAvatarSummary } from "../../lib/api/avatar-api";
import styles from "./Interact.module.css";

export function InteractList() {
  const router = useRouter();
  const avatarList = useAvatarList();

  return (
    <div className={styles.layout}>
      <PageHeader
        eyebrow="Interact"
        title="Llamadas privadas"
        description="Elegí un avatar propio para iniciar una conversación de prueba."
        actions={<Button onClick={() => router.push("/avatars/new")}>Crear avatar</Button>}
      />

      {avatarList.status === "loading" ? (
        <LoadingState title="Cargando avatares" description="Estamos preparando tus opciones." />
      ) : avatarList.status === "error" ? (
        <ErrorState title="No pudimos cargar Interact" description={avatarList.error} />
      ) : avatarList.avatars.length === 0 ? (
        <Card padding="lg" className={styles.avatarCard}>
          <div className={styles.avatarMeta}>
            <strong>Todavía no tenés avatares</strong>
            <span className="yuni-text-muted">Creá un avatar para probar una llamada privada.</span>
          </div>
          <Button onClick={() => router.push("/avatars/new")}>Crear avatar</Button>
        </Card>
      ) : (
        <div className={styles.avatarGrid}>
          {avatarList.avatars.map((avatar) => (
            <Card key={avatar.id} padding="md" className={styles.avatarCard}>
              <div className={styles.avatarMeta}>
                <Badge tone={avatar.status === "active" ? "success" : "neutral"}>
                  {formatAvatarStatusLabel(avatar.status)}
                </Badge>
                <strong>{avatar.name}</strong>
                <span className="yuni-text-muted">{avatar.description || "Sin descripcion."}</span>
                <span className="yuni-text-muted">Sync: {formatSyncStatus(avatar.providerSyncStatus)}</span>
              </div>
              <Button onClick={() => router.push(`/interact/${avatar.id}`)}>Abrir llamada</Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function formatSyncStatus(status: ApiAvatarSummary["providerSyncStatus"]) {
  return formatProviderSyncLabel(status).toLowerCase();
}
