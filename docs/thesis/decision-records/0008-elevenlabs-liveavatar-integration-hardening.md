# ElevenLabs + LiveAvatar Integration Hardening

## Status

accepted

## Related plan

`24B-elevenlabs-agent-provider-sync.md`

## Date

2026-06-13

## Context

La integracion MVP de ElevenLabs + LiveAvatar ya permitia crear avatars con voces de ElevenLabs e iniciar llamadas privadas. La review del diff encontro gaps de robustez: el default voice se estaba tratando como requisito global, se podia duplicar transcript al escuchar eventos de dos capas, algunas sesiones podian quedar abiertas y el backend podia confiar en metadata de voz enviada por el cliente si el catalogo fallaba.

## Options considered

- Dejar los gaps como deuda tecnica para despues de la demo.
- Resolver solo los errores visibles de llamada.
- Endurecer configuracion, metadata, transcript y cleanup antes de seguir con Knowledge Base.

## Decision

Endurecer la integracion ahora sin cambiar arquitectura. ElevenLabs Agent sigue siendo provider de conversacion y LiveAvatar LITE sigue renderizando la llamada, pero YUNI valida mejor la metadata, limpia sesiones y persiste transcript desde una sola fuente canonical.

## Rationale

Estos problemas afectan confiabilidad de demo, costo y calidad de datos. El cierre de sesiones evita consumo innecesario y estados inconsistentes. La metadata confiable evita que el frontend pueda inyectar nombres/descripciones de voces. El transcript sin duplicados deja conversaciones persistidas mas limpias para futuras features e informe de tesis.

## Implementation notes

- `ELEVENLABS_DEFAULT_VOICE_ID` pasa a ser fallback legacy, no requisito global.
- El catalogo de voces requiere API key, pero no default voice.
- Las voces nuevas de ElevenLabs deben validarse contra provider antes de persistir metadata.
- El transcript persistido usa eventos LiveAvatar finales, no passthrough ElevenLabs.
- Si LiveAvatar falla al iniciar sesion, YUNI marca la realtime session como `errored` y la conversation como `ended`.
- El frontend intenta cerrar sesiones en errores de start, desmontaje y `pagehide`.

## User/product impact

El creador puede usar el flujo nuevo sin configurar una voz default global. Las llamadas fallidas dejan menos estado basura y el historial queda sin turnos duplicados.

## Cost/UX/security tradeoffs

El cleanup en `pagehide` es best-effort y puede no completarse si el navegador mata la request. Aun asi reduce riesgo frente a no intentar cierre. Rechazar voces nuevas cuando ElevenLabs no responde puede bloquear temporalmente un save, pero evita guardar metadata no confiable.

## Sources

- https://docs.liveavatar.com/docs/lite-mode/connectors/elevenlabs-agent
- https://elevenlabs.io/docs/api-reference/voices/search

## Evidence to collect later

- Cantidad de sesiones `errored` o `active` luego de cierres inesperados.
- Si los eventos LiveAvatar finales cubren todos los casos de transcript necesarios.
- Frecuencia de errores de catalogo ElevenLabs durante create/edit.

## Open questions

- Conviene agregar un endpoint de heartbeat/cleanup para sesiones activas que nunca reciban cierre frontend?
