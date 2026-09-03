import React from "react";
import { Button, PageHeader, YuniIcon } from "@yuni/ui";
import {
  DASHBOARD_PERIODS,
  type ApiCreatorDashboardSummary,
  type ApiDashboardDays,
} from "../../../lib/api/dashboard-api";
import { formatDashboardPeriod } from "../../../lib/creator-dashboard";
import styles from "../Dashboard.module.css";

export function DashboardHeader({
  summary,
  selectedDays,
  onDaysChange,
  onNavigate,
}: {
  summary: ApiCreatorDashboardSummary;
  selectedDays: ApiDashboardDays;
  onDaysChange: (days: ApiDashboardDays) => void;
  onNavigate: (path: string) => void;
}) {
  const eyebrow = `Actividad · ${formatDashboardPeriod(
    summary.period.from,
    summary.period.to,
    summary.period.timeZone
  )}`;
  const includesGroups = summary.groups !== undefined;
  const description = includesGroups
    ? "Quién participa, cuánto usa tus avatares y grupos, quién vuelve y qué requiere una acción."
    : "Quién participa, cuánto usa tus avatares, quién vuelve y qué requiere una acción.";

  return (
    <div className={styles.headerStack}>
      <div className={styles.desktopHeader}>
        <PageHeader
          eyebrow={eyebrow}
          title={includesGroups ? "Cómo están usando tus recursos" : "Cómo están usando tus avatares"}
          description={description}
          actions={
            <div className={styles.actions}>
              <Button icon={<YuniIcon name="add" />} onClick={() => onNavigate("/avatars/new")}>
                Crear avatar
              </Button>
              <Button variant="secondary" onClick={() => onNavigate("/avatars")}>
                Mis avatares
              </Button>
              {includesGroups ? (
                <Button variant="secondary" onClick={() => onNavigate("/groups")}>
                  Mis grupos
                </Button>
              ) : null}
            </div>
          }
        />
      </div>
      <div className={styles.mobileHeader}>
        <PageHeader eyebrow={eyebrow} title="Dashboard" description={description} />
      </div>
      <div className={styles.periodRow}>
        <span>Período</span>
        <div className={styles.periodSelector} role="group" aria-label="Seleccionar período del dashboard">
          {DASHBOARD_PERIODS.map((days) => (
            <button
              key={days}
              type="button"
              aria-pressed={selectedDays === days}
              className={selectedDays === days ? styles.periodActive : undefined}
              onClick={() => onDaysChange(days)}
            >
              {days} días
            </button>
          ))}
        </div>
        <small>Zona horaria: {summary.period.timeZone}</small>
      </div>
    </div>
  );
}
