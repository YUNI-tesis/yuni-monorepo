# Prompt: ElevenLabs Agent Provider Background Sync

Estado: implementado para MVP privado el 2026-06-08; refactorizado conceptualmente el 2026-06-19 por `0009-product-navigation-sharing-background-sync.md`.

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

Refactor de producto vigente:

- La sincronizacion del Agent no debe ser una accion principal del usuario.
- El endpoint `POST /avatars/:avatarId/agent-provider/sync` queda como herramienta de soporte/dev/admin o fallback interno.
- Crear/editar avatar, cambiar voz/contexto y subir/borrar documentos deben encolar o disparar sync background.
- El inicio de llamada puede hacer una verificacion defensiva liviana, pero no debe subir documentos grandes ni convertir sync en un paso visible.
- La UI normal solo muestra estados de producto cuando importan:
  - contexto listo
  - contexto procesando
  - no se pudo actualizar contexto
- Si existe una version previa valida del Agent/contexto, una llamada no debe bloquearse por un fallo no critico de sync.

Objetivo:
Permitir que YUNI mantenga un ElevenLabs Agent por avatar, manteniendo a YUNI como fuente de verdad de avatar, contexto, documentos, permisos y estado, con sync silencioso y reintentos automaticos.

Debe incluir:

- contrato de provider de agente:
  - `agentProvider`: elevenlabs_agents
  - `providerAgentId`
  - `providerSyncStatus`
  - `providerSyncError`
  - `providerSyncedAt`
  - `providerSyncFingerprint`
- adapter o service server-side para ElevenLabs Agents
- crear/actualizar agent desde avatar:
  - nombre
  - instrucciones/persona
  - contexto corto
  - voz configurada
  - reglas de respuesta breve y conversacional
- job o servicio de background sync con:
  - fingerprint
  - deduplicacion
  - retry con backoff
  - errores resumidos sin secrets
- preparacion para Knowledge Base/documentos:
  - `providerDocumentId`
  - `syncStatus`: pending | syncing | synced | failed | deleting | deleted
  - borrado/desasociacion cuando el documento se elimina en YUNI
- tests con mocks de provider

Reglas:

- YUNI sigue siendo fuente de verdad
- no exponer ElevenLabs API keys al frontend
- no subir documentos privados, borrados o no confirmados
- no bloquear todo el avatar si falla sync
- no implementar RAG propio en este modulo
- no reemplazar la ruta OpenAI/LangChain documentada en `24A`
- no persistir payloads sensibles ni texto completo duplicado salvo que el plan de documentos lo justifique
- `ELEVENLABS_DEFAULT_VOICE_ID` queda como fallback legacy, no como requisito para avatars con voz ElevenLabs propia
- no mostrar botones de sync como CTA principal en producto

Checklist:

- avatar propio puede crear/actualizar Agent por background sync
- sync guarda `providerAgentId`
- cambios de instrucciones/contexto encolan resincronizacion
- error de provider queda resumido y visible solo cuando es accionable
- API keys nunca salen al cliente
- contratos quedan listos para LiveAvatar LITE + ElevenLabs Agent Connector
