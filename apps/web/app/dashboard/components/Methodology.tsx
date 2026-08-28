import React from "react";
import type { ApiCreatorDashboardSummary } from "../../../lib/api/dashboard-api";
import styles from "../Dashboard.module.css";

export function Methodology({ summary }: { summary: ApiCreatorDashboardSummary }) {
  return (
    <details className={styles.methodology}>
      <summary>Cómo se calculan estas métricas</summary>
      <div>
        <p>
          Período: últimos {summary.period.days} días calendario locales, incluido hoy, usando{" "}
          {summary.period.timeZone}.
        </p>
        <ul>
          <li>Participante activo: email con un mensaje propio o una activación real de voz.</li>
          <li>Conversación con actividad: conversación distinta con al menos uno de esos eventos.</li>
          <li>Retorno: participantes activos en dos o más días locales / participantes activos.</li>
          <li>
            Activación: grants cuyo séptimo día cerró en el período y tuvieron actividad directa antes del
            cierre / grants elegibles.
          </li>
          <li>Identidad: email normalizado; el total deduplica entre acceso directo y link público.</li>
          <li>
            Características: mediana de mensajes por conversación con transcript y mediana desde la activación
            hasta el cierre de llamadas terminadas.
          </li>
          <li>Errores de voz: intentos con error / intentos terminados en el período.</li>
        </ul>
        <p>
          “Necesita atención” refleja el estado actual y usa umbrales de{" "}
          {summary.methodology.activationWindowDays} y {summary.methodology.inactivityDays} días; no cambia
          con el selector de período.
        </p>
        <p>{summary.methodology.disclaimer}</p>
      </div>
    </details>
  );
}
