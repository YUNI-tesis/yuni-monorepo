# Prompt: Agent Voice Architecture Y Context Contract

Armame un plan especifico para definir el contrato de agente AI, contexto personalizado y voz realtime en YUNI.

Objetivo:
Dejar decidida la arquitectura que conecta avatares configurados en YUNI con un agente OpenAI/ LangChain, contexto personalizado del creador, OpenAI Realtime Voice Agents y Live Avatar LITE sandbox.

Este modulo no implementa la llamada completa. Define contratos, responsabilidades y criterios para que `24`, `31`, `32`, `33` y `34` se implementen sin redisenar el loop de voz.

Fuentes base:

- Live Avatar LITE Mode Overview:
  https://docs.liveavatar.com/docs/lite-mode/overview
  - LITE solo renderiza video a partir del audio.
  - YUNI maneja STT, LLM, TTS y orquestacion.
  - LITE es el modo correcto cuando queremos control fino y un stack conversacional propio.
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

Debe incluir:

- decision de arquitectura principal:
  - OpenAI Realtime como loop de voz principal para baja latencia
  - LangChain como capa de agente, tools, retrieval, memoria y supervisor cuando haga falta
  - Live Avatar LITE como renderer visual de audio, no como cerebro conversacional
- decision de fallback:
  - pipeline encadenado STT -> LangChain/text agent -> TTS -> Live Avatar solo como fallback o etapa demo
  - no usar el pipeline encadenado como arquitectura principal si el objetivo es conversacion fluida
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
- manejo de preambulos, silencio, audio poco claro e interrupciones
- dependencias exactas con los modulos existentes

Decision tecnica obligatoria:

- Para MVP de voz real, `apps/realtime` debe manejar una sesion OpenAI Realtime por WebSocket server-side y una sesion Live Avatar LITE por token/sesion del provider.
- El frontend no llama a OpenAI con secretos ni a Live Avatar con API key. Solo usa tokens efimeros/short-lived emitidos por YUNI.
- El frontend usa el SDK web de Live Avatar para conectar la sesion LITE y renderizar el video.
- El audio del usuario fluye por el canal realtime de YUNI hacia OpenAI Realtime.
- El audio de salida del modelo se normaliza para Live Avatar LITE y se envia al avatar como audio streaming.
- Cuando OpenAI detecta speech del usuario durante una respuesta, YUNI debe cancelar/truncar la respuesta en OpenAI y mandar interrupt a Live Avatar.
- El modelo realtime debe usar `OPENAI_REALTIME_MODEL` desde config; no hardcodear modelos salvo en tests. Si el default actual queda viejo, el modulo que implemente config debe actualizarlo contra docs oficiales.

Contratos requeridos:

- `AvatarAgentRuntimeConfig`
  - `avatarId`
  - `ownerId` o public session identity segun modo
  - `conversationId`
  - `visibility`: private | public
  - `instructions`
  - `baseContext`
  - `voiceConfig`
  - `liveAvatarConfig`
  - `realtimeConfig`
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
  - valida ownership o share link activo
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

Dependencias:

- Antes de voz productiva:
  - `18-interact-shell-ui`
  - `19-private-conversations-api`
  - `24-openai-adapter-prompt-builder`, actualizado con este contrato
  - `25-private-text-chat-api` para validar agente por texto
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
- no exponer prompts/contexto/documentos en rutas publicas
- no usar Live Avatar FULL mode como arquitectura principal de YUNI
- no depender de que Live Avatar haga STT/LLM/TTS en LITE
- no hardcodear modelos OpenAI en codigo de producto
- no meter documentos completos en instrucciones de sesion realtime
- no implementar multiagente/grupos en este modulo
- no implementar vector DB avanzada salvo que `31` lo decida explicitamente
- mantener el contrato compatible con chat texto y voz

Checklist:

- queda claro quien maneja STT/LLM/TTS, quien maneja RAG y quien renderiza video
- queda claro como el agente usa contexto personalizado del creador
- queda claro como se conectan LangChain y OpenAI Realtime
- queda claro como se interrumpe una respuesta en OpenAI y Live Avatar
- queda claro que datos se persisten y cuales no
- queda claro que rutas/modulos deben existir antes de implementar voz
- los planes `24`, `31`, `32`, `33` y `34` quedan actualizables contra este contrato
