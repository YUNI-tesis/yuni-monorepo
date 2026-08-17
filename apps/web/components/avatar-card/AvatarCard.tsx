"use client";

import React, { useState } from "react";
import { Button, Card, DropdownMenu, YuniIcon } from "@yuni/ui";
import { formatAvatarStatusLabel } from "../../lib/avatar-dashboard";
import type { ApiAvatarSummary, AvatarInteractionAvailability } from "../../lib/api/avatar-api";
import styles from "./AvatarCard.module.css";

export type AvatarCardVariant = "dashboard" | "catalog";

export type AvatarCardProps = {
  avatar: ApiAvatarSummary;
  variant: AvatarCardVariant;
  onNavigate: (href: string) => void;
};

const availabilityContent: Record<
  AvatarInteractionAvailability,
  { label: string; tone: "success" | "danger" | "warning" | "neutral" }
> = {
  ready: { label: "Listo para interactuar", tone: "success" },
  needs_attention: { label: "Revisar configuración", tone: "danger" },
  preparing: { label: "Preparándose", tone: "warning" },
  unavailable: { label: "No disponible", tone: "neutral" },
};

export function getAvatarCardRoutes(avatarId: string) {
  return {
    interact: `/interact/${avatarId}`,
    profile: `/avatars/${avatarId}`,
    edit: `/avatars/${avatarId}/edit`,
    share: `/avatars/${avatarId}?tab=compartir`,
  } as const;
}

export function AvatarCard({ avatar, variant, onNavigate }: AvatarCardProps) {
  const isOwner = avatar.access.type === "owner";
  const availability = availabilityContent[avatar.interactionAvailability];
  const routes = getAvatarCardRoutes(avatar.id);
  const Title = variant === "dashboard" ? "h3" : "h2";
  const primaryAction = getPrimaryAction(avatar, routes);
  const ownerMenuItems = isOwner
    ? [
        {
          label: "Ver perfil",
          icon: <YuniIcon name="view" />,
          onSelect: () => onNavigate(routes.profile),
        },
        ...(avatar.access.canEdit
          ? [
              {
                label: "Editar",
                icon: <YuniIcon name="edit" />,
                onSelect: () => onNavigate(routes.edit),
              },
            ]
          : []),
        ...(avatar.access.canShare
          ? [
              {
                label: "Compartir",
                icon: <YuniIcon name="share" />,
                onSelect: () => onNavigate(routes.share),
              },
            ]
          : []),
      ]
    : [];

  return (
    <Card
      as="article"
      padding="sm"
      className={styles.card}
      aria-labelledby={`avatar-card-title-${avatar.id}`}
    >
      <a
        className={styles.profileLink}
        href={routes.profile}
        aria-label={`Ver perfil de ${avatar.name}`}
        onClick={(event) => {
          event.preventDefault();
          onNavigate(routes.profile);
        }}
      />

      <div className={styles.media}>
        <AvatarArtwork name={avatar.name} thumbnailUrl={avatar.thumbnailUrl} />

        <span className={`${styles.status} ${styles[availability.tone]}`}>
          <span className={styles.statusDot} aria-hidden="true" />
          {availability.label}
        </span>

        <div className={styles.identity}>
          <Title id={`avatar-card-title-${avatar.id}`} className={styles.title}>
            {avatar.name}
          </Title>
          <p className={styles.description}>{avatar.description || "Sin descripción."}</p>

          {variant === "catalog" ? (
            <ul className={styles.metadata} aria-label="Detalles del avatar">
              <li>{isOwner ? "Propio" : "Compartido"}</li>
              <li>{formatAvatarStatusLabel(avatar.status)}</li>
            </ul>
          ) : null}
        </div>

        {ownerMenuItems.length > 0 ? (
          <div className={styles.menu}>
            <DropdownMenu
              compact
              label={`Más acciones para ${avatar.name}`}
              triggerContent={<YuniIcon name="moreVertical" size={20} />}
              items={ownerMenuItems}
            />
          </div>
        ) : null}
      </div>

      <div className={styles.footer}>
        {primaryAction ? (
          <Button
            className={styles.primaryAction}
            icon={<YuniIcon name={primaryAction.icon} />}
            onClick={() => onNavigate(primaryAction.href)}
          >
            {primaryAction.label}
          </Button>
        ) : (
          <p className={styles.notice}>{getUnavailableMessage(avatar)}</p>
        )}
      </div>
    </Card>
  );
}

function AvatarArtwork({ name, thumbnailUrl }: { name: string; thumbnailUrl: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(thumbnailUrl && failedUrl !== thumbnailUrl);

  return (
    <div
      className={`${styles.artwork} ${showImage ? "" : styles.fallback}`}
      role="img"
      aria-label={`Avatar de ${name}`}
    >
      {showImage && thumbnailUrl ? (
        <img
          className={styles.image}
          src={thumbnailUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailedUrl(thumbnailUrl)}
        />
      ) : (
        <span className={styles.monogram} aria-hidden="true">
          {getMonogram(name)}
        </span>
      )}
    </div>
  );
}

function getPrimaryAction(
  avatar: ApiAvatarSummary,
  routes: ReturnType<typeof getAvatarCardRoutes>
): { label: string; href: string; icon: "call" | "settings" } | null {
  if (
    avatar.access.type === "owner" &&
    avatar.interactionAvailability === "needs_attention" &&
    avatar.access.canEdit
  ) {
    return { label: "Revisar configuración", href: routes.edit, icon: "settings" };
  }

  if (avatar.interactionAvailability === "ready" && avatar.access.canInteract) {
    return { label: "Interactuar", href: routes.interact, icon: "call" };
  }

  return null;
}

function getUnavailableMessage(avatar: ApiAvatarSummary) {
  if (avatar.access.type === "shared" && avatar.interactionAvailability === "preparing") {
    return "Lo estamos preparando. Vas a poder interactuar pronto.";
  }

  if (avatar.access.type === "shared") {
    return "Este avatar compartido no está disponible para interactuar.";
  }

  return "Este avatar no está disponible para interactuar.";
}

function getMonogram(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toLocaleUpperCase())
    .join("");

  return initials || "A";
}
