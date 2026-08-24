# Prompt: Agent Voice Architecture Y Context Contract

> Actualización 2026-08-24: la Ruta B, ElevenLabs-first con LiveAvatar, es la arquitectura vigente.
> La Ruta A y su `apps/realtime` propio quedan como alternativa histórica, no como infraestructura a
> desplegar. Ver decision record `0021`.

Armame un plan especifico para definir el contrato de agente AI, contexto personalizado y voz realtime en YUNI.

Objetivo:
Dejar decidida la arquitectura que conecta avatares configurados en YUNI con un agente de voz, contexto personalizado del creador, Live Avatar LITE sandbox y providers posibles: OpenAI Realtime/LangChain o ElevenLabs Agents.

Decision vigente 2026-06-19:

- La direccion de producto se rige por `0009-product-navigation-sharing-background-sync.md`.
- `Mis avatares` es el centro operativo y `Interactuar` es una accion contextual sobre un avatar.
- Las sesiones publicas deben identificar al participante por email y vincular cuenta si existe.
- Los usuarios compartidos autenticados acceden por grants/invitaciones activos.
- La sincronizacion de Agent/Knowledge Base es background con jobs, fingerprints, backoff y reintentos automaticos.
- Los endpoints de force-sync quedan para soporte/dev/admin o fallback interno; no son CTA principal de usuario.
- La UI habla de `contexto` y `documentos`, no de Knowledge Base, provider sync ni IDs externos.

Este modulo no implementa la llamada completa. Define contratos, responsabilidades, opciones de provider y criterios para que `24`, `31`, `32`, `33` y `34` se implementen sin redisenar el loop de voz.

Fuentes base:

- Live Avatar LITE Mode Overview:
  https://docs.liveavatar.com/docs/lite-mode/overview
  - LITE solo renderiza video a partir del audio.
  - YUNI maneja STT, LLM, TTS y orquestacion.
  - LITE es el modo correcto cuando queremos control fino y un stack conversacional propio.
- Live Avatar LITE Integration Paths:
  https://docs.liveavatar.com/docs/lite-mode/integration-paths
  - LiveAvatar documenta conectores para hosted voice agents.
  - Si ya existe un ElevenLabs voice agent, la ruta recomendada es ElevenLabs Agent Connector.
  - Si ya existe OpenAI Realtime, la ruta recomendada es OpenAI Realtime Connector.
- OpenAI Voice Agents:
  https://developers.openai.com/api/docs/guides/voice-agents
  - Para conversacion natural, baja latencia, barge-in y turn taking, usar speech-to-speech con live audio sessions.
  - En TypeScript, el camino recomendado para browser voice assistant es `RealtimeAgent` + `RealtimeSession`.
  - Tools, handoffs y guardrails viven en la definicion del agente; transporte de audio vive en la sesion.
- OpenAI Realtime and audio:
  https://developers.openai.com/api/docs/guides/realtime
  - Usar voice-agent session cuando el modelo debe responder, llamar tools y manejar estado conversacional.
  - Realtime sessions mantienen una conexion abierta para enviar audio, recibir eventos y actualizar estado.
- OpenAI Realtime Prompting:
  https://developers.openai.com/api/docs/guides/realtime-models-prompting
  - Definir reglas explicitas de tools, preambulos, silencio/background audio, audio poco claro, longitud de respuesta y rephrasing para voz.
  - Mantener tool specs sincronizadas con las instrucciones para evitar tools inventadas o acciones simuladas.
- OpenAI Realtime Conversations:
  https://developers.openai.com/api/docs/guides/realtime-conversations
  - Contemplar interrupcion, cancelacion, truncation y persistencia coherente.
  - Con WebSocket, el cliente/bridge debe cortar playback y truncar la parte no reproducida cuando hay interrupcion.
- ElevenLabs Agents:
  https://elevenlabs.io/docs/eleven-agents/overview
  - ElevenLabs Agents incluye STT, LLM configurable, TTS, turn-taking, interrupciones, Knowledge Base/RAG, tools, widget, SDKs, analytics y testing.
  - Es una opcion fuerte cuando la prioridad es lograr UX conversacional fluida rapidamente.
- ElevenLabs WebSocket API:
  https://elevenlabs.io/docs/eleven-agents/libraries/web-sockets
  - Permite conversaciones realtime con agentes, audio input/output, transcripts, agent responses y contextual updates.
- ElevenLabs Custom LLM:
  https://elevenlabs.io/docs/eleven-agents/customization/llm/custom-llm
  - Permite que ElevenLabs maneje voz/turn-taking y que YUNI exponga un endpoint OpenAI-compatible para controlar razonamiento, tools y RAG propios.
- ElevenLabs Agents Pricing:
  https://elevenlabs.io/pricing/agents
  - El costo principal de ElevenLabs Agents se expresa por minutos incluidos/adicionales y concurrencia.
  - El costo de LLM se cobra aparte segun modelo/uso, por lo que debe medirse en escenarios reales.

Debe incluir:

- decision de arquitectura principal:
  - OpenAI Realtime como loop de voz principal para baja latencia
  - LangChain como capa de agente, tools, retrieval, memoria y supervisor cuando haga falta
  - Live Avatar LITE como renderer visual de audio, no como cerebro conversacional
- opcion argumentada ElevenLabs-first:
  - ElevenLabs Agents como agente conversacional hosted para MVP/spike de UX
  - Live Avatar LITE como renderer visual conectado por ElevenLabs Agent Connector
  - YUNI como fuente de verdad de creadores, avatares, documentos, permisos y estado de sincronizacion
  - documentos/contexto del creador sincronizados hacia ElevenLabs Knowledge Base en la primera etapa
  - evolucion posterior a ElevenLabs Custom LLM apuntando a YUNI cuando se quiera conservar RAG y razonamiento bajo control propio
- decision de fallback:
  - pipeline encadenado STT -> LangChain/text agent -> TTS -> Live Avatar solo como fallback o etapa demo
  - no usar el pipeline encadenado como arquitectura principal si el objetivo es conversacion fluida
- matriz de decision:
  - comparar OpenAI Realtime/LangChain vs ElevenLabs Agents vs pipeline encadenado
  - ponderar calidad UX, velocidad de integracion, control de contexto, seguridad, observabilidad, costos, lock-in y valor para la tesis
- contrato `AvatarAgentRuntimeConfig`
- contrato de prompt builder para texto y voz
- contrato de tools expuestas al agente realtime
- tool read-only `retrieve_avatar_context`
- tool no-op `wait_for_user`
- politica para contexto textual corto vs documentos subidos
- politica para RAG sin exponer documentos al publico
- protocolo conceptual de `apps/realtime`
- puente conceptual OpenAI Realtime -> Live Avatar LITE
- persistencia de transcript y mensajes interrumpidos
- identidad efectiva de sesion:
  - owner privado
  - usuario compartido con grant activo
  - participante publico con `participantEmail` y `participantUserId?`
- manejo de preambulos, silencio, audio poco claro e interrupciones
- dependencias exactas con los modulos existentes

Decision tecnica obligatoria:

- El plan debe separar dos rutas validas:
  - Ruta A, control YUNI/OpenAI: `apps/realtime` maneja una sesion OpenAI Realtime server-side y una sesion Live Avatar LITE por token/sesion del provider.
  - Ruta B, ElevenLabs-first: YUNI crea/actualiza un ElevenLabs Agent por avatar publicado, sincroniza contexto/documentos hacia ElevenLabs Knowledge Base y Live Avatar LITE usa ElevenLabs Agent Connector para renderizar la conversacion.
- Para MVP orientado a validar experiencia conversacional, la Ruta B debe considerarse opcion recomendada si el spike confirma baja latencia, interrupciones correctas, buena calidad en espanol y costos aceptables.
- Para producto con mayor control de RAG, tools y trazabilidad, la Ruta A o la evolucion Ruta B con ElevenLabs Custom LLM apuntando a YUNI debe quedar como objetivo de arquitectura mas controlada.
- El frontend no llama a OpenAI con secretos ni a Live Avatar con API key. Solo usa tokens efimeros/short-lived emitidos por YUNI.
- El frontend no expone ElevenLabs API keys. Si usa agent IDs, signed URLs o tokens, deben ser emitidos por YUNI o por el flujo seguro recomendado por el provider.
- El frontend usa el SDK web de Live Avatar o el embed/session recomendado para conectar la sesion LITE y renderizar el video.
- En Ruta A, el audio del usuario fluye por el canal realtime de YUNI hacia OpenAI Realtime.
- En Ruta A, el audio de salida del modelo se normaliza para Live Avatar LITE y se envia al avatar como audio streaming.
- En Ruta A, cuando OpenAI detecta speech del usuario durante una respuesta, YUNI debe cancelar/truncar la respuesta en OpenAI y mandar interrupt a Live Avatar.
- En Ruta B, interrupciones, turn-taking y audio loop quedan delegados principalmente a ElevenLabs/LiveAvatar connector, pero YUNI debe persistir eventos/transcripts disponibles y reflejar estado de sesion.
- El modelo realtime debe usar `OPENAI_REALTIME_MODEL` desde config; no hardcodear modelos salvo en tests. Si el default actual queda viejo, el modulo que implemente config debe actualizarlo contra docs oficiales.
- El provider de agente/voz debe ser configurable por avatar o entorno, no hardcodeado.

Contratos requeridos:

- `AvatarAgentRuntimeConfig`
  - `avatarId`
  - `ownerId`, `participantUserId?` o public session identity segun modo
  - `participantEmail?`
  - `accessGrantId?`
  - `shareLinkId?`
  - `publicSessionId?`
  - `conversationId`
  - `visibility`: private | shared | public
  - `instructions`
  - `baseContext`
  - `voiceConfig`
  - `liveAvatarConfig`
  - `realtimeConfig`
  - `agentProvider`: openai_realtime | elevenlabs_agents | chained_pipeline
  - `providerAgentId` opcional para hosted agents como ElevenLabs
  - `contextSyncStatus` opcional para providers que requieran Knowledge Base externa
  - `availableTools`
- `buildAvatarAgentInstructions(input)`
  - incluye identidad y objetivo del avatar
  - incluye instrucciones/persona del creador
  - incluye contexto textual corto si existe
  - incluye reglas de uso de documentos via retrieval
  - incluye reglas para no inventar cuando el contexto no alcanza
  - incluye reglas de voz: respuestas breves, conversacionales y aptas para audio
  - incluye reglas de audio poco claro
  - incluye reglas de silencio/background audio
  - incluye reglas de preambulos
  - incluye reglas de interrupcion
- `retrieve_avatar_context`
  - input: `query`, `avatarId`, `conversationId`, `maxChunks`
  - output: JSON estable con `chunks`, `sourceCount`, `hasRelevantContext`, `answerGuidance`
  - read-only, sin efectos externos
  - solo devuelve chunks del avatar autorizado
  - no devuelve `storageKey`, owner data, prompts privados ni texto completo de documentos
- `wait_for_user`
  - tool sin argumentos
  - se usa cuando hay silencio, ruido, audio de fondo o habla no dirigida al agente
  - no genera respuesta hablada despues de llamarla

Politica de contexto:

- `AvatarAgent.context` se trata como contexto base corto y puede entrar en instrucciones si no infla demasiado el prompt.
- Documentos subidos se consultan por retrieval, no se pegan completos en el prompt.
- El agente debe llamar `retrieve_avatar_context` antes de responder preguntas facticas que dependan del material del creador.
- Si retrieval no encuentra contexto suficiente, el agente debe decirlo de forma breve y no inventar.
- En publico, el visitante puede beneficiarse del RAG, pero nunca ver chunks, documentos, prompts, storage keys ni datos internos.
- En publico, el participante debe tener `participantEmail`; IP/session id sirven para antifraude, no como identidad principal de producto.
- En compartido autenticado, el usuario solo puede consultar avatares y conversaciones cubiertos por un grant activo.
- En Ruta B ElevenLabs-first, YUNI sigue siendo fuente de verdad: los documentos se cargan, listan, eliminan y auditan en YUNI.
- En Ruta B inicial, YUNI sincroniza el contexto publicado hacia ElevenLabs Knowledge Base y guarda metadata del provider:
  - `provider`: elevenlabs
  - `providerAgentId`
  - `providerDocumentId` si aplica
  - `syncStatus`: pending | synced | failed | deleted
  - `lastSyncedAt`
- En Ruta B, la sincronizacion se dispara en background al crear/editar avatar, confirmar documentos o borrar contexto. No debe depender de una accion manual visible.
- Si falla la sincronizacion pero existe una version previa usable, la llamada puede continuar con aviso discreto.
- Si un documento se elimina o despublica en YUNI, el plan debe exigir eliminarlo/desasociarlo tambien del provider externo.
- La sincronizacion con ElevenLabs es aceptable para MVP porque valida rapido la feature de contexto del creador, pero se debe documentar como duplicacion controlada de datos.
- La evolucion preferida para mayor control es ElevenLabs Custom LLM: ElevenLabs conserva voz/turn-taking y consulta un endpoint de YUNI que ejecuta RAG propio.

Politica de voz:

- Respuestas directas: 1-2 frases cortas.
- Preguntas aclaratorias: una sola pregunta por turno.
- Tool lookup perceptible: preambulo corto solo cuando evita sensacion de latencia.
- Audio poco claro: pedir repeticion breve, no inferir ni llamar tools.
- Silencio/background audio: llamar `wait_for_user`, sin hablar.
- Tool failures: explicar brevemente, no exponer errores raw, ofrecer siguiente paso.
- Rephrasing: si un supervisor/text agent devuelve una respuesta larga, el realtime responder debe convertirla en una respuesta oral breve.

Protocolo conceptual realtime:

- `session.init`
  - valida auth privada o token de sesion publica
  - valida ownership, grant activo o share link activo con participante identificado por email
  - crea/usa `Conversation`
  - crea `RealtimeSession`
  - crea token Live Avatar LITE
  - crea sesion OpenAI Realtime
  - devuelve estado inicial y token Live Avatar para el SDK web
- `user.audio.delta`
  - recibe audio del navegador
  - forward a OpenAI Realtime
- `agent.audio.delta`
  - recibe audio del modelo
  - normaliza formato para Live Avatar LITE
  - envia audio al avatar
  - opcionalmente informa captions/status al frontend
- `agent.transcript.delta` y `agent.transcript.done`
  - actualiza UI y prepara persistencia
- `user.transcript.done`
  - persiste mensaje user si corresponde
- `agent.interrupted`
  - marca respuesta parcial
  - corta audio pendiente
  - manda interrupt a Live Avatar
- `session.end`
  - cierra OpenAI Realtime
  - cierra Live Avatar session
  - marca `RealtimeSession` ended/errored
  - persiste mensajes finales y usage

Protocolo conceptual ElevenLabs-first:

- `provider.agent.sync`
  - se ejecuta en background al crear, publicar o actualizar avatar/contexto
  - crea o actualiza ElevenLabs Agent
  - sincroniza instrucciones, contexto corto, voz y Knowledge Base
  - persiste `providerAgentId`, `syncStatus`, errores resumidos y `lastSyncedAt`
  - usa fingerprints, deduplicacion y retry con backoff
  - no se expone como accion principal de usuario
- `provider.document.sync`
  - se ejecuta en background al subir, actualizar, publicar o borrar documentos
  - sincroniza documentos permitidos con ElevenLabs Knowledge Base
  - guarda `providerDocumentId` si el provider lo devuelve
  - no expone storage keys ni documentos privados al visitante publico
  - reintenta automaticamente fallos transitorios
- `session.init`
  - valida auth privada o token de sesion publica
  - valida ownership, grant activo o share link activo con `participantEmail`
  - valida que el avatar tenga `providerAgentId` sincronizado
  - crea/usa `Conversation`
  - crea sesion Live Avatar LITE usando ElevenLabs Agent Connector o el flujo seguro equivalente
  - devuelve estado inicial, token/session data y provider seleccionado
- `session.events`
  - consume eventos disponibles de LiveAvatar/ElevenLabs
  - persiste transcripts finales cuando esten disponibles
  - registra interrupciones, errores, duracion y usage aproximado/real si el provider lo expone
- `session.end`
  - cierra sesion Live Avatar
  - marca `RealtimeSession` ended/errored
  - persiste mensajes finales, transcript y usage disponible

Persistencia:

- Guardar mensajes finales de user y assistant en `Message`.
- Si una respuesta fue interrumpida, guardar metadata:
  - `interrupted: true`
  - `providerItemId`
  - `audioPlayedMs` si esta disponible
  - `truncated: true`
- No persistir chunks de audio.
- No persistir secrets, tokens efimeros ni API keys.
- Registrar usage en modulo `27` usando `RealtimeSession`, `Conversation`, `PublicSession` y `ShareLink` cuando aplique.
- Para providers hosted como ElevenLabs, persistir IDs externos no secretos (`providerAgentId`, `providerConversationId`, `providerDocumentId`) solo cuando sean necesarios para sincronizacion, auditoria o soporte.
- Persistir `syncStatus` y errores resumidos de sincronizacion sin exponer payloads sensibles.
- Persistir retries/attempts/nextRetryAt cuando el sync corra por jobs.

Argumento de opcion ElevenLabs-first:

- Ventaja principal: reduce riesgo de UX porque ElevenLabs ya resuelve STT, TTS, turn-taking, interrupciones, Knowledge Base/RAG, widget/SDKs, analytics y testing.
- Ventaja para tesis: permite mostrar antes un producto convincente con avatares conversacionales y contexto personalizado cargado por el creador.
- Ventaja de integracion: LiveAvatar documenta ElevenLabs Agent Connector, por lo que no hace falta construir desde cero todo el bridge realtime para validar la experiencia.
- Costo de la opcion: YUNI duplica contexto/documentos en un provider externo y depende de sus capacidades de RAG, eventos, costos y data retention.
- Mitigacion: YUNI conserva la fuente de verdad, permisos, borrado, metadata y sincronizacion; el provider es intercambiable por contrato.
- Evolucion: cuando el RAG propio este listo, migrar a ElevenLabs Custom LLM o Ruta A OpenAI/LangChain para recuperar control fino sin perder UX de voz.

Dependencias:

- Antes de voz productiva:
  - `18-interact-shell-ui`
  - `19-private-conversations-api`
  - `24-openai-adapter-prompt-builder`, actualizado con este contrato
  - `25-private-text-chat-api` para validar agente por texto
- Para spike/MVP ElevenLabs-first:
  - `13-voice-selector-config`, actualizado para permitir provider ElevenLabs real
  - `14-documents-filedrop-shell` o un flujo minimo equivalente de contexto/documentos
  - un modulo nuevo o ajuste de `24A/24/32` para provider agent sync con ElevenLabs
  - persistencia minima de `providerAgentId`, `providerDocumentId`, `syncStatus` y errores resumidos
- Para contexto personalizado real:
  - `28-s3-storage-adapter`
  - `29-document-upload-api`
  - `30-document-ingestion-worker`
  - `31-rag-retriever-integration`
- Para voz:
  - `32-realtime-service-foundation`, actualizado con este protocolo
  - `33-realtime-private-voice`
  - `34-realtime-public-voice`

Reglas:

- no llamar OpenAI desde UI con secretos persistentes
- no llamar ElevenLabs desde UI con API keys persistentes
- no exponer prompts/contexto/documentos en rutas publicas
- no permitir sesiones publicas sin email de participante
- no usar Live Avatar FULL mode como arquitectura principal si YUNI necesita controlar contexto y provider
- no depender de que Live Avatar haga STT/LLM/TTS en LITE; si se usa ElevenLabs-first, esa responsabilidad vive en ElevenLabs Agents y debe quedar explicitada
- no hardcodear modelos OpenAI en codigo de producto
- no meter documentos completos en instrucciones de sesion realtime
- no sincronizar documentos borrados, privados o no publicados hacia providers externos
- no mostrar controles tecnicos de force-sync como flujo normal de producto
- no implementar multiagente/grupos en este modulo
- no implementar vector DB avanzada salvo que `31` lo decida explicitamente
- mantener el contrato compatible con chat texto y voz

Checklist:

- queda claro quien maneja STT/LLM/TTS, quien maneja RAG y quien renderiza video en cada ruta
- queda claro como el agente usa contexto personalizado del creador
- queda claro como se sincroniza contexto a ElevenLabs en la opcion MVP y como se revierte/elimina
- queda claro como se conectan LangChain y OpenAI Realtime
- queda claro como se conectan ElevenLabs Agents y LiveAvatar LITE
- queda claro como se interrumpe una respuesta en OpenAI y Live Avatar
- queda claro que en ElevenLabs-first las interrupciones quedan delegadas al provider/connector y YUNI persiste lo observable
- queda claro que datos se persisten y cuales no
- queda claro como se identifica a owner, usuario compartido y participante publico
- queda claro que la sincronizacion provider es background y resiliente
- queda claro que rutas/modulos deben existir antes de implementar voz
- los planes `24`, `31`, `32`, `33` y `34` quedan actualizables contra este contrato
