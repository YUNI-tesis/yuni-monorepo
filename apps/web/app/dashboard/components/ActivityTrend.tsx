import React from "react";
import { Card, YuniIcon } from "@yuni/ui";
import type { ApiCreatorDashboardSummary } from "../../../lib/api/dashboard-api";
import styles from "../Dashboard.module.css";

export function ActivityTrend({ summary }: { summary: ApiCreatorDashboardSummary }) {
  const points = summary.trend.points;
  const hasActivity = points.some((point) => point.engagedConversations > 0 || point.participants > 0);
  const width = 720;
  const height = 240;
  const plot = { left: 42, right: 16, top: 16, bottom: 30 };
  const maximum = Math.max(1, ...points.flatMap((point) => [point.engagedConversations, point.participants]));
  const axisTicks = buildActivityTrendAxisTicks(maximum);
  const step = (width - plot.left - plot.right) / Math.max(1, points.length);
  const barWidth = Math.max(4, Math.min(28, step * 0.55));
  const participantPoints = points
    .map((point, index) => {
      const x = plot.left + step * (index + 0.5);
      const y = chartY(point.participants, maximum, height, plot.top, plot.bottom);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <Card className={styles.trendCard} padding="md" aria-labelledby="trend-title">
      <div className={styles.sectionHeader}>
        <div>
          <p className="yuni-eyebrow">Evolución</p>
          <h2 id="trend-title" className={styles.sectionTitle}>
            Actividad {summary.trend.granularity === "day" ? "diaria" : "semanal"}
          </h2>
        </div>
        <div className={styles.legend} aria-label="Series del gráfico">
          <span>
            <i className={styles.conversationDot} />
            Conversaciones
          </span>
          <span>
            <i className={styles.participantDot} />
            Participantes
          </span>
        </div>
      </div>

      {hasActivity ? (
        <div className={styles.chart}>
          <div className={styles.chartPlot}>
            <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true" preserveAspectRatio="none">
              {axisTicks.map(({ value, fraction }) => {
                const y = plot.top + (height - plot.top - plot.bottom) * fraction;
                return (
                  <g key={value}>
                    <line className={styles.gridLine} x1={plot.left} x2={width - plot.right} y1={y} y2={y} />
                    <text className={styles.axisLabel} x={plot.left - 8} y={y + 4} textAnchor="end">
                      {value}
                    </text>
                  </g>
                );
              })}
              {points.map((point, index) => {
                const x = plot.left + step * (index + 0.5) - barWidth / 2;
                const y = chartY(point.engagedConversations, maximum, height, plot.top, plot.bottom);
                return (
                  <rect
                    key={point.date}
                    className={styles.conversationBar}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={height - plot.bottom - y}
                    rx="3"
                  />
                );
              })}
              <polyline className={styles.participantLine} points={participantPoints} />
            </svg>
            {points.map((point, index) => {
              const x = ((plot.left + step * (index + 0.5)) / width) * 100;
              const y = (chartY(point.participants, maximum, height, plot.top, plot.bottom) / height) * 100;
              const label = trendPointLabel(point, summary.trend.granularity);
              return (
                <button
                  key={point.date}
                  type="button"
                  className={styles.chartHotspot}
                  style={{ left: `${x}%`, top: `${y}%` }}
                  aria-label={label}
                >
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
          <div className={styles.chartDates} aria-hidden="true">
            <span>{formatShortDate(points.at(0)?.date ?? summary.period.from)}</span>
            <span>{formatShortDate(points.at(-1)?.dateTo ?? summary.period.to)}</span>
          </div>
        </div>
      ) : (
        <div className={styles.chartEmpty}>
          <YuniIcon name="chart" size={24} />
          <p>La tendencia aparecerá cuando haya un mensaje del participante o una llamada activada.</p>
        </div>
      )}

      <details className={styles.chartDetails}>
        <summary>Ver tabla exacta</summary>
        <div className={styles.chartTableWrapper}>
          <table>
            <thead>
              <tr>
                <th>Período</th>
                <th>Conversaciones</th>
                <th>Participantes</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.date}>
                  <td>{trendDateLabel(point.date, point.dateTo, summary.trend.granularity)}</td>
                  <td>{point.engagedConversations}</td>
                  <td>{point.participants}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}

function chartY(value: number, maximum: number, height: number, top: number, bottom: number) {
  return height - bottom - (value / maximum) * (height - top - bottom);
}

export function buildActivityTrendAxisTicks(maximum: number) {
  const safeMaximum = Math.max(1, Math.ceil(maximum));
  const values = [safeMaximum, Math.ceil(safeMaximum / 2), 0].filter(
    (value, index, ticks) => ticks.indexOf(value) === index
  );

  return values.map((value) => ({ value, fraction: 1 - value / safeMaximum }));
}

function trendPointLabel(
  point: ApiCreatorDashboardSummary["trend"]["points"][number],
  granularity: "day" | "week"
) {
  return `${trendDateLabel(point.date, point.dateTo, granularity)}: ${point.engagedConversations} conversaciones y ${point.participants} participantes`;
}

function trendDateLabel(from: string, to: string, granularity: "day" | "week") {
  return granularity === "day" ? formatShortDate(from) : `${formatShortDate(from)}–${formatShortDate(to)}`;
}

function formatShortDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1))
  );
}
