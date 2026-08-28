# Objective Dashboard Activity Methodology

## Status

accepted

## Related plans

`12A-app-shell-navigation-dashboard.md`, `16-share-metrics-api.md`

## Date

2026-08-25

## Context

El dashboard anterior aproximaba uso con la fecha de creación de una conversación, contaba mensajes heterogéneos y usaba días UTC. Eso producía tres problemas metodológicos: una conversación antigua reutilizada no aparecía, una conversación vacía podía contar como actividad y la recurrencia cambiaba según la distancia del usuario a UTC. También mezclaba finalización técnica de voz con uso y no distinguía acceso directo de link público.

La tesis requiere que cada valor visible tenga una fórmula reproducible y que ninguna métrica histórica cambie por eventos fuera de su período. El alcance se limita a actividad observable; no existe evidencia suficiente para inferir aprendizaje, calidad o progreso académico.

## Decision

- Definir un evento analítico unificado como mensaje `user` en `Message.createdAt` o activación real de voz en `RealtimeSession.activatedAt`.
- Persistir `activatedAt` idempotentemente al pasar una sesión a `active`. Para historia previa, aproximar `active`/`ended` con `startedAt` y `errored` sólo cuando existe un mensaje del participante.
- Identificar participantes con `lower(trim(participantEmail))`, excluir al creador y mantener email como identidad analítica del MVP.
- Ofrecer períodos cerrados de 7, 30 y 90 días usando días calendario de una zona IANA enviada por el navegador. El default de API es 30 días/UTC.
- Definir conversaciones con actividad por eventos ocurridos dentro del período, no por `Conversation.createdAt` ni por su estado final.
- Definir retorno como actividad en al menos dos fechas locales distintas dentro del período.
- Mantener un total deduplicado y desgloses `access_grant`/`public_link`; un email puede pertenecer a ambos canales.
- Medir activación de grants por cohortes cuyo cierre de siete días cae en el período. Convertir toda baja de un grant emitido en revocación lógica y conservarlo en el embudo histórico.
- Medir duración de voz desde activación hasta cierre y atribuir salud de voz por el `endedAt` de intentos
  terminales. Un cierre `ended` sin activación no representa una llamada conectada.
- Hacer que las alertas representen estado actual y conduzcan a una acción: compartir, revisar actividad, abrir conversación o revisar configuración.
- Derivar overview, origen, tendencia y avatar de la misma consulta de eventos para evitar metodologías divergentes.
- Ejecutar agregaciones concurrentes en SQL/Prisma y no cargar el historial completo de conversaciones en memoria.

## Rationale

Los eventos elegidos tienen evidencia directa de participación. Separar `startedAt` de `activatedAt` evita atribuir uso a intentos que nunca conectaron. La fecha local alinea retorno y tendencias con la experiencia del creador. Las cohortes cerradas impiden que accesos aún inmaduros reduzcan artificialmente la activación, mientras conservar revocados evita reescribir el pasado.

Los cambios de volumen se presentan con tono neutral porque subir o bajar no implica por sí mismo un resultado bueno o malo. Los colores evaluativos quedan reservados para errores, indisponibilidad y situaciones con umbrales explícitos.

## Consequences

- Una misma conversación puede contar en distintos períodos si vuelve a recibir actividad, pero sólo una vez dentro de cada período.
- Una llamada activada cuenta aunque no haya transcript; un intento `connecting` o fallido antes de activar no cuenta.
- Los visitantes públicos participan en métricas de uso, pero nunca aparecen como inactivos porque no tienen un grant activo gestionable.
- El total de participantes no equivale necesariamente a la suma de canales.
- El backfill de voz previo a esta decisión es una aproximación documentada; los datos nuevos son exactos.
- Costos, evaluación académica y análisis semántico permanecen fuera del dashboard.

## Validation

- Tests de conversación antigua con mensaje actual, voz activada sin transcript, intentos sin activación, recurrencia alrededor de medianoche y DST, deduplicación entre orígenes, ventanas de cohorte, grants activos/revocados, resolución de errores por intento posterior, reconciliación por avatar y ownership.
- Seed con chat, voz con/sin transcript, fallo previo a conexión, ambos orígenes, fechas a ambos lados de medianoche local y cohortes activadas/no activadas/revocadas.
- Índices y planes de consulta validados con `EXPLAIN`; telemetría de duración/error en el endpoint con objetivo inicial p95 menor a 500 ms.
- UI con tabla exacta del gráfico, tooltips navegables por teclado, deep links específicos y tarjetas a 390 px sin overflow horizontal.

## Evidence

- [Plan 16 actualizado](../../plan-prompts/16-share-metrics-api.md)
- Migración `20260825150000_dashboard_activity_events`
- Tests `apps/api/src/dashboard.test.ts`, `packages/db/src/creator-dashboard-repository.integration.test.ts`, `apps/web/creator-dashboard.test.tsx` y `apps/web/creator-dashboard-hook.lifecycle.test.tsx`
- ADR reemplazado: [0015](0015-creator-dashboard-actionable-metrics.md)

## Follow-up

- Medir p95 con datos cercanos al volumen esperado y ajustar índices si los planes reales cambian.
- Evaluar una identidad analítica estable distinta del email cuando el modelo de cuentas lo requiera.
- Implementar costos y reportes económicos por link/grant en el plan 27 sin mezclarlos con actividad académica.
