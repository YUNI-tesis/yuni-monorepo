import type {
  ApiDashboardAttentionItem,
  ApiDashboardCountMetric,
  ApiDashboardGroupResource,
  ApiDashboardRateMetric,
  ApiDashboardResource,
} from "./api/dashboard-api";

export function formatDashboardCountDelta(metric: ApiDashboardCountMetric) {
  if (metric.changePercent === null) return "Sin base anterior";
  if (metric.changePercent === 0) return "Sin cambios";
  return `${metric.changePercent > 0 ? "+" : ""}${formatNumber(metric.changePercent)}% vs. período anterior`;
}

export function formatDashboardRateDelta(metric: ApiDashboardRateMetric) {
  const ratio = `${metric.value} de ${metric.total}`;
  const current = metric.rate === null ? `${ratio} · sin datos suficientes` : ratio;
  if (metric.previousRate === null) return `${current} · sin base anterior`;
  if (metric.rate === null) return current;
  if (metric.changePercentagePoints === null) return `${ratio} · sin comparación`;
  if (metric.changePercentagePoints === 0) return `${ratio} · sin cambios`;
  return `${ratio} · ${metric.changePercentagePoints > 0 ? "+" : ""}${formatNumber(metric.changePercentagePoints)} pp`;
}

export function formatDashboardRate(value: number | null) {
  return value === null ? "—" : `${formatNumber(value)}%`;
}

export function formatDashboardDuration(seconds: number | null) {
  if (seconds === null) return "—";
  const roundedSeconds = Math.round(seconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const remainder = roundedSeconds % 60;
  return minutes === 0 ? `${remainder} s` : `${minutes} min ${String(remainder).padStart(2, "0")} s`;
}

export function formatDashboardDate(value: string | null) {
  if (!value) return "Sin actividad";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDashboardPeriod(from: string, to: string, timeZone = "UTC") {
  const inclusiveTo = new Date(new Date(to).getTime() - 1);
  const formatter = new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    timeZone,
  });
  return `${formatter.format(new Date(from))}–${formatter.format(inclusiveTo)}`;
}

export function getDashboardAttentionPath(item: ApiDashboardAttentionItem) {
  if (isDashboardGroupResource(item)) {
    const groupId = getDashboardResourceId(item);
    if (item.type === "unavailable_group" || item.type === "unused_direct_access") {
      return `/groups/${encodeURIComponent(groupId)}/share`;
    }
    if (!item.participantKey) {
      return `/groups/${encodeURIComponent(groupId)}/activity`;
    }
    const participantPath = `/groups/${encodeURIComponent(groupId)}/activity/${encodeURIComponent(item.participantKey)}`;
    return item.conversationId
      ? `${participantPath}?conversation=${encodeURIComponent(item.conversationId)}`
      : participantPath;
  }
  if (item.type === "unavailable_avatar") {
    return `/avatars/${encodeURIComponent(item.avatarId)}/edit`;
  }
  if (item.type === "unused_direct_access") {
    return `/avatars/${encodeURIComponent(item.avatarId)}?tab=compartir`;
  }
  if (!item.participantKey) {
    return `/avatars/${encodeURIComponent(item.avatarId)}?tab=activity`;
  }
  const participantPath = `/avatars/${encodeURIComponent(item.avatarId)}/activity/${encodeURIComponent(item.participantKey)}`;
  return item.conversationId
    ? `${participantPath}?conversation=${encodeURIComponent(item.conversationId)}`
    : participantPath;
}

export function getDashboardTranscriptPath(avatarId: string, participantKey: string, conversationId: string) {
  return `/avatars/${encodeURIComponent(avatarId)}/activity/${encodeURIComponent(participantKey)}?conversation=${encodeURIComponent(conversationId)}`;
}

export function getDashboardResourceTranscriptPath(
  resource: ApiDashboardResource,
  participantKey: string,
  conversationId: string
) {
  if (isDashboardGroupResource(resource)) {
    return `/groups/${encodeURIComponent(getDashboardResourceId(resource))}/activity/${encodeURIComponent(participantKey)}?conversation=${encodeURIComponent(conversationId)}`;
  }
  return getDashboardTranscriptPath(resource.avatarId, participantKey, conversationId);
}

export function getDashboardResourceName(resource: ApiDashboardResource) {
  return (
    resource.resource?.name ?? (isDashboardGroupResource(resource) ? resource.groupName : resource.avatarName)
  );
}

export function getDashboardResourceId(resource: ApiDashboardResource) {
  return resource.resource?.id ?? (isDashboardGroupResource(resource) ? resource.groupId : resource.avatarId);
}

export function isDashboardGroupResource(
  resource: ApiDashboardResource
): resource is ApiDashboardGroupResource {
  return resource.resource?.type === "group" || resource.resourceKind === "group";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(value);
}
