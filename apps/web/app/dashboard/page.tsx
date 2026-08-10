"use client";

import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, MetricCard, PageHeader } from "@yuni/ui";
import { useAvatarList } from "../../hooks/useAvatarList";
import {
  formatAvatarStatusLabel,
  formatProviderSyncLabel,
  getAvatarCardActionMode,
  getAvatarDashboardSummary,
  getRecentAvatars,
} from "../../lib/avatar-dashboard";
import type { ApiAvatarSummary } from "../../lib/api/avatar-api";
import styles from "./Dashboard.module.css";

export default function DashboardPage() {
  const router = useRouter();
  const avatarList = useAvatarList();
  const summary = getAvatarDashboardSummary(avatarList.avatars);
  const recentAvatars = getRecentAvatars(avatarList.avatars, 3);

  return (
    <div className={styles.layout}>
      <PageHeader
        eyebrow="Dashboard"
        title="YUNI"
        description="Administra tus avatares privados y revisa el estado operativo de tu espacio."
        actions={
          <div className={styles.actions}>
            <Button onClick={() => router.push("/avatars/new")}>Crear avatar</Button>
            <Button variant="secondary" onClick={() => router.push("/avatars")}>
              Mis avatares
            </Button>
          </div>
        }
      />

      {avatarList.status === "loading" ? (
        <LoadingState title="Cargando dashboard" description="Estamos preparando tus avatares." />
      ) : avatarList.status === "error" ? (
        <ErrorState title="No pudimos cargar el dashboard" description={avatarList.error} />
      ) : (
        <>
          <section className={styles.metrics} aria-label="Resumen de avatares">
            <MetricCard label="Avatares" value={String(summary.total)} delta="Total" />
            <MetricCard label="Activos" value={String(summary.active)} delta="Listos" tone="success" />
            <MetricCard
              label="Procesando"
              value={String(summary.needsSync)}
              delta="Pendiente"
              tone="warning"
            />
            <MetricCard
              label="Requiere revision"
              value={String(summary.failedSync)}
              delta="Atencion"
              tone="danger"
            />
          </section>

          {avatarList.avatars.length === 0 ? (
            <Card padding="lg">
              <EmptyState
                title="Crea tu primer avatar"
                description="Despues vas a poder verlo en Mis avatares y abrir una llamada desde su perfil."
                action={<Button onClick={() => router.push("/avatars/new")}>Crear avatar</Button>}
              />
            </Card>
          ) : (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <p className="yuni-eyebrow">Actividad reciente</p>
                  <h2 className={styles.sectionTitle}>Avatares actualizados</h2>
                </div>
                <Button variant="secondary" onClick={() => router.push("/avatars")}>
                  Ver todos
                </Button>
              </div>

              <div className={styles.recentGrid}>
                {recentAvatars.map((avatar) => (
                  <RecentAvatarCard key={avatar.id} avatar={avatar} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function RecentAvatarCard({ avatar }: { avatar: ApiAvatarSummary }) {
  const router = useRouter();
  const isOwner = getAvatarCardActionMode(avatar.access.type) === "owner-actions";

  return (
    <Card className={styles.avatarCard} padding="md">
      <div className={styles.avatarMeta}>
        <div className={styles.badges}>
          <Badge tone={isOwner ? "neutral" : "warning"}>{isOwner ? "Propio" : "Compartido"}</Badge>
          <Badge tone={avatar.status === "active" ? "success" : "neutral"}>
            {formatAvatarStatusLabel(avatar.status)}
          </Badge>
          <Badge
            tone={
              avatar.providerSyncStatus === "failed"
                ? "danger"
                : avatar.providerSyncStatus === "synced"
                  ? "success"
                  : "warning"
            }
          >
            {formatProviderSyncLabel(avatar.providerSyncStatus)}
          </Badge>
        </div>
        <h2 className={styles.avatarTitle}>{avatar.name}</h2>
        <p className={`yuni-text-muted ${styles.avatarDescription}`}>
          {avatar.description || "Sin descripcion."}
        </p>
      </div>

      {isOwner ? (
        <div className={styles.cardActions}>
          <Button variant="secondary" onClick={() => router.push(`/avatars/${avatar.id}`)}>
            Perfil
          </Button>
          <Button onClick={() => router.push(`/interact/${avatar.id}`)}>Interactuar</Button>
        </div>
      ) : avatar.access.canInteract ? (
        <div className={styles.cardActions}>
          <Button onClick={() => router.push(`/interact/${avatar.id}`)}>Interactuar</Button>
        </div>
      ) : (
        <p className={styles.sharedNotice}>Este avatar compartido no está disponible para interactuar.</p>
      )}
    </Card>
  );
}
