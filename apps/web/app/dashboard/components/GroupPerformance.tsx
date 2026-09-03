import React from "react";
import { Badge, Button, Card, EmptyState, type BadgeTone } from "@yuni/ui";
import type { ApiCreatorDashboardSummary } from "../../../lib/api/dashboard-api";
import { formatDashboardDate } from "../../../lib/creator-dashboard";
import styles from "../Dashboard.module.css";
import { formatSimpleRate } from "./presentation";

export function GroupPerformance({
  summary,
  onNavigate,
}: {
  summary: ApiCreatorDashboardSummary;
  onNavigate: (path: string) => void;
}) {
  if (!summary.groups) return null;

  return (
    <section className={styles.section} aria-labelledby="groups-title">
      <div className={styles.sectionHeader}>
        <div>
          <p className="yuni-eyebrow">Comparación</p>
          <h2 id="groups-title" className={styles.sectionTitle}>
            Actividad por grupo
          </h2>
          <p className={styles.sectionDescription}>
            Cada conversación grupal cuenta una sola vez, independientemente de cuántos integrantes
            participaron.
          </p>
        </div>
        <Button variant="secondary" onClick={() => onNavigate("/groups")}>
          Ver todos
        </Button>
      </div>
      <Card padding="md">
        {summary.groups.length === 0 ? (
          <EmptyState
            title="No hay actividad por grupo para mostrar"
            description="Cuando compartas un grupo, sus interacciones aparecerán en esta sección."
          />
        ) : (
          <>
            <div className={styles.desktopTable}>
              <table>
                <thead>
                  <tr>
                    <th>Grupo</th>
                    <th>Participantes</th>
                    <th>Conversaciones</th>
                    <th>Retorno</th>
                    <th>Activación 7 días</th>
                    <th>Última actividad</th>
                    <th>Salud</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.groups.map((group) => (
                    <tr key={group.groupId}>
                      <th>
                        <button
                          className={styles.tableLink}
                          type="button"
                          onClick={() => onNavigate(`/groups/${group.groupId}/activity`)}
                        >
                          {group.groupName}
                        </button>
                      </th>
                      <td>{group.activeParticipants}</td>
                      <td>{group.engagedConversations}</td>
                      <td>{formatSimpleRate(group.returningParticipants)}</td>
                      <td>{formatSimpleRate(group.directAccessActivation)}</td>
                      <td>{formatDashboardDate(group.lastActivityAt)}</td>
                      <td>
                        <GroupHealthBadge health={group.health} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.mobileCards}>
              {summary.groups.map((group) => (
                <article key={group.groupId} className={styles.dataCard}>
                  <div className={styles.cardHeading}>
                    <button
                      className={styles.tableLink}
                      type="button"
                      onClick={() => onNavigate(`/groups/${group.groupId}/activity`)}
                    >
                      {group.groupName}
                    </button>
                    <GroupHealthBadge health={group.health} />
                  </div>
                  <dl>
                    <div>
                      <dt>Participantes</dt>
                      <dd>{group.activeParticipants}</dd>
                    </div>
                    <div>
                      <dt>Conversaciones</dt>
                      <dd>{group.engagedConversations}</dd>
                    </div>
                    <div>
                      <dt>Retorno</dt>
                      <dd>{formatSimpleRate(group.returningParticipants)}</dd>
                    </div>
                    <div>
                      <dt>Activación 7 días</dt>
                      <dd>{formatSimpleRate(group.directAccessActivation)}</dd>
                    </div>
                    <div className={styles.cardWide}>
                      <dt>Última actividad</dt>
                      <dd>{formatDashboardDate(group.lastActivityAt)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </>
        )}
      </Card>
    </section>
  );
}

function GroupHealthBadge({
  health,
}: {
  health: NonNullable<ApiCreatorDashboardSummary["groups"]>[number]["health"];
}) {
  const presentation: Record<typeof health, { label: string; tone: BadgeTone }> = {
    available: { label: "Disponible", tone: "success" },
    unavailable: { label: "No disponible", tone: "danger" },
    deleted: { label: "Eliminado", tone: "neutral" },
  };
  const item = presentation[health];
  return <Badge tone={item.tone}>{item.label}</Badge>;
}
