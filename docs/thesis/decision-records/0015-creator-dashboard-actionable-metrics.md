# Creator Dashboard With Actionable Metrics

## Status

accepted

## Related plans

`12A-app-shell-navigation-dashboard.md`, `16-share-metrics-api.md`

## Date

2026-08-16

## Context

El dashboard inicial mostraba cantidad de avatares y estados de sincronización. Esos datos describían
inventario técnico, pero no permitían al creador saber si sus participantes usaban los avatares,
volvían a interactuar o encontraban errores durante las llamadas.

## Decision

- El dashboard privado se optimiza primero para creadores y excluye avatares compartidos recibidos.
- El período inicial son los últimos 30 días calendario UTC, comparados con los 30 anteriores.
- Los indicadores principales son participantes activos, conversaciones, recurrencia y sesiones de
  voz completadas.
- La recurrencia exige actividad en al menos dos días distintos dentro del período.
- Las sesiones abiertas no forman parte del denominador de éxito; sólo se comparan `ended` y
  `errored`.
- Duración e intervenciones se presentan como medianas y como `—` cuando no existe evidencia.
- Los estados técnicos se mueven a `Necesita atención`, junto con accesos sin uso después de siete
  días y participantes sin actividad durante catorce días.
- El gráfico de tendencia incluye una tabla con valores exactos, y cada alerta o actividad reciente
  navega al avatar, participante o transcript correspondiente.

## Rationale

La jerarquía prioriza preguntas que derivan en una acción concreta: identificar alcance, continuidad,
personas para contactar y problemas de sesión. Mantener los estados técnicos como alertas conserva su
utilidad sin confundirlos con resultados de uso. Las medianas evitan que sesiones excepcionalmente
largas distorsionen la lectura.

## Limits

- Las métricas describen actividad; no afirman progreso, aprendizaje, satisfacción ni calidad de las
  respuestas.
- Los costos y desgloses específicos por link o grant siguen pendientes.
- `participantEmail` normalizado es la clave pedagógica del MVP; la clave expuesta en URLs es opaca.
- La actividad histórica se calcula con los datos persistidos actualmente, sin incorporar nuevos
  eventos de analytics.

## Evidence

- Tests de autenticación, rangos temporales, deduplicación por email, períodos vacíos, recurrencia,
  sesiones abiertas y métricas por avatar.
- Tests Web de contratos, formato de estados sin datos, jerarquía del dashboard y deep links.
- Suite, lint, typecheck y build completos del monorepo.
- Verificación visual en escritorio y viewport móvil de 375 px, sin overflow horizontal de página ni
  errores de consola.
