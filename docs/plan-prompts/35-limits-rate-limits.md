# Plan 35: Limits And Rate Limits

## Estado

Implementado el 2026-08-14.

## Objetivo implementado

Proteger las llamadas públicas y compartidas con límites de producto configurables por el owner y
techos técnicos obligatorios. El owner conserva su flujo privado sin cuotas ni countdown.

## Alcance cerrado

- Cada `ShareLink` y cada `AccessGrant` acepta duración por llamada y llamadas por 24 horas. Los
  valores `null` representan una política ilimitada del owner para ese link o participante.
- La duración se persiste en segundos (entre 10 y 3600) y la Web permite configurarla en segundos o
  minutos.
- Las cuotas se calculan desde PostgreSQL en una ventana móvil de 24 horas y se aíslan por
  link+email o grant.
- La duración efectiva es el mínimo entre el techo técnico configurado con
  `MAX_EXTERNAL_SESSION_MINUTES` y el límite por llamada.
- Los inicios públicos y compartidos aplican rate limits en memoria por IP, participante, target,
  link y avatar. Las claves conservadas por el limiter son hashes HMAC.
- La IP se toma de la conexión Node y sólo se usa `X-Forwarded-For` cuando `TRUST_PROXY_HOPS` es
  mayor que cero.
- Las sesiones externas tienen deadline persistido, stop idempotente del provider, cleanup periódico
  después de reinicios y countdown en Web. Al vencer se detiene el provider y se conservan 30
  segundos de gracia para que el navegador finalice el transcript.
- Los transcripts se normalizan en un único cliente para cierres públicos, compartidos y privados:
  sólo `role` y `content`, hasta 200 entradas, 1000 caracteres por entrada y 256 KiB de JSON UTF-8 por
  request. El servidor mantiene validación estricta y agrega metadata segura.
- Un cierre fallido permanece pendiente aunque desaparezca el toast. La Web impide iniciar otra
  llamada y muestra `Reintentar guardado` hasta confirmar el cierre.
- Las reservas creadas antes de un `pagehide` o un unmount se finalizan aunque la respuesta de inicio
  llegue tarde; una restauración desde bfcache no revive una llamada local inexistente.
- La API devuelve `429`/`409`, `reason`, `retryAfterSeconds` y `Retry-After` sin exponer IDs ni
  errores internos del provider.
- La pantalla Compartir permite crear y editar límites, muestra `Ilimitado` para campos vacíos y
  resume la política en cada link y participante con acceso.

## Migración

`20260818120000_add_share_interaction_limits` es la única migración. Agrega directamente
`maxSessionDurationSeconds` y `maxSessionsPer24Hours` como columnas nullable en `ShareLink` y
`AccessGrant`, además de `RealtimeSession.expiresAt`, el grant de cada sesión, constraints de rango e
índices de consulta. El grant de sesiones existentes se completa desde su propia conversación para
que la cuota use `(accessGrantId, status, startedAt)`; las sesiones compartidas antiguas sin deadline
reciben el techo técnico de 60 minutos para no retener capacidad indefinidamente. No crea columnas
globales o legacy ni mueve consumo entre grants; las políticas existentes quedan ilimitadas porque
sus nuevos campos no tienen defaults distintos de `NULL`.

## Verificación

- Tests de dominio para `null`, rangos y combinaciones inválidas.
- Tests de política para aislamiento, ventana exacta de 24 horas, duración en segundos, concurrencia,
  capacidad, fallos del provider y techo técnico.
- Tests de IP directa/proxy, sliding window atómica, errores HTTP, DTOs seguros y UX de límites.
- `pnpm test`, `pnpm typecheck`, `pnpm lint` y `pnpm build` forman el cierre técnico del plan.

## Decisión asociada

[ADR 0020: Configurable External Session Limits](../thesis/decision-records/0020-configurable-external-session-limits.md)
