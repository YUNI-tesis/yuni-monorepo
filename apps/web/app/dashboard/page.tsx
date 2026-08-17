"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  DataList,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  PageHeader,
  YuniIcon,
  type BadgeTone,
} from "@yuni/ui";
import { useCreatorDashboard } from "../../hooks/useCreatorDashboard";
import type {
  ApiCreatorDashboardSummary,
  ApiDashboardAttentionGroup,
  ApiDashboardAttentionItem,
} from "../../lib/api/dashboard-api";
import {
  formatDashboardCountDelta,
  formatDashboardDate,
  formatDashboardDuration,
  formatDashboardPeriod,
  formatDashboardRate,
  formatDashboardRateDelta,
  getDashboardAttentionPath,
  getDashboardTranscriptPath,
} from "../../lib/creator-dashboard";
import styles from "./Dashboard.module.css";

export default function DashboardPage() {
  const router = useRouter();
  const dashboard = useCreatorDashboard();

  if (dashboard.status === "loading") {
    return <LoadingState title="Cargando actividad" description="Estamos preparando tus métricas." />;
  }

  if (dashboard.status === "error") {
    return (
      <ErrorState
        title="No pudimos cargar el dashboard"
        description={dashboard.error}
        action={<Button onClick={() => void dashboard.reload()}>Reintentar</Button>}
      />
    );
  }

  if (!dashboard.data) return null;

  return <CreatorDashboardContent summary={dashboard.data} onNavigate={(path) => router.push(path)} />;
}

export function CreatorDashboardContent({
  summary,
  onNavigate,
}: {
  summary: ApiCreatorDashboardSummary;
  onNavigate: (path: string) => void;
}) {
  if (!summary.hasOwnedAvatars) {
    return (
      <div className={styles.layout}>
        <DashboardHeader summary={summary} onNavigate={onNavigate} />
        <Card padding="lg">
          <EmptyState
            title="Creá tu primer avatar"
            description="Cuando lo compartas, vas a poder seguir participantes, conversaciones y sesiones desde este espacio."
            action={<Button onClick={() => onNavigate("/avatars/new")}>Crear avatar</Button>}
          />
        </Card>
      </div>
    );
  }

  const { overview } = summary;

  return (
    <div className={styles.layout}>
      <DashboardHeader summary={summary} onNavigate={onNavigate} />

      <section className={styles.metrics} aria-label="Resultados de los últimos 30 días">
        <MetricCard
          label="Participantes activos"
          value={String(overview.activeParticipants.value)}
          delta={formatDashboardCountDelta(overview.activeParticipants)}
          tone={countMetricTone(overview.activeParticipants.changePercent)}
        />
        <MetricCard
          label="Conversaciones"
          value={String(overview.conversations.value)}
          delta={formatDashboardCountDelta(overview.conversations)}
          tone={countMetricTone(overview.conversations.changePercent)}
        />
        <MetricCard
          label="Participantes recurrentes"
          value={formatDashboardRate(overview.recurringParticipants.rate)}
          delta={formatDashboardRateDelta(overview.recurringParticipants)}
          tone={rateMetricTone(overview.recurringParticipants.rate, overview.recurringParticipants.total)}
        />
        <MetricCard
          label="Sesiones completadas"
          value={formatDashboardRate(overview.completedSessions.rate)}
          delta={formatDashboardRateDelta(overview.completedSessions)}
          tone={sessionMetricTone(overview.completedSessions.value, overview.completedSessions.total)}
        />
      </section>

      <AttentionPanel summary={summary} onNavigate={onNavigate} />

      <div className={styles.analysisGrid}>
        <ActivityTrend summary={summary} />
        <InteractionQuality summary={summary} />
      </div>

      <AvatarPerformance summary={summary} onNavigate={onNavigate} />
      <RecentActivity summary={summary} onNavigate={onNavigate} />

      <p className={styles.methodNote}>
        Las métricas incluyen únicamente actividad de participantes en avatares propios. No representan
        evaluaciones ni progreso académico.
      </p>
    </div>
  );
}

function DashboardHeader({
  summary,
  onNavigate,
}: {
  summary: ApiCreatorDashboardSummary;
  onNavigate: (path: string) => void;
}) {
  return (
    <PageHeader
      eyebrow={`Actividad · ${formatDashboardPeriod(summary.period.from, summary.period.to)}`}
      title="Cómo están usando tus avatares"
      description="Seguí la participación, detectá interrupciones y encontrá rápidamente dónde actuar."
      actions={
        <div className={styles.actions}>
          <Button icon={<YuniIcon name="add" />} onClick={() => onNavigate("/avatars/new")}>
            Crear avatar
          </Button>
          <Button variant="secondary" onClick={() => onNavigate("/avatars")}>
            Mis avatares
          </Button>
        </div>
      }
    />
  );
}

function AttentionPanel({
  summary,
  onNavigate,
}: {
  summary: ApiCreatorDashboardSummary;
  onNavigate: (path: string) => void;
}) {
  const groups: Array<{
    key: string;
    title: string;
    description: string;
    tone: BadgeTone;
    group: ApiDashboardAttentionGroup;
  }> = [
    {
      key: "unused",
      title: "Accesos sin uso",
      description: "Compartidos hace más de 7 días sin conversaciones.",
      tone: "warning",
      group: summary.attention.neverUsedAccesses,
    },
    {
      key: "inactive",
      title: "Sin actividad reciente",
      description: "Participantes que no interactúan hace al menos 14 días.",
      tone: "warning",
      group: summary.attention.inactiveParticipants,
    },
    {
      key: "errors",
      title: "Sesiones con error",
      description: "Llamadas que no pudieron finalizar correctamente en el período.",
      tone: "danger",
      group: summary.attention.erroredSessions,
    },
    {
      key: "sync",
      title: "Avatares para revisar",
      description: "La última actualización técnica no pudo completarse.",
      tone: "danger",
      group: summary.attention.failedAvatars,
    },
  ];

  return (
    <Card className={styles.attentionCard} padding="md" aria-labelledby="attention-title">
      <div className={styles.sectionHeader}>
        <div>
          <p className="yuni-eyebrow">Próximas acciones</p>
          <h2 id="attention-title" className={styles.sectionTitle}>
            Necesita atención
          </h2>
          <p className={styles.sectionDescription}>
            Pendientes concretos, sin inferir resultados académicos.
          </p>
        </div>
        <Badge tone={summary.attention.total > 0 ? "warning" : "success"}>
          {summary.attention.total > 0
            ? `${summary.attention.total} ${summary.attention.total === 1 ? "pendiente" : "pendientes"}`
            : "Todo al día"}
        </Badge>
      </div>

      {summary.attention.total === 0 ? (
        <div className={styles.attentionEmpty}>
          <YuniIcon name="sparkles" size={22} />
          <p>No hay accesos demorados, participantes inactivos ni errores por revisar.</p>
        </div>
      ) : (
        <div className={styles.attentionGrid}>
          {groups.map(({ key, ...group }) => (
            <AttentionGroup key={key} {...group} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </Card>
  );
}

function AttentionGroup({
  title,
  description,
  tone,
  group,
  onNavigate,
}: {
  title: string;
  description: string;
  tone: BadgeTone;
  group: ApiDashboardAttentionGroup;
  onNavigate: (path: string) => void;
}) {
  return (
    <section className={styles.attentionGroup}>
      <div className={styles.attentionGroupHeader}>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <Badge tone={group.count === 0 ? "neutral" : tone}>{group.count}</Badge>
      </div>

      {group.items.length === 0 ? (
        <p className={styles.noItems}>Sin pendientes.</p>
      ) : (
        <div className={styles.attentionItems}>
          {group.items.map((item) => (
            <button
              key={`${item.type}-${item.id}`}
              type="button"
              className={styles.attentionItem}
              onClick={() => onNavigate(getDashboardAttentionPath(item))}
            >
              <span>
                <strong>{attentionItemTitle(item)}</strong>
                <small>{attentionItemDetail(item)}</small>
              </span>
              <YuniIcon name="view" aria-hidden="true" />
            </button>
          ))}
          {group.count > group.items.length ? (
            <p className={styles.moreItems}>+{group.count - group.items.length} pendientes adicionales</p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ActivityTrend({ summary }: { summary: ApiCreatorDashboardSummary }) {
  const hasActivity = summary.trend.some(
    (point) => point.conversations > 0 || point.participants > 0
  );
  const width = 720;
  const height = 220;
  const inset = 18;
  const maximum = Math.max(
    1,
    ...summary.trend.flatMap((point) => [point.conversations, point.participants])
  );
  const conversationPoints = chartPoints(
    summary.trend.map((point) => point.conversations),
    width,
    height,
    inset,
    maximum
  );
  const participantPoints = chartPoints(
    summary.trend.map((point) => point.participants),
    width,
    height,
    inset,
    maximum
  );
  const firstDate = summary.trend.at(0)?.date ?? summary.period.from;
  const lastDate = summary.trend.at(-1)?.date ?? summary.period.to;

  return (
    <Card className={styles.trendCard} padding="md" aria-labelledby="trend-title">
      <div className={styles.sectionHeader}>
        <div>
          <p className="yuni-eyebrow">Evolución</p>
          <h2 id="trend-title" className={styles.sectionTitle}>
            Actividad diaria
          </h2>
        </div>
        <div className={styles.legend} aria-label="Series del gráfico">
          <span><i className={styles.conversationDot} />Conversaciones</span>
          <span><i className={styles.participantDot} />Participantes</span>
        </div>
      </div>

      {hasActivity ? (
        <div
          className={styles.chart}
          role="img"
          aria-label={`Tendencia de ${summary.overview.conversations.value} conversaciones y ${summary.overview.activeParticipants.value} participantes activos durante el período.`}
        >
          <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true" preserveAspectRatio="none">
            {[0.25, 0.5, 0.75].map((fraction) => (
              <line
                key={fraction}
                className={styles.gridLine}
                x1={inset}
                x2={width - inset}
                y1={height * fraction}
                y2={height * fraction}
              />
            ))}
            <polyline className={styles.conversationLine} points={conversationPoints} />
            <polyline className={styles.participantLine} points={participantPoints} />
          </svg>
          <div className={styles.chartDates} aria-hidden="true">
            <span>{formatShortDate(firstDate)}</span>
            <span>{formatShortDate(lastDate)}</span>
          </div>
        </div>
      ) : (
        <div className={styles.chartEmpty}>
          <YuniIcon name="chart" size={24} />
          <p>La tendencia aparecerá cuando un participante inicie una conversación.</p>
        </div>
      )}

      {hasActivity ? (
        <details className={styles.chartDetails}>
          <summary>Ver datos exactos</summary>
          <div className={styles.chartTableWrapper}>
            <table>
              <thead><tr><th>Fecha</th><th>Conversaciones</th><th>Participantes</th></tr></thead>
              <tbody>
                {summary.trend.map((point) => (
                  <tr key={point.date}>
                    <td>{formatShortDate(point.date)}</td>
                    <td>{point.conversations}</td>
                    <td>{point.participants}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </Card>
  );
}

function InteractionQuality({ summary }: { summary: ApiCreatorDashboardSummary }) {
  return (
    <Card className={styles.qualityCard} padding="md" aria-labelledby="quality-title">
      <div>
        <p className="yuni-eyebrow">Cómo interactúan</p>
        <h2 id="quality-title" className={styles.sectionTitle}>Profundidad típica</h2>
        <p className={styles.sectionDescription}>Medianas que evitan distorsiones por casos extremos.</p>
      </div>

      <div className={styles.qualityMetrics}>
        <div>
          <span>Duración de llamada</span>
          <strong>{formatDashboardDuration(summary.overview.medianVoiceDurationSeconds)}</strong>
          <small>Solo llamadas completadas</small>
        </div>
        <div>
          <span>Intervenciones por conversación</span>
          <strong>{summary.overview.medianParticipantTurns ?? "—"}</strong>
          <small>Solo conversaciones con transcript</small>
        </div>
      </div>
    </Card>
  );
}

function AvatarPerformance({
  summary,
  onNavigate,
}: {
  summary: ApiCreatorDashboardSummary;
  onNavigate: (path: string) => void;
}) {
  return (
    <section className={styles.section} aria-labelledby="avatars-title">
      <div className={styles.sectionHeader}>
        <div>
          <p className="yuni-eyebrow">Comparación</p>
          <h2 id="avatars-title" className={styles.sectionTitle}>Actividad por avatar</h2>
          <p className={styles.sectionDescription}>Ordenados por cantidad de conversaciones.</p>
        </div>
        <Button variant="secondary" onClick={() => onNavigate("/avatars")}>Ver todos</Button>
      </div>

      <Card padding="md">
        <DataList
          ariaLabel="Actividad por avatar"
          items={summary.avatars}
          getRowKey={(avatar) => avatar.avatarId}
          columns={[
            {
              key: "avatar",
              header: "Avatar",
              minWidth: "180px",
              render: (avatar) => (
                <button
                  type="button"
                  className={styles.tableLink}
                  onClick={() => onNavigate(`/avatars/${avatar.avatarId}?tab=activity`)}
                >
                  {avatar.avatarName}
                </button>
              ),
            },
            { key: "participants", header: "Participantes", align: "center", render: (avatar) => avatar.activeParticipants },
            { key: "conversations", header: "Conversaciones", align: "center", render: (avatar) => avatar.conversations },
            { key: "recurrence", header: "Recurrencia", align: "center", render: (avatar) => formatDashboardRate(avatar.recurringRate) },
            { key: "duration", header: "Duración típica", render: (avatar) => formatDashboardDuration(avatar.medianVoiceDurationSeconds) },
            { key: "last", header: "Última actividad", minWidth: "170px", render: (avatar) => formatDashboardDate(avatar.lastActivityAt) },
            {
              key: "attention",
              header: "Atención",
              align: "center",
              render: (avatar) => (
                <Badge tone={avatar.attentionCount > 0 ? "warning" : "success"}>
                  {avatar.attentionCount > 0 ? avatar.attentionCount : "Al día"}
                </Badge>
              ),
            },
          ]}
        />
      </Card>
    </section>
  );
}

function RecentActivity({
  summary,
  onNavigate,
}: {
  summary: ApiCreatorDashboardSummary;
  onNavigate: (path: string) => void;
}) {
  return (
    <section className={styles.section} aria-labelledby="recent-title">
      <div>
        <p className="yuni-eyebrow">Últimos movimientos</p>
        <h2 id="recent-title" className={styles.sectionTitle}>Actividad reciente</h2>
      </div>

      <Card padding="md">
        {summary.recentActivity.length === 0 ? (
          <EmptyState
            title="Todavía no hay conversaciones"
            description="Compartí un avatar para empezar a ver actividad de participantes."
          />
        ) : (
          <DataList
            ariaLabel="Actividad reciente de participantes"
            items={summary.recentActivity}
            getRowKey={(activity) => activity.conversationId}
            columns={[
              { key: "participant", header: "Participante", minWidth: "220px", render: (activity) => <strong>{activity.participantEmail}</strong> },
              { key: "avatar", header: "Avatar", minWidth: "160px", render: (activity) => activity.avatarName },
              { key: "mode", header: "Tipo", render: (activity) => activity.mode === "voice" ? "Llamada" : "Chat" },
              { key: "date", header: "Fecha", minWidth: "180px", render: (activity) => formatDashboardDate(activity.occurredAt) },
              {
                key: "action",
                header: "Acción",
                align: "end",
                render: (activity) => (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<YuniIcon name="view" />}
                    onClick={() => onNavigate(getDashboardTranscriptPath(activity.avatarId, activity.participantKey, activity.conversationId))}
                  >
                    Ver transcript
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>
    </section>
  );
}

function attentionItemTitle(item: ApiDashboardAttentionItem) {
  if (item.type === "failed_avatar") return item.avatarName;
  return item.participantEmail ?? item.avatarName;
}

function attentionItemDetail(item: ApiDashboardAttentionItem) {
  if (item.type === "failed_avatar") return "Revisar configuración";
  if (item.type === "errored_session") return `${item.avatarName} · ${formatDashboardDate(item.occurredAt)}`;
  if (item.type === "never_used_access") return `${item.avatarName} · compartido ${formatDashboardDate(item.occurredAt)}`;
  return `${item.avatarName} · última vez ${formatDashboardDate(item.occurredAt)}`;
}

function countMetricTone(change: number | null): BadgeTone {
  if (change === null || change === 0) return "neutral";
  return change > 0 ? "success" : "warning";
}

function rateMetricTone(rate: number | null, total: number): BadgeTone {
  if (rate === null || total === 0) return "neutral";
  return rate > 0 ? "success" : "warning";
}

function sessionMetricTone(value: number, total: number): BadgeTone {
  if (total === 0) return "neutral";
  return value === total ? "success" : "danger";
}

function chartPoints(values: number[], width: number, height: number, inset: number, maximum: number) {
  const availableWidth = width - inset * 2;
  const availableHeight = height - inset * 2;
  const divisor = Math.max(1, values.length - 1);
  return values
    .map((value, index) => {
      const x = inset + (index / divisor) * availableWidth;
      const y = height - inset - (value / maximum) * availableHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}
