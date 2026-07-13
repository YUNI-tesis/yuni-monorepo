import type { ApiAvatar } from "./api/avatar-api";

export type AvatarDashboardSummary = {
  total: number;
  active: number;
  needsSync: number;
  failedSync: number;
};

export type AvatarListFilter = "all" | "owned" | "shared";

export const avatarListFilters: { id: AvatarListFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "owned", label: "Propios" },
  { id: "shared", label: "Compartidos conmigo" },
];

export function getAvatarDashboardSummary(avatars: ApiAvatar[]): AvatarDashboardSummary {
  return avatars.reduce<AvatarDashboardSummary>(
    (summary, avatar) => ({
      total: summary.total + 1,
      active: summary.active + (avatar.status === "active" ? 1 : 0),
      needsSync: summary.needsSync + (avatar.providerSyncStatus === "not_synced" ? 1 : 0),
      failedSync: summary.failedSync + (avatar.providerSyncStatus === "failed" ? 1 : 0),
    }),
    { total: 0, active: 0, needsSync: 0, failedSync: 0 }
  );
}

export function getRecentAvatars(avatars: ApiAvatar[], limit = 3) {
  return [...avatars]
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, limit);
}

export function filterAvatarsByOwnership(avatars: ApiAvatar[], filter: AvatarListFilter) {
  if (filter === "shared") {
    return [];
  }

  return avatars;
}

export function formatAvatarStatusLabel(status: ApiAvatar["status"]) {
  if (status === "active") return "Activo";
  if (status === "draft") return "Borrador";
  return "Desactivado";
}

export function formatProviderSyncLabel(status: ApiAvatar["providerSyncStatus"]) {
  if (status === "synced") return "Sincronizado";
  if (status === "failed") return "Requiere revision";
  return "Pendiente";
}
