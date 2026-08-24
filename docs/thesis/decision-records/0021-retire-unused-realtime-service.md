# Retire Unused Realtime Service

## Status

accepted

## Related plan

`00-monorepo-base.md`, `24A-agent-voice-architecture-context-contract.md`,
`32-realtime-service-foundation.md`, `33-realtime-private-voice.md` y
`34-realtime-public-voice.md`.

## Date

2026-08-24

## Context

El monorepo conservaba `apps/realtime`, un servidor WebSocket que únicamente aceptaba una conexión y
emitía `session.ready`. Ningún cliente consumía `NEXT_PUBLIC_REALTIME_URL` y ningún flujo de voz
dependía de ese proceso. La arquitectura implementada evolucionó hacia la opción ElevenLabs-first:
la API autoriza y reserva la sesión, entrega tokens efímeros y el navegador usa los SDK de
ElevenLabs y LiveAvatar para el transporte de voz.

El nombre `RealtimeSession` también identifica una entidad durable de PostgreSQL utilizada por la
API para ciclo de vida, límites, attribution, transcripts y cleanup. Esa entidad no depende del
servidor WebSocket retirado.

## Options considered

- Desplegar el servidor vacío para preservar la topología original: mantiene compatibilidad nominal,
  pero agrega costo, configuración y una superficie de red sin aportar comportamiento.
- Conservar el código sin desplegarlo: evita una eliminación inmediata, pero deja scripts, variables
  y documentación engañosos que pueden reintroducir el servicio por accidente.
- Retirar el runtime y preservar `RealtimeSession`: alinea el repositorio con la arquitectura usada y
  conserva el modelo durable necesario para las llamadas.

## Decision

Se elimina `apps/realtime`, sus scripts raíz, variables de entorno, configuración y dependencias. Se
retira también `OPENAI_REALTIME_MODEL`, que sólo respaldaba la alternativa de transporte propio y no
tenía consumidores. Se mantiene sin cambios el modelo `RealtimeSession` y sus repositorios.

La topología desplegable del MVP queda compuesta por Web, API, worker, PostgreSQL y almacenamiento de
objetos. Si en el futuro YUNI vuelve a requerir un gateway de audio propio, deberá diseñarse como una
decisión nueva a partir de necesidades medidas, sin revivir automáticamente este scaffold.

## Rationale

Eliminar el proceso evita pagar y operar un servicio sin usuarios ni responsabilidades. También
reduce configuración pública, dependencias directas y ambigüedad entre transporte WebSocket y la
entidad durable `RealtimeSession`. La conexión directa a providers es consistente con el MVP
ElevenLabs-first aceptado en el decision record `0002`.

## Implementation notes

- `pnpm dev` inicia Web, API y worker.
- Ya no existen `REALTIME_PORT`, `NEXT_PUBLIC_REALTIME_URL` ni `OPENAI_REALTIME_MODEL`.
- Los flujos individuales, compartidos, públicos y grupales siguen creando y finalizando filas
  `RealtimeSession` mediante la API.
- Los planes 32 a 34 se conservan como evidencia histórica con su estado actualizado.

## User/product impact

No cambia el comportamiento visible: los usuarios ya se conectaban directamente a los providers.
El despliegue necesita un servicio menos y tiene menos puntos de falla.

## Cost/UX/security tradeoffs

Se reduce costo y superficie de red. La contrapartida es que YUNI no inspecciona ni controla el audio
en tránsito como lo haría un gateway propio; esa limitación ya existía en la arquitectura vigente.

## Sources

- Búsqueda de referencias y grafo de imports del monorepo al 2026-08-24.
- `apps/web/hooks/useLiveAvatarSession.ts`.
- `apps/web/components/interact/GroupInteractCall.tsx`.
- Decision record `0002-plan-24a-elevenlabs-first-mvp-option.md`.

## Evidence to collect later

- Costos reales de infraestructura del MVP sin un proceso WebSocket dedicado.
- Incidentes o limitaciones que justifiquen incorporar un gateway de audio propio.

## Open questions

- Definir qué umbral de control, observabilidad o independencia del provider justificaría un nuevo
  servicio realtime.
