"use client";

import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, MetricCard, PageHeader } from "@yuni/ui";
import { useAvatarList } from "../../hooks/useAvatarList";
import {
  formatAvatarStatusLabel,
  formatProviderSyncLabel,
  getAvatarDashboardSummary,
  getRecentAvatars,
} from "../../lib/avatar-dashboard";
import type { ApiAvatar } from "../../lib/api/avatar-api";
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
        description="Administra avatares privados y entra a Interact desde un solo lugar."
        actions={
          <div className={styles.actions}>
            <Button onClick={() => router.push("/avatars/new")}>Crear avatar</Button>
            <Button variant="secondary" onClick={() => router.push("/avatars")}>
              Ver avatares
            </Button>
            <Button variant="secondary" onClick={() => router.push("/interact")}>
              Ir a Interact
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
            <MetricCard label="Sync pendiente" value={String(summary.needsSync)} delta="Revisar" tone="warning" />
            <MetricCard label="Sync con error" value={String(summary.failedSync)} delta="Atencion" tone="danger" />
          </section>

          {avatarList.avatars.length === 0 ? (
            <Card padding="lg">
              <EmptyState
                title="Crea tu primer avatar"
                description="Despues vas a poder verlo en Avatares y abrir una llamada privada desde Interact."
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

function RecentAvatarCard({ avatar }: { avatar: ApiAvatar }) {
  const router = useRouter();

  return (
    <Card className={styles.avatarCard} padding="md">
      <div className={styles.avatarMeta}>
        <div className={styles.badges}>
          <Badge tone={avatar.status === "active" ? "success" : "neutral"}>{formatAvatarStatusLabel(avatar.status)}</Badge>
          <Badge tone={avatar.providerSyncStatus === "failed" ? "danger" : avatar.providerSyncStatus === "synced" ? "success" : "warning"}>
            {formatProviderSyncLabel(avatar.providerSyncStatus)}
          </Badge>
        </div>
        <h2 className={styles.avatarTitle}>{avatar.name}</h2>
        <p className="yuni-text-muted">{avatar.description || "Sin descripcion."}</p>
      </div>

      <div className={styles.cardActions}>
        <Button variant="secondary" onClick={() => router.push(`/avatars/${avatar.id}`)}>
          Perfil
        </Button>
        <Button onClick={() => router.push(`/interact/${avatar.id}`)}>Interactuar</Button>
      </div>
    </Card>
  );
}
