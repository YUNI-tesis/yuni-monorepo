import type { ApiDashboardOrigin, ApiDashboardSimpleRate } from "../../../lib/api/dashboard-api";
import { formatDashboardRate } from "../../../lib/creator-dashboard";

export function originLabel(origin: ApiDashboardOrigin) {
  if (origin === "all") return "Total";
  return origin === "access_grant" ? "Acceso directo" : "Link público";
}

export function formatSimpleRate(metric: ApiDashboardSimpleRate) {
  const ratio = `${metric.value}/${metric.total}`;
  return metric.rate === null ? `${ratio} · sin datos` : `${ratio} · ${formatDashboardRate(metric.rate)}`;
}
