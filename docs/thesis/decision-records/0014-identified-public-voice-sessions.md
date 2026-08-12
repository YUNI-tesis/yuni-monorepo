# Identified Public Voice Sessions

## Status

accepted

## Related plans

`21-public-link-resolver-api.md`, `22-public-avatar-ui.md`, `23-public-session-api.md`,
`34-realtime-public-voice.md`, `16-share-metrics-api.md`

## Date

2026-08-10

## Context

Los Share Links resolvían una vista pública segura, pero todavía no permitían conversar ni atribuir
actividad. El MVP necesita cerrar el circuito entre compartir, interactuar y revisar evidencia de uso
sin exigir una cuenta al visitante.

## Decision

- El visitante se identifica con un email normalizado y acepta explícitamente que la llamada y su
  transcript serán visibles para el owner.
- El email no se verifica en esta versión y no se revela si pertenece a una cuenta existente.
- La identidad y la sesión se autorizan con tokens firmados de corta duración y alcances separados.
- Cada llamada crea una PublicSession, Conversation y RealtimeSession nuevas.
- La actividad owner agrupa grants y sesiones públicas por email mediante una clave opaca.
- Los límites por avatar y por IP/link se mantienen en memoria para la instancia única del MVP.
- Deshabilitar un link bloquea nuevas llamadas, pero no impide cerrar y guardar una ya iniciada.
- La API registra el inicio efectivo sólo después de que el SDK y el micrófono quedan activos.
- El token del proveedor se conserva cifrado mientras la sesión está activa para que un proceso de
  mantenimiento pueda retomar el vencimiento después de un reinicio de la API.

## Rationale

La identificación liviana permite atribución pedagógica sin incorporar infraestructura de email ni
convertir el link público en un flujo de registro. Separar los tokens reduce el alcance de una
credencial filtrada y evita usar IDs públicos como autorización. La agrupación por email presenta una
sola historia del participante aunque haya usado acceso autenticado y público.

## Limits

- No hay verificación de propiedad del email.
- No hay chat público, costos ni Usage Events.
- El rate limiting no es distribuido y se reinicia con el proceso.
- La duración máxima se aplica desde la sesión: el cliente detiene la llamada al vencer y la API
  conserva un cleanup durable con un margen breve para recibir el transcript final.

## Evidence

- Tests HTTP de consentimiento, tokens, límites, creación, fallos del provider y cierre idempotente.
- Tests de clientes Web y actividad unificada.
- Verificación manual prevista con navegador incógnito y revisión owner del transcript.
