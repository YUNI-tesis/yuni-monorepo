import React from "react";
import { Badge, Button, Card, EmptyState, type BadgeTone } from "@yuni/ui";
import type { ApiCreatorDashboardSummary } from "../../../lib/api/dashboard-api";
import { formatDashboardDate } from "../../../lib/creator-dashboard";
import styles from "../Dashboard.module.css";
import { formatSimpleRate } from "./presentation";

export function AvatarPerformance({
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
          <h2 id="avatars-title" className={styles.sectionTitle}>
            Actividad por avatar
          </h2>
          <p className={styles.sectionDescription}>
            La misma metodología del resumen, desglosada por avatar.
          </p>
        </div>
        <Button variant="secondary" onClick={() => onNavigate("/avatars")}>
          Ver todos
        </Button>
      </div>
      <Card padding="md">
        {summary.avatars.length === 0 ? (
          <EmptyState
            title="No hay actividad por avatar para mostrar"
            description="Los avatares deshabilitados aparecen aquí sólo cuando conservan actividad histórica."
          />
        ) : (
          <>
            <div className={styles.desktopTable}>
              <table>
                <thead>
                  <tr>
                    <th>Avatar</th>
                    <th>Participantes</th>
                    <th>Conversaciones</th>
                    <th>Retorno</th>
                    <th>Activación 7 días</th>
                    <th>Última actividad</th>
                    <th>Salud</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.avatars.map((avatar) => (
                    <tr key={avatar.avatarId}>
                      <th>
                        <button
                          className={styles.tableLink}
                          type="button"
                          onClick={() => onNavigate(`/avatars/${avatar.avatarId}?tab=activity`)}
                        >
                          {avatar.avatarName}
                        </button>
                      </th>
                      <td>{avatar.activeParticipants}</td>
                      <td>{avatar.engagedConversations}</td>
                      <td>{formatSimpleRate(avatar.returningParticipants)}</td>
                      <td>{formatSimpleRate(avatar.directAccessActivation)}</td>
                      <td>{formatDashboardDate(avatar.lastActivityAt)}</td>
                      <td>
                        <AvatarHealthBadge health={avatar.health} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.mobileCards}>
              {summary.avatars.map((avatar) => (
                <article key={avatar.avatarId} className={styles.dataCard}>
                  <div className={styles.cardHeading}>
                    <button
                      className={styles.tableLink}
                      type="button"
                      onClick={() => onNavigate(`/avatars/${avatar.avatarId}?tab=activity`)}
                    >
                      {avatar.avatarName}
                    </button>
                    <AvatarHealthBadge health={avatar.health} />
                  </div>
                  <dl>
                    <div>
                      <dt>Participantes</dt>
                      <dd>{avatar.activeParticipants}</dd>
                    </div>
                    <div>
                      <dt>Conversaciones</dt>
                      <dd>{avatar.engagedConversations}</dd>
                    </div>
                    <div>
                      <dt>Retorno</dt>
                      <dd>{formatSimpleRate(avatar.returningParticipants)}</dd>
                    </div>
                    <div>
                      <dt>Activación 7 días</dt>
                      <dd>{formatSimpleRate(avatar.directAccessActivation)}</dd>
                    </div>
                    <div className={styles.cardWide}>
                      <dt>Última actividad</dt>
                      <dd>{formatDashboardDate(avatar.lastActivityAt)}</dd>
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

function AvatarHealthBadge({ health }: { health: ApiCreatorDashboardSummary["avatars"][number]["health"] }) {
  const presentation: Record<typeof health, { label: string; tone: BadgeTone }> = {
    available: { label: "Disponible", tone: "success" },
    unavailable: { label: "No disponible", tone: "danger" },
    syncing: { label: "Actualizando", tone: "warning" },
    pending: { label: "Sin configurar", tone: "warning" },
    disabled: { label: "Deshabilitado", tone: "neutral" },
    draft: { label: "Borrador", tone: "neutral" },
  };
  const item = presentation[health];
  return <Badge tone={item.tone}>{item.label}</Badge>;
}
