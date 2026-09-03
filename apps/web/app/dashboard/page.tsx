"use client";

import React, { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, Card, EmptyState, ErrorState, LoadingState, MetricCard } from "@yuni/ui";
import { useCreatorDashboard } from "../../hooks/useCreatorDashboard";
import type { ApiCreatorDashboardSummary, ApiDashboardDays } from "../../lib/api/dashboard-api";
import { DASHBOARD_PERIODS } from "../../lib/api/dashboard-api";
import {
  formatDashboardCountDelta,
  formatDashboardRate,
  formatDashboardRateDelta,
} from "../../lib/creator-dashboard";
import { ActivityTrend } from "./components/ActivityTrend";
import { AttentionPanel } from "./components/AttentionPanel";
import { AvatarPerformance } from "./components/AvatarPerformance";
import { DashboardHeader } from "./components/DashboardHeader";
import { GroupPerformance } from "./components/GroupPerformance";
import { InteractionCharacteristics } from "./components/InteractionCharacteristics";
import { Methodology } from "./components/Methodology";
import { OriginBreakdown } from "./components/OriginBreakdown";
import { RecentActivity } from "./components/RecentActivity";
import styles from "./Dashboard.module.css";

export default function DashboardPage() {
  return (
    <Suspense
      fallback={<LoadingState title="Cargando actividad" description="Estamos preparando tus métricas." />}
    >
      <DashboardPageContent />
    </Suspense>
  );
}

function DashboardPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedDays = parseDays(searchParams.get("days"));
  const dashboard = useCreatorDashboard(selectedDays);

  function changeDays(days: ApiDashboardDays) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("days", String(days));
    router.replace(`${pathname}?${next}`, { scroll: false });
  }

  if (dashboard.status === "loading") {
    return <LoadingState title="Cargando actividad" description="Estamos preparando tus métricas." />;
  }

  if (dashboard.status === "error") {
    return (
      <ErrorState
        title="No pudimos cargar el dashboard"
        description={dashboard.error}
        action={<Button onClick={dashboard.reload}>Reintentar</Button>}
      />
    );
  }

  return (
    <CreatorDashboardContent
      summary={dashboard.data}
      selectedDays={selectedDays}
      onDaysChange={changeDays}
      onNavigate={(path) => router.push(path)}
    />
  );
}

export function CreatorDashboardContent({
  summary,
  selectedDays = summary.period.days,
  onDaysChange = () => undefined,
  onNavigate,
}: {
  summary: ApiCreatorDashboardSummary;
  selectedDays?: ApiDashboardDays;
  onDaysChange?: (days: ApiDashboardDays) => void;
  onNavigate: (path: string) => void;
}) {
  if (!(summary.hasOwnedResources ?? summary.hasOwnedAvatars)) {
    return (
      <div className={styles.layout}>
        <DashboardHeader
          summary={summary}
          selectedDays={selectedDays}
          onDaysChange={onDaysChange}
          onNavigate={onNavigate}
        />
        <Card padding="lg">
          <EmptyState
            title="Creá tu primer avatar"
            description="Cuando lo compartas, vas a poder seguir participantes, conversaciones y actividad desde este espacio."
            action={<Button onClick={() => onNavigate("/avatars/new")}>Crear avatar</Button>}
          />
        </Card>
      </div>
    );
  }

  const { overview } = summary;
  return (
    <div className={styles.layout}>
      <DashboardHeader
        summary={summary}
        selectedDays={selectedDays}
        onDaysChange={onDaysChange}
        onNavigate={onNavigate}
      />

      <section className={styles.metrics} aria-label={`Resultados de los últimos ${selectedDays} días`}>
        <MetricCard
          label="Participantes activos"
          value={String(overview.activeParticipants.value)}
          delta={formatDashboardCountDelta(overview.activeParticipants)}
          tone="neutral"
        />
        <MetricCard
          label="Conversaciones con actividad"
          value={String(overview.engagedConversations.value)}
          delta={formatDashboardCountDelta(overview.engagedConversations)}
          tone="neutral"
        />
        <MetricCard
          label="Participantes que volvieron"
          value={formatDashboardRate(overview.returningParticipants.rate)}
          delta={formatDashboardRateDelta(overview.returningParticipants)}
          tone="neutral"
        />
        <MetricCard
          label="Accesos activados en 7 días"
          value={formatDashboardRate(overview.directAccessActivation.rate)}
          delta={formatDashboardRateDelta(overview.directAccessActivation)}
          tone="neutral"
        />
      </section>

      <AttentionPanel summary={summary} onNavigate={onNavigate} />
      <OriginBreakdown summary={summary} />
      <div className={styles.analysisGrid}>
        <ActivityTrend summary={summary} />
        <InteractionCharacteristics summary={summary} />
      </div>
      <AvatarPerformance summary={summary} onNavigate={onNavigate} />
      <GroupPerformance summary={summary} onNavigate={onNavigate} />
      <RecentActivity summary={summary} onNavigate={onNavigate} />
      <Methodology summary={summary} />
    </div>
  );
}

function parseDays(value: string | null): ApiDashboardDays {
  const parsed = Number(value);
  return DASHBOARD_PERIODS.includes(parsed as ApiDashboardDays) ? (parsed as ApiDashboardDays) : 30;
}
