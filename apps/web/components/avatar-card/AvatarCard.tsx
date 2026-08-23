"use client";

import React from "react";
import { YuniIcon } from "@yuni/ui";
import { formatAvatarStatusLabel } from "../../lib/avatar-dashboard";
import type { ApiAvatarSummary, AvatarInteractionAvailability } from "../../lib/api/avatar-api";
import { CatalogCard, type CatalogCardStatusTone } from "../catalog/CatalogCard";

export type AvatarCardVariant = "dashboard" | "catalog";

export type AvatarCardProps = {
  avatar: ApiAvatarSummary;
  variant: AvatarCardVariant;
  onNavigate: (href: string) => void;
};

const availabilityContent: Record<
  AvatarInteractionAvailability,
  { label: string; tone: CatalogCardStatusTone }
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
    <CatalogCard
      id={avatar.id}
      title={avatar.name}
      description={avatar.description || "Sin descripción."}
      href={routes.profile}
      hrefLabel={`Ver perfil de ${avatar.name}`}
      headingLevel={variant === "dashboard" ? "h3" : "h2"}
      artwork={{ kind: "avatar", name: avatar.name, thumbnailUrl: avatar.thumbnailUrl }}
      status={availability}
      metadata={
        variant === "catalog"
          ? [isOwner ? "Propio" : "Compartido", formatAvatarStatusLabel(avatar.status)]
          : []
      }
      {...(ownerMenuItems.length > 0 ? { menuLabel: `Más acciones para ${avatar.name}` } : {})}
      menuItems={ownerMenuItems}
      {...(primaryAction
        ? {
            primaryAction: {
              ...primaryAction,
              onSelect: () => onNavigate(primaryAction.href),
            },
          }
        : {})}
      notice={getUnavailableMessage(avatar)}
      onNavigate={onNavigate}
    />
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
