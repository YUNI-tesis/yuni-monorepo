import React from "react";
import { Card } from "@yuni/ui";
import type { ApiCreatorDashboardSummary } from "../../../lib/api/dashboard-api";
import { formatDashboardDuration, formatDashboardRate } from "../../../lib/creator-dashboard";
import styles from "../Dashboard.module.css";

export function InteractionCharacteristics({ summary }: { summary: ApiCreatorDashboardSummary }) {
  const voice = summary.interaction.conversationMix;
  const chat = voice.total - voice.value;
  const errors = summary.voiceHealth.errors;
  return (
    <Card className={styles.qualityCard} padding="md" aria-labelledby="interaction-title">
      <div>
        <p className="yuni-eyebrow">Cómo interactúan</p>
        <h2 id="interaction-title" className={styles.sectionTitle}>
          Características de interacción
        </h2>
        <p className={styles.sectionDescription}>Describen uso, no calidad ni aprendizaje.</p>
      </div>
      <div className={styles.qualityMetrics}>
        <div>
          <span>Mix chat / voz</span>
          <strong>{voice.total === 0 ? "—" : `${chat} / ${voice.value}`}</strong>
          <small>{formatDashboardRate(voice.rate)} de conversaciones por voz</small>
        </div>
        <div>
          <span>Duración mediana de voz</span>
          <strong>{formatDashboardDuration(summary.interaction.medianVoiceDurationSeconds)}</strong>
          <small>Desde activación hasta cierre</small>
        </div>
        <div>
          <span>Intervenciones medianas</span>
          <strong>{summary.interaction.medianParticipantTurns ?? "—"}</strong>
          <small>Mensajes del participante por conversación con transcript</small>
        </div>
        <div>
          <span>Errores de voz</span>
          <strong>{formatDashboardRate(errors.rate)}</strong>
          <small>
            {errors.value} de {errors.total} intentos terminados
          </small>
        </div>
      </div>
    </Card>
  );
}
