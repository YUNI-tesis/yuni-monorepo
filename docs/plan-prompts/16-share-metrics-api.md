# Share Activity And Metrics API

Estado: dashboard de actividad implementado. El desglose económico de `UsageEvent` y el endpoint histórico `GET /avatars/:avatarId/share-metrics` quedan fuera de este alcance y continúan en `27-usage-cost-tracking.md`.

Decision metodológica: [ADR 0024](../thesis/decision-records/0024-objective-dashboard-activity-methodology.md).

## Contrato implementado

`GET /dashboard/creator-summary?days=7|30|90&timeZone=<IANA>`

- defaults: `days=30`, `timeZone=UTC`;
- días no soportados o zona IANA inválida: HTTP 400;
- períodos de calendario local, sin rangos personalizados `from/to`;
- respuesta owner-scoped con overview, comparación anterior, origen, tendencia, características de interacción, salud de voz, atención, avatares y actividad reciente.

## Fuente de actividad

- chat: `Message.role = user` en `Message.createdAt`;
- voz: activación real en `RealtimeSession.activatedAt`;
- identidad: `lower(trim(participantEmail))`;
- se excluye al creador y se aceptan conversaciones públicas identificadas o privadas asociadas a un access grant.

`RealtimeSession.activatedAt` se escribe idempotentemente al pasar a `active`. La migración histórica usa `startedAt` para sesiones `active`/`ended` y sólo aproxima sesiones `errored` cuando existe al menos un mensaje del participante.

## Métricas visibles

- participantes activos: email con al menos un evento;
- conversaciones con actividad: conversación distinta con mensaje del participante o activación de voz;
- retorno: participantes activos en al menos dos días locales distintos / participantes activos;
- activación en 7 días: grants cuyo cierre de ventana cae en el período y cuya primera actividad directa ocurrió antes de ese cierre;
- duración de voz: mediana desde `activatedAt` hasta `endedAt` en llamadas terminadas;
- intervenciones: mediana de mensajes del participante por conversación con transcript;
- salud de voz: cantidad y tasa de intentos terminales por `endedAt`; los cierres sin activación no se
  consideran intentos exitosos.

Los resultados se desglosan en `all`, `access_grant` y `public_link`. `all` deduplica participantes por email y no se calcula sumando canales.

## Atención accionable

- acceso directo activo sin uso después de siete días;
- participante con grant activo, actividad previa por cualquier origen y última actividad hace catorce días;
- conversación cuyo intento de voz más reciente terminó en error;
- avatar con fallo terminal y sin versión utilizable.

Los grants emitidos nunca se eliminan físicamente: la acción de baja los revoca para que incluso una cohorte todavía abierta pueda cerrar sin reescribir el embudo. Los grants revocados permanecen en cohortes históricas, pero nunca aparecen como atención actual. Los visitantes públicos nunca se clasifican como inactivos.

## Eficiencia y consistencia

- agregaciones SQL/Prisma concurrentes acotadas al período actual/anterior y grants relevantes;
- una misma fuente de eventos alimenta overview, origen, tendencia y avatar;
- índices para mensajes por rol/fecha, activaciones y cierres de voz por avatar/fecha, actividad de conversaciones por avatar/email y grants por owner/estado/fecha;
- endpoint instrumentado con duración y errores; objetivo inicial p95 menor a 500 ms con seed ampliado y prueba de volumen.

## Validación

- tests de chat, voz activada sin transcript, intentos no activados, recurrencia local/DST, deduplicación por origen, cohortes, atención, reconciliación por avatar y ownership, incluida una prueba de integración del repositorio real;
- UI con presets, URL, cancelación de requests, estados de carga/error/vacío, gráfico accesible, deep links y tarjetas móviles sin overflow horizontal;
- todas las métricas explican su fórmula y aclaran que no representan progreso académico.

## Fuera de alcance

- evaluación de aprendizaje, análisis IA de transcripts, satisfacción o calidad;
- costos y estimaciones de `UsageEvent`;
- desglose individual por link/grant como reporte económico;
- identidad analítica distinta del email normalizado.
