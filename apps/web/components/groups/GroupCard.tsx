"use client";

import React from "react";
import { YuniIcon } from "@yuni/ui";
import type { ApiAvatarGroup } from "../../lib/api/avatar-group-api";
import { formatInteractionLimitsSummary } from "../../lib/avatar-sharing";
import { CatalogCard } from "../catalog/CatalogCard";

export function GroupCard({
  group,
  onNavigate,
  onEdit,
  onDelete,
}: {
  group: ApiAvatarGroup;
  onNavigate: (href: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const href = `/groups/${group.id}`;
  const participantNames = group.members.map((member) => member.name).join(" · ");
  const interaction = getInteractionPresentation(group);
  const isOwner = group.access.type === "owner";
  const menuItems = isOwner
    ? [
        ...(group.access.canEdit
          ? [{ label: "Editar", icon: <YuniIcon name="edit" />, onSelect: onEdit }]
          : []),
        {
          label: "Compartir",
          icon: <YuniIcon name="share" />,
          disabled: !group.access.canShare,
          onSelect: () => onNavigate(`/groups/${group.id}/share`),
        },
        ...(group.activityEnabled
          ? [
              {
                label: "Ver actividad",
                icon: <YuniIcon name="history" />,
                onSelect: () => onNavigate(`/groups/${group.id}/activity`),
              },
            ]
          : []),
        ...(group.access.canDelete
          ? [
              {
                label: "Eliminar",
                icon: <YuniIcon name="close" />,
                tone: "danger" as const,
                onSelect: onDelete,
              },
            ]
          : []),
      ]
    : [];
  const accessLabel = isOwner
    ? group.members.some((member) => member.viewerAccess !== "owned")
      ? "Incluye compartidos"
      : "Propio"
    : group.access.sharedBy?.name
      ? `Compartido por ${group.access.sharedBy.name}`
      : "Compartido conmigo";
  const limitsLabel =
    !isOwner && group.access.limits ? formatInteractionLimitsSummary(group.access.limits) : null;
  const sharingEligibilityLabel =
    isOwner && group.sharingEligibility.status === "blocked"
      ? "Solo se pueden compartir grupos formados por avatares propios"
      : null;

  return (
    <CatalogCard
      id={group.id}
      title={group.name}
      description={participantNames}
      href={group.access.canInteract ? href : null}
      hrefLabel={`Abrir llamada con ${group.name}`}
      headingLevel="h2"
      artwork={{
        kind: "group",
        name: group.name,
        members: group.members.map(({ id, name, thumbnailUrl }) => ({ id, name, thumbnailUrl })),
      }}
      status={interaction}
      metadata={[
        `${group.members.length} participantes`,
        accessLabel,
        ...(limitsLabel ? [limitsLabel] : []),
        ...(sharingEligibilityLabel ? [sharingEligibilityLabel] : []),
      ]}
      menuLabel={`Más acciones para ${group.name}`}
      menuItems={menuItems}
      {...(group.access.canInteract && group.interactionAvailability.status === "ready"
        ? { primaryAction: { label: "Interactuar", icon: "call" as const, onSelect: () => onNavigate(href) } }
        : {})}
      notice={
        <span>
          {group.interactionAvailability.status === "unavailable"
            ? "El grupo estará disponible cuando todos sus integrantes estén listos."
            : "Tu acceso no permite iniciar una llamada en este momento."}
        </span>
      }
      onNavigate={onNavigate}
    />
  );
}

function getInteractionPresentation(group: ApiAvatarGroup) {
  if (group.interactionAvailability.status === "ready") {
    return group.access.canInteract
      ? { label: "Listo para interactuar", tone: "success" as const }
      : { label: "Acceso no disponible", tone: "neutral" as const };
  }
  const labels = {
    preparing: "Preparando avatares",
    inactive_member: "Integrante inactivo",
    provider_error: "Servicio no disponible",
    invalid_roster: "Grupo incompleto",
  } as const;
  return {
    label: labels[group.interactionAvailability.reason],
    tone: group.interactionAvailability.reason === "preparing" ? ("warning" as const) : ("danger" as const),
  };
}
