# Prompt: ElevenLabs Agent Provider Sync

Estado: implementado para MVP privado el 2026-06-08.

Alcance implementado:

- sync de contexto textual del avatar hacia ElevenLabs Agent
- `agentProvider`, `providerAgentId`, `providerSyncStatus`, `providerSyncError`, `providerSyncedAt`, `providerSyncFingerprint`
- provider server-side para create/update de ElevenLabs Agents
- LiveAvatar LITE session token con ElevenLabs Agent Connector
- endpoints privados:
  - `POST /avatars/:avatarId/agent-provider/sync`
  - `POST /avatars/:avatarId/voice-sessions`
  - `POST /voice-sessions/:realtimeSessionId/end`
- UI privada `/interact` y `/interact/[avatarId]`
- transcript local desde eventos del SDK y persistencia al cerrar la llamada

Fuera de alcance en esta implementacion:

- documentos reales y sync a ElevenLabs Knowledge Base
- RAG propio de YUNI
- llamadas publicas/share
- multiagente o llamadas entre N personas

Nota de integracion:

- El frontend usa `@heygen/liveavatar-web-sdk` con session token emitido por backend.
- El backend nunca expone API keys de ElevenLabs o LiveAvatar.
- El conector LiveAvatar + ElevenLabs requiere `LIVEAVATAR_ELEVENLABS_SECRET_ID` y que el agente entregue audio PCM 24 kHz.
- Guia operativa de setup y troubleshooting: [docs/integrations/elevenlabs-liveavatar-mvp.md](../integrations/elevenlabs-liveavatar-mvp.md).

Armame un plan especifico para implementar el spike/MVP ElevenLabs-first definido en `24A`.

Objetivo:
Permitir que YUNI cree o sincronice un ElevenLabs Agent por avatar publicado, manteniendo a YUNI como fuente de verdad de avatar, contexto, documentos, permisos y estado.

Contexto:

- `24A` define dos rutas validas: OpenAI/YUNI controlado y ElevenLabs-first.
- Para MVP de experiencia conversacional, ElevenLabs-first es la ruta recomendada si el spike confirma buena UX.
- LiveAvatar LITE documenta ElevenLabs Agent Connector para renderizar hosted voice agents.
- La primera etapa puede sincronizar contexto textual y luego documentos a ElevenLabs Knowledge Base.

Debe incluir:

- contrato de provider de agente:
  - `agentProvider`: elevenlabs_agents
  - `providerAgentId`
  - `contextSyncStatus`
  - `lastSyncedAt`
- adapter o service server-side para ElevenLabs Agents
- crear/actualizar agent desde avatar:
  - nombre
  - instrucciones/persona
  - contexto corto
  - voz configurada
  - reglas de respuesta breve y conversacional
- sincronizacion inicial de contexto textual del avatar
- preparacion para Knowledge Base/documentos:
  - `providerDocumentId`
  - `syncStatus`: pending | synced | failed | deleted
  - borrado/desasociacion cuando el documento se elimina en YUNI
- endpoint o accion privada para disparar sync de provider
- persistencia de errores resumidos sin guardar secretos
- tests con mocks de provider

Reglas:

- YUNI sigue siendo fuente de verdad
- no exponer ElevenLabs API keys al frontend
- no subir documentos privados, borrados o no publicados
- no bloquear todo el avatar si falla sync, pero mostrar estado claro
- no implementar RAG propio en este modulo
- no reemplazar la ruta OpenAI/LangChain documentada en `24A`
- no persistir payloads sensibles ni texto completo duplicado salvo que el plan de documentos lo justifique
- `ELEVENLABS_DEFAULT_VOICE_ID` queda como fallback legacy, no como requisito para avatars con voz ElevenLabs propia

Checklist:

- avatar propio puede sincronizar un ElevenLabs Agent
- sync guarda `providerAgentId`
- cambios de instrucciones/contexto pueden resincronizarse
- error de provider queda resumido y visible para soporte
- API keys nunca salen al cliente
- contratos quedan listos para LiveAvatar LITE + ElevenLabs Agent Connector
