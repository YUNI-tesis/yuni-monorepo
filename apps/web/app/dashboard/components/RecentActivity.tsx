import React from "react";
import { Badge, Button, Card, EmptyState, YuniIcon } from "@yuni/ui";
import type { ApiCreatorDashboardSummary } from "../../../lib/api/dashboard-api";
import {
  formatDashboardDate,
  getDashboardResourceName,
  getDashboardResourceTranscriptPath,
  isDashboardGroupResource,
} from "../../../lib/creator-dashboard";
import styles from "../Dashboard.module.css";

export function RecentActivity({
  summary,
  onNavigate,
}: {
  summary: ApiCreatorDashboardSummary;
  onNavigate: (path: string) => void;
}) {
  const openConversation = (activity: ApiCreatorDashboardSummary["recentActivity"][number]) =>
    onNavigate(
      getDashboardResourceTranscriptPath(activity, activity.participantKey, activity.conversationId)
    );

  return (
    <section className={styles.section} aria-labelledby="recent-title">
      <div>
        <p className="yuni-eyebrow">Dentro del período</p>
        <h2 id="recent-title" className={styles.sectionTitle}>
          Actividad reciente
        </h2>
      </div>
      <Card padding="md">
        {summary.recentActivity.length === 0 ? (
          <EmptyState
            title="No hubo actividad en este período"
            description="Probá otro período o compartí un avatar para comenzar."
          />
        ) : (
          <>
            <div className={styles.desktopTable}>
              <table>
                <thead>
                  <tr>
                    <th>Participante</th>
                    <th>Recurso</th>
                    <th>Origen</th>
                    <th>Tipo</th>
                    <th>Conversación</th>
                    <th>Fecha</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recentActivity.map((activity) => (
                    <tr key={activity.conversationId}>
                      <th>
                        <strong>{activity.participantName || activity.participantEmail}</strong>
                        <small className={styles.secondaryLine}>
                          {activity.participantName ? activity.participantEmail : ""}
                        </small>
                      </th>
                      <td>
                        <span>{getDashboardResourceName(activity)}</span>
                        {isDashboardGroupResource(activity) ? (
                          <small className={styles.secondaryLine}>Grupo</small>
                        ) : null}
                      </td>
                      <td>
                        <OriginBadge origin={activity.origin} />
                      </td>
                      <td>{activity.mode === "voice" ? "Voz" : "Chat"}</td>
                      <td>{activity.title || "Sin título"}</td>
                      <td>{formatDashboardDate(activity.occurredAt)}</td>
                      <td>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<YuniIcon name="view" />}
                          onClick={() => openConversation(activity)}
                        >
                          Ver conversación
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.mobileCards}>
              {summary.recentActivity.map((activity) => (
                <article key={activity.conversationId} className={styles.dataCard}>
                  <div className={styles.cardHeading}>
                    <div>
                      <h3>{activity.participantName || activity.participantEmail}</h3>
                      {activity.participantName ? <small>{activity.participantEmail}</small> : null}
                    </div>
                    <Badge tone="neutral">{activity.mode === "voice" ? "Voz" : "Chat"}</Badge>
                  </div>
                  <p>{activity.title || "Sin título"}</p>
                  <dl>
                    <div>
                      <dt>Recurso</dt>
                      <dd>
                        {getDashboardResourceName(activity)}
                        {isDashboardGroupResource(activity) ? " · Grupo" : ""}
                      </dd>
                    </div>
                    <div>
                      <dt>Origen</dt>
                      <dd>
                        <OriginBadge origin={activity.origin} />
                      </dd>
                    </div>
                    <div className={styles.cardWide}>
                      <dt>Fecha</dt>
                      <dd>{formatDashboardDate(activity.occurredAt)}</dd>
                    </div>
                  </dl>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<YuniIcon name="view" />}
                    onClick={() => openConversation(activity)}
                  >
                    Ver conversación
                  </Button>
                </article>
              ))}
            </div>
          </>
        )}
      </Card>
    </section>
  );
}

function OriginBadge({ origin }: { origin: ApiCreatorDashboardSummary["recentActivity"][number]["origin"] }) {
  return origin === "public_link" ? (
    <Badge tone="warning">Link público</Badge>
  ) : (
    <Badge tone="neutral">Cuenta compartida</Badge>
  );
}
