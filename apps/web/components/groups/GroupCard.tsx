"use client";

import React from "react";
import { YuniIcon } from "@yuni/ui";
import type { ApiAvatarGroup } from "../../lib/api/avatar-group-api";
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

  return (
    <CatalogCard
      id={group.id}
      title={group.name}
      description={participantNames}
      href={href}
      hrefLabel={`Abrir llamada con ${group.name}`}
      headingLevel="h2"
      artwork={{
        kind: "group",
        name: group.name,
        members: group.members.map(({ id, name, thumbnailUrl }) => ({ id, name, thumbnailUrl })),
      }}
      status={{ label: "Listo para interactuar", tone: "success" }}
      metadata={[
        `${group.members.length} participantes`,
        group.members.some((member) => member.accessType === "shared") ? "Incluye compartidos" : "Propio",
      ]}
      menuLabel={`Más acciones para ${group.name}`}
      menuItems={[
        { label: "Editar", icon: <YuniIcon name="edit" />, onSelect: onEdit },
        { label: "Eliminar", icon: <YuniIcon name="close" />, tone: "danger", onSelect: onDelete },
      ]}
      primaryAction={{ label: "Interactuar", icon: "call", onSelect: () => onNavigate(href) }}
      onNavigate={onNavigate}
    />
  );
}
