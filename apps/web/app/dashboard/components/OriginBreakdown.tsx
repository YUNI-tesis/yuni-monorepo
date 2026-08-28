import React from "react";
import { Card } from "@yuni/ui";
import type { ApiCreatorDashboardSummary } from "../../../lib/api/dashboard-api";
import styles from "../Dashboard.module.css";
import { formatSimpleRate, originLabel } from "./presentation";

export function OriginBreakdown({ summary }: { summary: ApiCreatorDashboardSummary }) {
  return (
    <section className={styles.section} aria-labelledby="origin-title">
      <div>
        <p className="yuni-eyebrow">Canales de acceso</p>
        <h2 id="origin-title" className={styles.sectionTitle}>
          Por origen
        </h2>
        <p className={styles.sectionDescription}>
          El total deduplica emails usados en ambos canales; no es la suma de las otras filas.
        </p>
      </div>
      <Card padding="md">
        <div className={styles.desktopTable}>
          <table>
            <thead>
              <tr>
                <th>Origen</th>
                <th>Participantes</th>
                <th>Conversaciones</th>
                <th>Retorno</th>
                <th>Conversaciones / participante</th>
              </tr>
            </thead>
            <tbody>
              {summary.byOrigin.map((row) => (
                <tr key={row.origin}>
                  <th>{originLabel(row.origin)}</th>
                  <td>{row.activeParticipants}</td>
                  <td>{row.engagedConversations}</td>
                  <td>{formatSimpleRate(row.returningParticipants)}</td>
                  <td>{row.conversationsPerParticipant ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.mobileCards}>
          {summary.byOrigin.map((row) => (
            <article key={row.origin} className={styles.dataCard}>
              <h3>{originLabel(row.origin)}</h3>
              <dl>
                <div>
                  <dt>Participantes</dt>
                  <dd>{row.activeParticipants}</dd>
                </div>
                <div>
                  <dt>Conversaciones</dt>
                  <dd>{row.engagedConversations}</dd>
                </div>
                <div>
                  <dt>Retorno</dt>
                  <dd>{formatSimpleRate(row.returningParticipants)}</dd>
                </div>
                <div>
                  <dt>Conversaciones / participante</dt>
                  <dd>{row.conversationsPerParticipant ?? "—"}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </Card>
    </section>
  );
}
