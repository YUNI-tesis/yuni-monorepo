"use client";

import { useRouter } from "next/navigation";
import { Badge, Button, Card, ErrorState, LoadingState, PageHeader, PageShell, Tabs } from "@yuni/ui";
import { useAvatarProfile } from "../../hooks/useAvatarProfile";
import { AvatarInfoTab } from "./AvatarInfoTab";
import { AvatarSharePlaceholder } from "./AvatarSharePlaceholder";
import { formatAvatarStatus, getAvatarStatusTone } from "./formatters";
import styles from "./AvatarProfile.module.css";

export function AvatarProfile({ avatarId }: { avatarId: string }) {
  const router = useRouter();
  const profile = useAvatarProfile(avatarId);

  if (profile.status === "loading") {
    return (
      <PageShell maxWidth="980px">
        <LoadingState title="Cargando avatar" description="Estamos preparando el perfil." />
      </PageShell>
    );
  }

  if (profile.status === "not-found") {
    return (
      <PageShell maxWidth="760px">
        <ErrorState
          title="No encontramos este avatar"
          description={profile.error}
          action={
            <Button className={styles.notFoundAction} onClick={() => router.push("/dashboard")}>
              Volver al dashboard
            </Button>
          }
        />
      </PageShell>
    );
  }

  if (profile.status === "error") {
    return (
      <PageShell maxWidth="760px">
        <ErrorState title="No pudimos cargar el perfil" description={profile.error} />
      </PageShell>
    );
  }

  const avatar = profile.avatar;

  if (!avatar) {
    return null;
  }

  return (
    <PageShell maxWidth="1120px">
      <div className={styles.profile}>
        <PageHeader
          eyebrow="Perfil del avatar"
          title={avatar.name}
          description={avatar.description || "Sin descripcion."}
          actions={
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => router.push(`/avatars/${avatar.id}/edit`)}>
                Editar
              </Button>
              <Button onClick={() => router.push(`/interact/${avatar.id}`)}>Interactuar</Button>
            </div>
          }
        />

        <Card padding="lg" className={styles.stack}>
          <div className={styles.headerMeta}>
            <Badge tone={getAvatarStatusTone(avatar.status)}>{formatAvatarStatus(avatar.status)}</Badge>
          </div>

          <Tabs
            defaultValue="info"
            items={[
              {
                value: "info",
                label: "Informacion",
                content: <AvatarInfoTab avatar={avatar} />,
              },
              {
                value: "share",
                label: "Compartir",
                content: <AvatarSharePlaceholder />,
              },
            ]}
          />
        </Card>
      </div>
    </PageShell>
  );
}
