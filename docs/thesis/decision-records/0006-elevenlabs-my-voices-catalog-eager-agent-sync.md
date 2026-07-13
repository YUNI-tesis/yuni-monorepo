# ElevenLabs My Voices Catalog + Eager Agent Sync

## Status

superseded

## Related plan

`13-voice-selector-config.md`, `24B-elevenlabs-agent-provider-sync.md`

## Date

2026-06-12

Superseded by [0009-product-navigation-sharing-background-sync.md](0009-product-navigation-sharing-background-sync.md).

Nota: la seleccion de voces reales de ElevenLabs sigue vigente. Lo supercedido es la decision de tratar el sync eager al guardar como comportamiento principal visible de producto. La direccion actual mueve la sincronizacion de Agent/Knowledge Base a background jobs con reintentos automaticos y estados de producto discretos.

## Context

El MVP de llamada privada con LiveAvatar LITE + ElevenLabs ya funciona, pero el flujo de alta todavia dependia de voces locales/hardcodeadas. Para que el creador pueda completar el recorrido desde crear avatar hasta llamar, YUNI necesita listar voces reales de ElevenLabs, persistir una voz valida y crear el Agent antes de llegar a `/interact`.

LiveAvatar no crea ni administra el ElevenLabs Agent: el conector LITE recibe `secret_id` y `agent_id`. Por eso YUNI debe seguir siendo fuente de verdad y encargarse de sincronizar el Agent.

## Options considered

1. Mantener voces locales y sincronizar al iniciar llamada.
2. Listar `My Voices` desde ElevenLabs y sincronizar el Agent al guardar.
3. Exponer ElevenLabs directamente al browser.

## Decision

Usar `My Voices` de ElevenLabs como catalogo real server-side y crear/actualizar el ElevenLabs Agent al guardar avatar. El frontend recibe solo voces normalizadas y nunca la API key.

## Rationale

La opcion elegida reduce errores tardios: el creador sabe durante el alta si tiene voces disponibles y el avatar queda listo para probar apenas termina el wizard. Tambien mantiene la arquitectura segura porque el backend valida `voiceId`, rehidrata metadata confiable y conserva las API keys fuera del browser.

## Implementation notes

- `GET /voice-providers/elevenlabs/voices` lista voces con `voice_type=saved`.
- El wizard y la edicion usan el mismo catalogo.
- Una voz nueva que no existe en `My Voices` se rechaza con `400` si ElevenLabs responde correctamente.
- Si falla la sincronizacion del Agent, el avatar se conserva con `providerSyncStatus="failed"`.
- El inicio de llamada conserva auto-sync como segunda defensa si cambia el fingerprint.

## User/product impact

El usuario puede completar el flujo principal sin salir de YUNI: elegir avatar visual, elegir voz real, guardar y llamar. Los errores de configuracion aparecen antes y con estado persistido.

## Cost/UX/security tradeoffs

- UX: guardar puede tardar mas porque intenta crear o parchear el Agent.
- Seguridad: no se exponen API keys ni payloads crudos de ElevenLabs al browser.
- Operacion: si ElevenLabs esta degradado, el avatar no se pierde, pero queda visible como sync fallido.

## Sources

- https://docs.liveavatar.com/docs/lite-mode/connectors/elevenlabs-agent
- https://elevenlabs.io/docs/eleven-agents/overview
- https://elevenlabs.io/docs/api-reference/voices/search
- https://elevenlabs.io/docs/api-reference/agents/create
- https://elevenlabs.io/docs/api-reference/agents/update

## Evidence to collect later

- Tiempo promedio de guardado con sync eager.
- Porcentaje de avatars creados con `providerSyncStatus="failed"`.
- Si `voice_type=saved` cubre todas las voces que los creadores esperan ver.

## Open questions

- Si conviene permitir filtros por workspace/default voices cuando el usuario no tiene voces guardadas.
- Si el preview debe evolucionar a reproductor con waveform o mantener boton simple.
