"use client";

import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from "@yuni/ui";
import { useAvatarList } from "../../hooks/useAvatarList";
import {
  avatarListFilters,
  filterAvatarsByOwnership,
  getRecentAvatars,
  type AvatarListFilter,
} from "../../lib/avatar-dashboard";
import { AvatarCard } from "../avatar-card/AvatarCard";
import styles from "./AvatarList.module.css";

export function AvatarListView() {
  const router = useRouter();
  const avatarList = useAvatarList();
  const [activeFilter, setActiveFilter] = useState<AvatarListFilter>("all");
  const visibleAvatars = filterAvatarsByOwnership(avatarList.avatars, activeFilter);
  const sortedAvatars = getRecentAvatars(visibleAvatars, visibleAvatars.length);
  const isSharedFilter = activeFilter === "shared";

  return (
    <div className={styles.layout}>
      <PageHeader
        eyebrow="Mis avatares"
        title="Mis avatares"
        description="Administra tus avatares propios y encontrá acá los que otros usuarios te compartan."
        actions={<Button onClick={() => router.push("/avatars/new")}>Crear avatar</Button>}
      />

      <AvatarListFilterControls activeFilter={activeFilter} onFilterChange={setActiveFilter} />

      {avatarList.status === "loading" ? (
        <LoadingState title="Cargando avatares" description="Estamos preparando tu lista." />
      ) : avatarList.status === "error" ? (
        <ErrorState title="No pudimos cargar Mis avatares" description={avatarList.error} />
      ) : sortedAvatars.length === 0 ? (
        <Card padding="lg" className={styles.emptyCard}>
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
        <div className={styles.grid}>
          {sortedAvatars.map((avatar) => (
            <AvatarCard
              key={avatar.id}
              avatar={avatar}
              variant="catalog"
              onNavigate={(href) => router.push(href)}
            />
          ))}
        </div>
      )}
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
