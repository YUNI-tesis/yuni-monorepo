"use client";

import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from "@yuni/ui";
import { useAvatarList } from "../../hooks/useAvatarList";
import {
  formatAvatarStatusLabel,
  formatProviderSyncLabel,
  getRecentAvatars,
} from "../../lib/avatar-dashboard";
import type { ApiAvatar } from "../../lib/api/avatar-api";
import styles from "./AvatarList.module.css";

export function AvatarListView() {
  const router = useRouter();
  const avatarList = useAvatarList();

  return (
    <div className={styles.layout}>
      <PageHeader
        eyebrow="Avatares"
        title="Tus avatares"
        description="Administra tus avatares privados y abre Interact sin escribir rutas manualmente."
        actions={<Button onClick={() => router.push("/avatars/new")}>Crear avatar</Button>}
      />

      {avatarList.status === "loading" ? (
        <LoadingState title="Cargando avatares" description="Estamos preparando tu lista." />
      ) : avatarList.status === "error" ? (
        <ErrorState title="No pudimos cargar tus avatares" description={avatarList.error} />
      ) : avatarList.avatars.length === 0 ? (
        <Card padding="lg" className={styles.emptyCard}>
          <EmptyState
            title="Todavia no tenes avatares"
            description="Crea tu primer avatar para probar perfiles privados e Interact."
            action={<Button onClick={() => router.push("/avatars/new")}>Crear avatar</Button>}
          />
        </Card>
      ) : (
        <div className={styles.grid}>
          {getRecentAvatars(avatarList.avatars, avatarList.avatars.length).map((avatar) => (
            <AvatarCard key={avatar.id} avatar={avatar} />
          ))}
        </div>
      )}
    </div>
  );
}

function AvatarCard({ avatar }: { avatar: ApiAvatar }) {
  const router = useRouter();

  return (
    <Card padding="md" className={styles.card}>
      <div className={styles.meta}>
        <div className={styles.badges}>
          <Badge tone={avatar.status === "active" ? "success" : "neutral"}>{formatAvatarStatusLabel(avatar.status)}</Badge>
          <Badge tone={avatar.providerSyncStatus === "failed" ? "danger" : avatar.providerSyncStatus === "synced" ? "success" : "warning"}>
            {formatProviderSyncLabel(avatar.providerSyncStatus)}
          </Badge>
        </div>
        <h2 className={styles.title}>{avatar.name}</h2>
        <p className={styles.description}>{avatar.description || "Sin descripcion."}</p>
      </div>

      <div className={styles.actions}>
        <Button variant="secondary" onClick={() => router.push(`/avatars/${avatar.id}`)}>
          Ver perfil
        </Button>
        <Button variant="secondary" onClick={() => router.push(`/avatars/${avatar.id}/edit`)}>
          Editar
        </Button>
        <Button onClick={() => router.push(`/interact/${avatar.id}`)}>Interactuar</Button>
      </div>
    </Card>
  );
}
