# Configurable External Session Limits

## Status

accepted

## Related plan

[`35-limits-rate-limits.md`](../../plan-prompts/35-limits-rate-limits.md)

## Date

2026-08-14

## Context

Los links públicos y accesos compartidos permitían llamadas sin una política de uso definida por el
owner. Un límite fijo global no representa distintos casos pedagógicos y tampoco alcanza como
protección ante abuso. Al mismo tiempo, el MVP se desplegará inicialmente con una sola instancia de
API y debe recuperar expiraciones de llamadas después de reinicios.

## Options considered

- Límites globales únicamente: simples, pero sin control por link o participante.
- Contadores de producto en memoria: rápidos, pero pierden consumo al reiniciar y no funcionan al
  escalar horizontalmente.
- Cuotas persistentes calculadas desde sesiones más un limiter técnico en memoria: conserva la
  política del owner y mantiene acotada la complejidad del MVP.
- Redis desde el MVP: permitiría rate limits distribuidos, pero agrega infraestructura antes de que
  exista más de una instancia.

## Decision

- Cada `ShareLink` y cada `AccessGrant` tiene límites nullable de duración por llamada y llamadas por
  24 horas. Esto permite políticas distintas por link o participante. `NULL` significa sin límite del
  owner para ese target.
- La duración se almacena en segundos, admite valores entre 10 y 3600, y la Web permite ingresarla en
  segundos o minutos.
- El consumo de producto se obtiene de PostgreSQL en una ventana móvil de 24 horas. Público se
  agrupa por link+email normalizado y compartido por grant.
- Toda sesión externa mantiene un techo técnico configurable con `MAX_EXTERNAL_SESSION_MINUTES` (60
  minutos por defecto) y límites obligatorios de intentos y
  concurrencia. El owner queda exento de esta política externa.
- El limiter técnico es sliding-window, multidimensional, atómico, en memoria y guarda únicamente
  identificadores derivados con HMAC.
- Los deadlines y tokens del provider cifrados se persisten para detener sesiones y recuperar
  expiraciones después de reinicios.
- La API no entrega IDs ni errores internos del provider al navegador.

## Rationale

PostgreSQL ya es la fuente durable de sesiones y permite que las cuotas sobrevivan reinicios sin
incorporar un sistema de contadores adicional. Los locks acotados por participante/target y avatar
cierran la carrera entre dos inicios concurrentes dentro de la instancia. El limiter en memoria es
proporcional a la topología actual y queda detrás de una interfaz reemplazable por Redis.

## Implementation notes

- La única migración es `20260824120000_add_share_interaction_limits`. Agrega directamente los
  campos finales nullable en `ShareLink` y `AccessGrant`, `RealtimeSession.expiresAt`, constraints e
  índices. `RealtimeSession.accessGrantId` conserva el grant de la llamada para consultar la ventana
  móvil mediante el índice `(accessGrantId, status, startedAt)`; la migración lo completa desde la
  conversación de cada sesión existente y asigna el techo técnico de 60 minutos a sus deadlines
  faltantes para que filas activas antiguas no bloqueen capacidad indefinidamente. No crea columnas
  globales o de minutos ni mueve uso entre grants: las políticas existentes permanecen ilimitadas.
- Estados que consumen cuota: `connecting`, `active` y `ended`; `errored` queda excluido.
- Cambiar una política sólo afecta próximos inicios. Revocar/reactivar un grant no elimina su uso
  reciente.
- La IP proviene de `getConnInfo`; `X-Forwarded-For` sólo se acepta con `TRUST_PROXY_HOPS > 0`.
- Al vencer una sesión externa se detiene el provider inmediatamente y se conservan 30 segundos de
  gracia para recibir el cierre y el transcript del navegador. El mantenimiento usa el mismo cutoff,
  reintenta stops pendientes y recupera expiraciones fallidas sin producir rechazos no manejados.
- Si el cierre del navegador falla, la Web mantiene la sesión pendiente y ofrece reintentar el
  guardado; ocultar el toast no habilita una nueva llamada. Una vez confirmado el guardado, el stop
  local del SDK continúa en segundo plano y no puede dejar la interfaz bloqueada en `ending`.
- La Web conserva la reserva antes de construir el SDK y finaliza respuestas de inicio tardías que
  lleguen después de `pagehide` o un unmount. Al restaurar una página desde bfcache descarta estados
  locales de llamada que ya no pueden representar una conexión activa.
- Transcripts: un normalizador común envía sólo `role` y `content`, con máximo 200 entradas, 1000
  caracteres por entrada y 256 KiB de JSON UTF-8 por request. El servidor agrega metadata confiable y
  vuelve a validar todos los límites.
- La capa común de observabilidad redacta emails, credenciales, cookies, tokens y headers de proxy
  de forma recursiva y sin depender de mayúsculas; producción tampoco registra stacks ni mensajes
  internos de errores no controlados.

## User/product impact

El owner puede adaptar la disponibilidad de cada link y participante autenticado. Los participantes
autenticados ven su política; durante la llamada ven el tiempo restante y reciben un aviso en el
último minuto. El link público conserva una introducción simple y comunica rechazos mediante toast.

## Cost/UX/security tradeoffs

Las cuotas durables requieren consultas sobre sesiones en cada inicio, aceptables para el volumen del
MVP. Los rate limits técnicos se reinician con la API y no coordinan varias instancias. Esta
limitación es explícita; al escalar horizontalmente se debe migrar la interfaz del limiter y los locks
a Redis o un mecanismo distribuido equivalente.

## Sources

- [Plan 35](../../plan-prompts/35-limits-rate-limits.md)
- [Hono ConnInfo](https://hono.dev/docs/helpers/conninfo)
- Tests de dominio, política externa, API y Web incluidos en el monorepo.

## Evidence to collect later

- Distribución real de minutos por llamada y rechazos por razón.
- Cantidad de stops recuperados por mantenimiento después de reinicios.
- Volumen de buckets del limiter y necesidad real de Redis.
- Comprensión de la política y del countdown en pruebas con usuarios.

## Open questions

- Definir el umbral de tráfico o número de instancias que dispara la migración a Redis.
- Evaluar si una versión posterior necesita límites por costo además de tiempo y cantidad.
