# ElevenLabs Knowledge Base Context Sync

## Status

accepted

## Related plan

`24C-elevenlabs-knowledge-base-context-sync.md`, `28-s3-storage-adapter.md`, `29-document-upload-api.md`, `31-rag-retriever-integration.md`

## Date

2026-06-12

## Context

YUNI ya tiene un MVP de llamada privada con LiveAvatar LITE + ElevenLabs Agents. Hasta ahora el Agent recibe contexto textual dentro del prompt sincronizado por YUNI. La siguiente feature de producto es que el creador pueda subir texto y documentos para que el avatar los use durante la conversacion.

ElevenLabs Agents ofrece Knowledge Base como mecanismo propio para que sus Agents consulten documentos. LiveAvatar LITE Connector no necesita recibir esos documentos: solo usa el `agent_id` de ElevenLabs y el secret configurado en LiveAvatar.

## Options considered

- Mantener todo el contexto dentro del prompt del Agent.
- Sincronizar contexto y documentos a ElevenLabs Knowledge Base.
- Construir primero RAG propio en YUNI y recien despues conectar ese contexto a voz.

## Decision

Usar ElevenLabs Knowledge Base como mecanismo provider-first para el MVP conversacional, empezando por sincronizar el contexto textual del avatar y luego documentos subidos por el creador.

YUNI sigue siendo la fuente de verdad. La Knowledge Base de ElevenLabs es una proyeccion sincronizada para llamadas con ElevenLabs Agents. El RAG propio de YUNI queda como etapa posterior para independencia de provider y otros canales.

## Rationale

La prioridad actual es que la conversacion con el avatar sea fluida y pueda usar contexto real del creador. Knowledge Base reduce el trabajo necesario para llegar a una demo defendible con documentos, porque evita implementar embeddings, retriever, ranking y armado de prompts propios antes de validar el valor de producto.

Construir RAG propio sigue siendo valioso, pero hacerlo antes de aprovechar la KB nativa de ElevenLabs retrasa la experiencia de voz que hoy es el mayor riesgo tecnico y de producto.

## Implementation notes

- Crear `24C-elevenlabs-knowledge-base-context-sync.md`.
- Sincronizar primero `AvatarAgent.context` con `POST /v1/convai/knowledge-base/text`.
- Para archivos, usar `POST /v1/convai/knowledge-base/file` desde backend/worker despues de `28` y `29`.
- Asociar solo documentos `synced` al Agent.
- Incluir referencias de Knowledge Base en el fingerprint del Agent.
- No subir documentos grandes durante el inicio de llamada.
- Mantener `pcm_24000`, `text_only=false` y `client_events` completos para el connector de LiveAvatar.

## User/product impact

El creador va a poder cargar documentos y probar una llamada donde el avatar contesta usando ese material. En UX, esto debe presentarse como "contexto del avatar", no como una configuracion tecnica de ElevenLabs.

Si falla la sincronizacion provider, el avatar y los documentos locales se conservan. La UI debe mostrar estado y permitir reintentar.

## Cost/UX/security tradeoffs

Ventaja: acelera el MVP de contexto real para voz.

Costo: duplica contexto del creador en un provider externo.

Riesgo: la calidad, limites e indexacion dependen de ElevenLabs.

Mitigacion: mantener YUNI como fuente de verdad, registrar estados de sync, permitir cleanup y conservar el plan de RAG propio para independencia futura.

## Sources

- https://docs.liveavatar.com/docs/lite-mode/connectors/elevenlabs-agent
- https://elevenlabs.io/docs/eleven-agents/overview
- https://elevenlabs.io/docs/eleven-agents/customization/knowledge-base
- https://elevenlabs.io/docs/eleven-agents/api-reference/knowledge-base/create-from-text
- https://elevenlabs.io/docs/eleven-agents/api-reference/knowledge-base/create-from-file
- https://elevenlabs.io/docs/eleven-agents/api-reference/knowledge-base/update
- https://elevenlabs.io/docs/eleven-agents/api-reference/knowledge-base/compute-rag-index

## Evidence to collect later

- Tiempo entre upload de documento y disponibilidad en llamada.
- Calidad de respuestas en espanol con documentos largos.
- Costo real por uso de Knowledge Base e indexacion.
- Comportamiento al borrar documentos sincronizados.
- Limites de formatos y tamanos que impactan el MVP.

## Open questions

- Conviene usar `e5_mistral_7b_instruct` o `multilingual_e5_large_instruct` para mejor recuperacion en espanol?
- ElevenLabs debe recibir el archivo original o texto extraido por YUNI para cada tipo de documento?
- Que documentos se pueden usar en avatars publicos cuando llegue share/public?
