# ElevenLabs + LiveAvatar Private Call MVP

## Status

accepted

## Related plan

[24B-elevenlabs-agent-provider-sync.md](../../plan-prompts/24B-elevenlabs-agent-provider-sync.md)

## Date

2026-06-08

## Context

YUNI necesita validar temprano la experiencia principal de la tesis: un creador configura un avatar con contexto propio y luego puede conversar con ese avatar de forma fluida. Implementar primero OpenAI Realtime + LangChain + RAG propio da mas control, pero demora la validacion de UX de voz, interrupciones y avatar en vivo.

LiveAvatar LITE ofrece un ElevenLabs Agent Connector. ElevenLabs Agents ya resuelve STT, LLM/TTS, turn-taking, interrupciones y configuracion conversacional. El repo ya tenia avatar builder, seleccion visual de LiveAvatar y schema inicial de conversaciones/sesiones, pero no tenia `/interact` ni sesiones reales de voz.

## Options considered

1. Implementar OpenAI Realtime + LangChain + LiveAvatar como primera llamada real.
2. Implementar ElevenLabs Agent + LiveAvatar LITE como MVP privado.
3. Hacer solo un mock UI sin llamada real.

## Decision

Implementar un MVP privado ElevenLabs-first:

- YUNI mantiene avatar, contexto textual, permisos, conversaciones y estado de sync.
- ElevenLabs Agent funciona como provider conversacional sincronizado.
- LiveAvatar LITE renderiza el avatar y conecta con ElevenLabs usando el connector.
- La primera version soporta contexto textual, no documentos/Knowledge Base.

## Rationale

La prioridad del MVP es demostrar una conversacion natural con avatar, no completar todo el stack RAG. ElevenLabs reduce el riesgo de latencia, turn-taking e interrupciones, mientras que YUNI conserva la fuente de verdad y registra IDs externos no secretos para poder migrar o sumar providers despues.

El diseno deja preparada la evolucion hacia documentos y RAG propio: el sync queda aislado en `packages/voice`, LiveAvatar queda aislado en `packages/avatars`, y la API usa `Conversation`, `Message` y `RealtimeSession` existentes.

## Implementation notes

- Se agregaron env server-only para ElevenLabs y el secret id del connector LiveAvatar.
- `AvatarAgent` ahora guarda `agentProvider`, `providerAgentId`, `providerSyncStatus`, `providerSyncError`, `providerSyncedAt` y `providerSyncFingerprint`.
- `voiceConfig.provider` ahora acepta `openai` y `elevenlabs`; si el avatar sigue con voz OpenAI, el sync usa `ELEVENLABS_DEFAULT_VOICE_ID`.
- La API privada expone sync manual, start de voice session y cierre con transcript.
- El frontend agrega `/interact` y `/interact/[avatarId]` con `@heygen/liveavatar-web-sdk`.
- Las API keys nunca salen al browser; el cliente recibe solo session token de LiveAvatar y IDs no secretos.
- Ajuste posterior de integracion: el Agent de ElevenLabs debe configurarse explicitamente para LiveAvatar con audio input/output `pcm_24000`, LLM y TTS model definidos. Tambien se mejora el parser de errores para exponer mensajes anidados como `detail.message` y errores de validacion `data[]` sin guardar secretos.
- Ajuste posterior de sandbox: LiveAvatar puede rechazar ciertos avatares con `This avatar is not supported in sandbox mode`. YUNI mantiene `LIVEAVATAR_SANDBOX` explicito y no hace fallback automatico a `false`, porque eso consume creditos sin una decision consciente del equipo.
- Ajuste posterior de connector: la evidencia de ElevenLabs mostro ASR correcto (`source_medium: "audio"` y audio input mayor a cero), pero sin LLM/TTS (`tts output` en cero, `llm_usage` vacio y sin mensajes del agent). Se decide que el sync no puede reducir `conversation_config.conversation.client_events` a solo eventos de diagnostico. YUNI sincroniza `audio`, `user_transcript`, `agent_response`, `agent_response_correction`, `interruption`, `vad_score` y `conversation_initiation_metadata`, y mete esta configuracion en el fingerprint para forzar patch del Agent existente cuando cambie el contrato del connector.

## User/product impact

El creador puede probar una llamada privada con su avatar sin esperar a share publico, documentos ni RAG propio. Esto permite medir si la experiencia de voz/avatar es convincente y si el contexto textual alcanza para una demo de tesis.

## Cost/UX/security tradeoffs

- UX: mejora la probabilidad de una conversacion fluida temprano por turn-taking e interrupciones ya resueltas en ElevenLabs.
- Costo: se acumulan costos de ElevenLabs Agent/LLM y LiveAvatar LITE. Falta medir costo real por minuto.
- Costo: usar `LIVEAVATAR_SANDBOX=false` permite probar avatares no compatibles con sandbox, pero consume creditos de LiveAvatar.
- Seguridad: el contexto textual se duplica en ElevenLabs. Se mitiga manteniendo sync server-side, sin exponer secrets, y dejando documentos fuera del MVP.
- Lock-in: se reduce con contratos de provider y fingerprint de sync; YUNI sigue siendo fuente de verdad.

## Sources

- LiveAvatar LITE overview: https://docs.liveavatar.com/docs/lite-mode/overview
- LiveAvatar ElevenLabs Agent Connector: https://docs.liveavatar.com/docs/lite-mode/connectors/elevenlabs-agent
- LiveAvatar FULL Mode Events: https://docs.liveavatar.com/docs/full-mode/events
- LiveAvatar Sessions API: https://docs.liveavatar.com/reference/sessions
- ElevenLabs LiveAvatar Integration: https://elevenlabs.io/docs/eleven-agents/guides/integrations/live-avatar
- ElevenLabs Client Events: https://elevenlabs.io/docs/eleven-agents/customization/events/client-events
- ElevenLabs Agents overview: https://elevenlabs.io/docs/eleven-agents/overview
- ElevenLabs Agents API: https://elevenlabs.io/docs/eleven-agents/api-reference/agents/create
- ElevenLabs Conversation Flow: https://elevenlabs.io/docs/eleven-agents/customization/conversation-flow
- OpenAI Voice Agents: https://developers.openai.com/api/docs/guides/voice-agents

## Evidence to collect later

- Latencia percibida de primera respuesta y turn-taking.
- Costo por minuto real combinando ElevenLabs y LiveAvatar.
- Calidad de interrupciones en una demo con avatar real.
- Calidad de respuestas usando solo contexto textual.
- Capturas o video corto de la llamada privada funcionando.
- Conversacion posterior al ajuste de `client_events` con `asr_usage.total_audio_input_seconds > 0`, `tts_usage.total_audio_output_seconds > 0` y al menos un mensaje del agent en transcript.

## Open questions

- Conviene sincronizar documentos a ElevenLabs Knowledge Base antes de implementar RAG propio?
- Que granularidad de usage/costos expone ElevenLabs para alimentar dashboard?
- Cuando promover OpenAI Realtime + LangChain a provider alternativo o premium?
