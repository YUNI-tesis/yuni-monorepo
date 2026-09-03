"use client";

import { useRouter } from "next/navigation";
import React, { useRef, useState } from "react";
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  YuniIcon,
  useToast,
} from "@yuni/ui";
import { invalidateAvatarListCache, useAvatarList } from "../../hooks/useAvatarList";
import { deleteAvatar, type ApiAvatarSummary } from "../../lib/api/avatar-api";
import {
  avatarListFilters,
  filterAvatarsByOwnership,
  getRecentAvatars,
  type AvatarListFilter,
} from "../../lib/avatar-dashboard";
import { AvatarCard } from "../avatar-card/AvatarCard";
import catalogStyles from "../catalog/CatalogGrid.module.css";
import styles from "./AvatarList.module.css";

export function AvatarListView() {
  const router = useRouter();
  const toast = useToast();
  const avatarList = useAvatarList();
  const deletionDialog = useRef<HTMLDialogElement>(null);
  const [activeFilter, setActiveFilter] = useState<AvatarListFilter>("all");
  const [avatarPendingDeletion, setAvatarPendingDeletion] = useState<ApiAvatarSummary | null>(null);
  const [deletedAvatarIds, setDeletedAvatarIds] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const availableAvatars = avatarList.avatars.filter((avatar) => !deletedAvatarIds.has(avatar.id));
  const visibleAvatars = filterAvatarsByOwnership(availableAvatars, activeFilter);
  const sortedAvatars = getRecentAvatars(visibleAvatars, visibleAvatars.length);
  const isSharedFilter = activeFilter === "shared";

  function requestAvatarDeletion(avatar: ApiAvatarSummary) {
    setAvatarPendingDeletion(avatar);
    deletionDialog.current?.showModal();
  }

  async function confirmAvatarDeletion() {
    if (!avatarPendingDeletion || deleting) return;
    const avatar = avatarPendingDeletion;
    setDeleting(true);

    try {
      await deleteAvatar(avatar.id);
      setDeletedAvatarIds((current) => new Set(current).add(avatar.id));
      invalidateAvatarListCache();
      deletionDialog.current?.close();
      setAvatarPendingDeletion(null);
      toast.success(`${avatar.name} fue eliminado.`, {
        title: "Avatar eliminado",
        dedupeKey: `avatar:${avatar.id}:deleted`,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Intentá nuevamente.", {
        title: "No pudimos eliminar el avatar",
        dedupeKey: `avatar:${avatar.id}:delete:error`,
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={catalogStyles.layout}>
      <div className={styles.mobileHeader}>
        <PageHeader
          eyebrow="Mis avatares"
          title="Mis avatares"
          description="Administra tus avatares propios y encontrá acá los que otros usuarios te compartan."
          actions={
            <Button icon={<YuniIcon name="add" />} onClick={() => router.push("/avatars/new")}>
              Crear avatar
            </Button>
          }
        />
      </div>

      <AvatarListFilterControls activeFilter={activeFilter} onFilterChange={setActiveFilter} />

      {avatarList.status === "loading" ? (
        <LoadingState title="Cargando avatares" description="Estamos preparando tu lista." />
      ) : avatarList.status === "error" ? (
        <ErrorState title="No pudimos cargar Mis avatares" description={avatarList.error} />
      ) : sortedAvatars.length === 0 ? (
        <Card padding="lg" className={catalogStyles.emptyCard}>
          {isSharedFilter ? (
            <EmptyState
              title="No tenes avatares compartidos"
              description="Cuando alguien te comparta un avatar, va a aparecer en esta vista."
            />
          ) : (
            <EmptyState
              title="Todavia no tenes avatares"
              description="Crea tu primer avatar para probar perfiles privados y llamadas contextuales."
              action={<Button onClick={() => router.push("/avatars/new")}>Crear avatar</Button>}
            />
          )}
        </Card>
      ) : (
        <div className={`${catalogStyles.grid} ${styles.avatarGrid}`}>
          {sortedAvatars.map((avatar) => (
            <AvatarCard
              key={avatar.id}
              avatar={avatar}
              variant="catalog"
              onNavigate={(href) => router.push(href)}
              {...(avatar.access.type === "owner" ? { onDelete: () => requestAvatarDeletion(avatar) } : {})}
            />
          ))}
        </div>
      )}

      <Dialog
        ref={deletionDialog}
        title="Eliminar avatar"
        description={
          avatarPendingDeletion
            ? `El avatar “${avatarPendingDeletion.name}” se eliminará definitivamente y se quitará de los grupos y accesos compartidos. Los grupos o llamadas que ya no tengan suficientes integrantes dejarán de estar disponibles. El historial guardado se conservará.`
            : ""
        }
        closeLabel="Cancelar"
        footer={
          <Button variant="danger" loading={deleting} onClick={() => void confirmAvatarDeletion()}>
            Eliminar
          </Button>
        }
        onClose={() => setAvatarPendingDeletion(null)}
      />
    </div>
  );
}

export function AvatarListFilterControls({
  activeFilter,
  onFilterChange,
}: {
  activeFilter: AvatarListFilter;
  onFilterChange: (filter: AvatarListFilter) => void;
}) {
  return (
    <div className={styles.filterBar} role="group" aria-label="Filtrar avatares">
      {avatarListFilters.map((filter) => {
        const isActive = filter.id === activeFilter;

        return (
          <button
            key={filter.id}
            className={`${styles.filterButton} ${isActive ? styles.filterButtonActive : ""}`}
            type="button"
            aria-pressed={isActive}
            onClick={() => onFilterChange(filter.id)}
          >
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}
