# ElevenLabs + LiveAvatar MVP

Esta guia documenta como configurar ElevenLabs y LiveAvatar para probar el MVP de llamada privada de YUNI. El objetivo es que un creador pueda abrir `/interact/[avatarId]`, iniciar una llamada con un avatar LiveAvatar LITE y conversar con un ElevenLabs Agent sincronizado desde el contexto textual de YUNI.

## Resumen

YUNI es la fuente de verdad del avatar, instrucciones y contexto. ElevenLabs funciona como provider de conversacion y LiveAvatar renderiza el video del avatar.

Flujo actual:

1. El creador configura un avatar visual en YUNI.
2. El wizard carga `My Voices` desde ElevenLabs por backend.
3. El creador elige una voz ElevenLabs real.
4. Al guardar, YUNI persiste el avatar y encola la proyeccion del contexto y del ElevenLabs Agent.
5. El worker crea o actualiza Knowledge Base y Agent sin bloquear el guardado ni una llamada que ya tenga una version utilizable.
6. El backend pide a LiveAvatar un session token LITE usando el `agent_id` de ElevenLabs y el secret de LiveAvatar.
7. El frontend recibe solo el token de sesion, nunca las API keys.
8. `@heygen/liveavatar-web-sdk` conecta la llamada y emite eventos de habla/transcripcion.
9. Al cortar, YUNI persiste transcript y cierra la `Conversation` y la `RealtimeSession`.

## Requisitos

- Cuenta paga de ElevenLabs. El conector de LiveAvatar no funciona con API keys de ElevenLabs free.
- API key de ElevenLabs con permisos suficientes para crear/actualizar agents desde YUNI y para que LiveAvatar use el connector.
- API key de LiveAvatar.
- Un `LIVEAVATAR_ELEVENLABS_SECRET_ID`, creado registrando la API key de ElevenLabs dentro de LiveAvatar.
- Al menos una voz en `My Voices` de ElevenLabs para que el wizard pueda crear avatars nuevos.
- Opcional: `ELEVENLABS_DEFAULT_VOICE_ID` para usar solo como fallback de avatars legacy sin voz ElevenLabs propia.

## Paso A Paso En ElevenLabs

1. Entrar a ElevenLabs y confirmar que la cuenta no sea Free.

   Para el MVP alcanza empezar con un plan pago chico. Si se usa cuenta Free, LiveAvatar devuelve un error similar a:

   ```txt
   Elevenlabs' third-party voice integration is only available to Elevenlabs' paid users.
   ```

2. Crear o editar una API key.

   Ir a `Developers -> API Keys`. Crear una key para YUNI, por ejemplo `YUNI Dev Agent Key`.

3. Mantener `Restrict Key` activado.

   No usar una key sin restricciones salvo para un diagnostico muy corto.

4. Definir `Usage Limits (Credits)`.

   Para desarrollo local, usar:

   ```txt
   5000
   ```

   Si queda corto para una demo, subir a `10000`. Evitar `Unlimited` en desarrollo.

5. Configurar permisos.

   Permisos recomendados para este MVP:

   ```txt
   ElevenAgents: Write
   Voices: Read
   Models: Access
   User: Read
   Text to Speech: Access
   Speech to Text: Access
   Speech to Speech: Access
   ```

   Permisos que no deberian hacer falta ahora:

   ```txt
   Webhooks: No Access
   Service Accounts: No Access
   Workspace Analytics: No Access
   Audit Log Read: No Access
   Group Members: No Access
   Workspace Members: No Access
   Terms of Service Accept: No Access
   Dubbing: No Access
   Projects: No Access
   Audio Native: No Access
   Voice Generation: No Access
   Forced Alignment: No Access
   Sound Effects: No Access
   Music Generation: No Access
   Audio Isolation: No Access
   ```

   Nota: la documentacion del connector de LiveAvatar pide `convai_read`, `user_read` y `voices_read`. YUNI ademas necesita permiso de escritura sobre ElevenAgents porque el backend crea y actualiza el agent al sincronizar el avatar.

6. Copiar la API key.

   Guardarla solo en el backend/local env. Nunca ponerla en variables `NEXT_PUBLIC_*` ni en codigo frontend.

7. Confirmar voces en My Voices.

   Ir a `Voices -> My Voices` y verificar que exista al menos una voz compatible con API. El wizard de YUNI lista esas voces usando `GET /v2/voices?voice_type=saved`.

8. Elegir la voz default solo si se van a usar avatars legacy.

   El flujo nuevo guarda la voz real elegida desde `My Voices`, por lo que no necesita default global. Para compatibilidad con avatars viejos que sigan usando voces OpenAI/locales, ir a `Voices` o `My Voices`, elegir una voz compatible con API, abrir el menu de acciones y copiar el `voice ID`.

   Ese valor va en:

   ```env
   ELEVENLABS_DEFAULT_VOICE_ID=
   ```

## Paso A Paso En LiveAvatar

1. Obtener la API key de LiveAvatar.

   Ir a `app.liveavatar.com/developers` y copiar la API key.

   Ese valor va en:

   ```env
   LIVEAVATAR_API_KEY=
   ```

2. Crear el secret de ElevenLabs en LiveAvatar.

   LiveAvatar no recibe la API key de ElevenLabs directamente desde el browser. Primero hay que registrarla como secret:

   ```bash
   curl -X POST https://api.liveavatar.com/v1/secrets \
     -H "X-API-KEY: TU_LIVEAVATAR_API_KEY" \
     -H "content-type: application/json" \
     -d '{
       "secret_type": "ELEVENLABS_API_KEY",
       "secret_value": "TU_ELEVENLABS_API_KEY",
       "secret_name": "YUNI ElevenLabs Agent Key"
     }'
   ```

3. Copiar el `id` que devuelve LiveAvatar.

   Ese `id`, no la API key, va en:

   ```env
   LIVEAVATAR_ELEVENLABS_SECRET_ID=
   ```

4. Elegir modo sandbox o modo con creditos.

   ```env
   LIVEAVATAR_SANDBOX=true
   ```

   `true` sirve para desarrollo solo si el `avatar_id` elegido soporta sandbox. Algunos avatares publicos o de catalogo no lo soportan y LiveAvatar devuelve `This avatar is not supported in sandbox mode`.

   Para probar con esos avatares, usar:

   ```env
   LIVEAVATAR_SANDBOX=false
   ```

   Esto permite crear la sesion, pero consume creditos de LiveAvatar.

## Env Local

El archivo local recomendado es el `.env.local` del root del repo:

```txt
/Users/lucaslovaglio/projects/university/tesis/yuni-ai/.env.local
```

Variables minimas para este MVP:

```env
ELEVENLABS_API_KEY=
LIVEAVATAR_API_KEY=
LIVEAVATAR_ELEVENLABS_SECRET_ID=
LIVEAVATAR_SANDBOX=true
```

Fallback opcional para avatars legacy sin voz ElevenLabs:

```env
ELEVENLABS_DEFAULT_VOICE_ID=
```

Para el avatar publico `Bryan Tech Expert`, LiveAvatar rechazo sandbox durante las pruebas. En ese caso usar `LIVEAVATAR_SANDBOX=false` y reiniciar API/web.

Variables con default que normalmente no hace falta cambiar:

```env
ELEVENLABS_BASE_URL=https://api.elevenlabs.io
ELEVENLABS_AGENT_LLM_MODEL=gpt-4o-mini
ELEVENLABS_AGENT_TTS_MODEL=eleven_v3
ELEVENLABS_REQUEST_TIMEOUT_MS=30000
ELEVENLABS_RAG_MAX_DOCUMENTS_LENGTH=10000
LIVEAVATAR_BASE_URL=https://api.liveavatar.com
LIVEAVATAR_MODE=lite
LIVEAVATAR_REQUEST_TIMEOUT_MS=10000
```

`eleven_v3` activa Expressive Mode en ElevenLabs Agents. Si ElevenLabs rechaza el modelo para la cuenta o la latencia queda demasiado alta para la demo, se puede volver temporalmente a:

```env
ELEVENLABS_AGENT_TTS_MODEL=eleven_flash_v2_5
```

Con `eleven_v3`, ElevenLabs no permite customizar Stability, Speed ni Similarity desde el Agent. YUNI por eso no envia esos campos cuando el modelo es V3. Si ElevenLabs igualmente devuelve `expressive_tts_not_allowed`, YUNI reintenta automaticamente el sync con `eleven_flash_v2_5` y guarda el fingerprint del fallback. Esto mantiene el prompt humano, el turn-taking paciente y el contrato PCM 24 kHz, pero sin Expressive TTS ni tags explicitos.

Despues de cambiar `.env.local`, reiniciar API y web.

## Uso En YUNI

1. Levantar base, API y web.

   ```bash
   pnpm db:up
   pnpm db:migrate:dev
   pnpm dev:api
   pnpm dev:web
   ```

2. Entrar a la web local.

   ```txt
   http://localhost:3000
   ```

3. Crear o usar un avatar propio.

   El avatar debe tener un `avatarId` valido de LiveAvatar. Para pruebas, usar un avatar disponible de la cuenta o catalogo de LiveAvatar.

   En el paso de voz, YUNI muestra las voces de `My Voices` de ElevenLabs. Al guardar, el backend valida la voz contra ElevenLabs, guarda metadata confiable y encola la sincronizacion. La tab `Contexto` muestra cuando texto y documentos pasan de `Procesando` a `Listo`.

4. Ir a `/interact`.

   Seleccionar el avatar y abrir la pantalla de llamada.

5. Esperar el primer estado `Listo` e iniciar llamada.

   Iniciar una llamada no sube ni indexa documentos. Si una edicion posterior esta procesando o falla, YUNI usa la ultima version provider utilizable.

6. Cortar llamada desde la UI.

   Al cortar, el frontend envia el transcript acumulado al backend y la sesion queda cerrada.

## Knowledge Base y storage local

Los documentos aceptados son PDF, DOCX, TXT, Markdown, HTML y EPUB, con un maximo de 20 MB por archivo. El contexto textual tiene un maximo de 20.000 caracteres. YUNI usa S3 como fuente de verdad y ElevenLabs Knowledge Base como proyeccion; el texto usa `prompt` y los archivos `auto` con RAG multilingue. Ver [Knowledge Base](https://elevenlabs.io/docs/eleven-agents/customization/knowledge-base), [gestion de documentos](https://elevenlabs.io/docs/eleven-agents/customization/knowledge-base/manage-documents) y [RAG](https://elevenlabs.io/docs/eleven-agents/customization/knowledge-base/rag).

Para desarrollo local, `pnpm db:up` levanta PostgreSQL y MinIO. Variables recomendadas:

```env
S3_BUCKET=yuni-documents
S3_ACCESS_KEY_ID=yuni
S3_SECRET_ACCESS_KEY=yuni-development
S3_ENDPOINT=http://localhost:9000
S3_FORCE_PATH_STYLE=true
S3_PRESIGN_TTL_SECONDS=900
```

MinIO expone la API en `http://localhost:9000` y la consola en `http://localhost:9001`.
El compose habilita CORS para `http://localhost:3000`; un bucket S3 de staging/produccion debe permitir `PUT` y los headers firmados desde el origen web correspondiente.

## Como Funciona Internamente

### Catalogo De Voces

El frontend no conoce la API key de ElevenLabs. Para el wizard y edicion, la API privada:

```txt
GET /voice-providers/elevenlabs/voices
```

devuelve voces normalizadas desde `My Voices`:

- `id`
- `displayName`
- `description`
- `provider: "elevenlabs"`
- `previewUrl`
- `category`
- `labels`
- `recommendedFor`

El backend usa `GET /v2/voices` con `voice_type=saved`, `page_size=100`, orden por nombre y paginacion por `next_page_token`. Si ElevenLabs esta configurado y la voz elegida no aparece en `My Voices`, YUNI rechaza el create/update con `400`. Si ElevenLabs falla durante el sync del Agent, el avatar se conserva y queda con `providerSyncStatus="failed"`.

### Provider Sync

El backend usa `ElevenLabsAgentProvider` en `packages/voice` para crear o actualizar el ElevenLabs Agent.

Entrada principal:

- nombre del avatar
- descripcion
- instrucciones
- contexto textual
- voz ElevenLabs configurada en el avatar, o `ELEVENLABS_DEFAULT_VOICE_ID` solo para avatars legacy

Salida persistida en `AvatarAgent`:

- `agentProvider`
- `providerAgentId`
- `providerSyncStatus`
- `providerSyncError`
- `providerSyncedAt`
- `providerSyncFingerprint`

El fingerprint evita resincronizar si no cambio nada relevante.

Contrato importante para LiveAvatar:

- `conversation_config.asr.user_input_audio_format` debe quedar en `pcm_24000`
- `conversation_config.tts.agent_output_audio_format` debe quedar en `pcm_24000`
- `conversation_config.tts.model_id` usa `eleven_v3` para el preset expresivo, salvo override por env
- con `eleven_v3`, YUNI omite `stability`, `similarity_boost` y `speed` porque V3 no permite customizarlos en Agents
- si `eleven_v3` falla con `expressive_tts_not_allowed`, el provider cae automaticamente a `eleven_flash_v2_5`
- con fallback Flash, `stability` queda en `0.45`, `similarity_boost` en `0.78` y `speed` en `0.98`
- `conversation_config.conversation.text_only` debe quedar en `false`
- `conversation_config.conversation.client_events` no debe reducirse a solo eventos de diagnostico. Para el connector se sincroniza como minimo:
  - `conversation_initiation_metadata`
  - `audio`
  - `user_transcript`
  - `agent_response`
  - `agent_response_correction`
  - `interruption`
  - `vad_score`
- `conversation_config.agent.prompt.llm` debe estar definido
- `conversation_config.turn.turn_eagerness` queda en `patient`
- `conversation_config.turn.turn_timeout` queda en `10`
- `conversation_config.turn.soft_timeout_config` usa un filler natural y `use_llm_generated_message`
- `conversation_config.turn.interruption_ignore_terms` incluye backchannels cortos como `si`, `ajá`, `ok`, `dale`, `claro`, `mmm` y `eh`
- el Agent ID devuelto por ElevenLabs se guarda como `providerAgentId`

El fingerprint de sync incluye esta configuracion del connector. Si se cambia la lista de eventos o el contrato PCM, el Agent existente se vuelve a parchear aunque el texto del avatar no haya cambiado.

### Preset Expresivo

YUNI prioriza la demo emocional sobre la minima latencia. El prompt del Agent pide respuestas breves, una sola pregunta de seguimiento, muletillas controladas y adaptacion del tono a frustracion, entusiasmo o explicaciones tecnicas.

El Agent puede usar tags expresivos de ElevenLabs con moderacion:

- `[laughs]` para humor
- `[sighs]` para alivio, preocupacion o pausa emocional
- `[slow]` para remarcar algo importante
- `[excited]` para entusiasmo breve

No se implementa fade-out real del audio al interrumpir porque LiveAvatar consume internamente el audio de ElevenLabs. La mitigacion actual es evitar falsos cortes con `patient` e `interruption_ignore_terms`, y enviar `contextual_update` cuando ocurre una interrupcion para que el siguiente turno no repita toda la respuesta anterior.

### Inicio De Llamada

El endpoint privado:

```txt
POST /avatars/:avatarId/voice-sessions
```

hace lo siguiente:

1. valida ownership del avatar
2. sincroniza ElevenLabs si corresponde
3. crea una `Conversation` con `mode="voice"`
4. crea una `RealtimeSession`
5. pide a LiveAvatar un token LITE con:

   ```json
   {
     "mode": "LITE",
     "avatar_id": "<liveavatar_avatar_id>",
     "is_sandbox": true,
     "elevenlabs_agent_config": {
       "secret_id": "<LIVEAVATAR_ELEVENLABS_SECRET_ID>",
       "agent_id": "<providerAgentId>"
     }
   }
   ```

   El valor de `is_sandbox` lo toma de `LIVEAVATAR_SANDBOX`; puede ser `true` o `false`.

6. devuelve al frontend `sessionToken`, `sessionId`, `realtimeSessionId` y `conversationId`

### Frontend

El hook `useLiveAvatarSession` usa `@heygen/liveavatar-web-sdk`.

Eventos relevantes:

- `USER_TRANSCRIPTION`
- `AVATAR_TRANSCRIPTION`
- `USER_SPEAK_STARTED`
- `AVATAR_SPEAK_STARTED`
- `SESSION_STOPPED`
- `ELEVENLABS_AGENT_EVENT`

El frontend mantiene transcript local durante la llamada y lo manda al backend al cerrar.

### Cierre De Llamada

El endpoint privado:

```txt
POST /voice-sessions/:realtimeSessionId/end
```

valida ownership, persiste mensajes del transcript y marca cerradas la sesion y la conversacion.

## Troubleshooting

### Error 400591 De LiveAvatar

Mensaje:

```txt
Elevenlabs' third-party voice integration is only available to Elevenlabs' paid users.
```

Causa: la API key de ElevenLabs pertenece a una cuenta Free.

Solucion:

1. pasar ElevenLabs a plan pago
2. crear una API key nueva o editar la actual
3. volver a crear el secret en LiveAvatar
4. actualizar `LIVEAVATAR_ELEVENLABS_SECRET_ID`
5. reiniciar API/web

### Error De Permisos En Sync De ElevenLabs

Causa probable: la key no tiene `ElevenAgents: Write`.

Solucion: editar permisos de la API key y volver a intentar sync.

### Error `Voice provider timed out` Al Sincronizar

Mensaje:

```json
{ "error": { "code": "BAD_GATEWAY", "message": "Voice provider timed out" } }
```

Causa probable: YUNI llego a ElevenLabs, pero ElevenLabs no respondio antes del timeout del backend. Esto puede pasar en el primer sync porque se crea el agent completo.

Solucion:

1. configurar un timeout mas alto en el env del root:

   ```env
   ELEVENLABS_REQUEST_TIMEOUT_MS=30000
   ```

2. reiniciar el API
3. volver a tocar `Sincronizar agente`

Si sigue fallando con `30000`, probar temporalmente `60000`. Si con `60000` tambien falla, revisar conectividad, permisos de la key y disponibilidad de ElevenLabs.

### Error `ElevenLabs returned 400` Al Sincronizar

Causa probable: ElevenLabs rechazo el payload de create/update del agent o algun recurso referenciado no existe para esa key.

Casos comunes:

- la voz guardada en el avatar o `ELEVENLABS_DEFAULT_VOICE_ID` legacy no pertenece a la cuenta o no esta disponible via API
- la key no tiene permisos de `Voices: Read` o `ElevenAgents: Write`
- el agent config no tiene audio input/output en PCM 24 kHz
- el agent config no tiene LLM/TTS model explicito

El adapter de YUNI debe mostrar el detalle devuelto por ElevenLabs cuando venga en `detail.message`, por ejemplo `voice_not_found`. Si la UI sigue mostrando solo `ElevenLabs returned 400`, revisar logs del API y reintentar con permisos/voice ID confirmados.

### La Voz No Funciona

Causas probables:

- avatar legacy sin voz ElevenLabs y `ELEVENLABS_DEFAULT_VOICE_ID` vacio
- voice ID copiado de una voz no disponible via API
- permiso `Voices: Read` faltante
- cuenta Free intentando usar voces de libreria via API

Solucion: copiar una voz desde `My Voices`, confirmar permisos y probar de nuevo.

### LiveAvatar No Inicia Sesion

Antes, YUNI podia devolver solo:

```json
{ "error": { "code": "BAD_GATEWAY", "message": "Live Avatar session failed" } }
```

El adapter debe propagar el detalle real de LiveAvatar cuando el provider lo devuelva, por ejemplo `Invalid secret_id`, falta de creditos, avatar no encontrado o limite de concurrencia.

Causas probables:

- `LIVEAVATAR_API_KEY` invalida
- `LIVEAVATAR_ELEVENLABS_SECRET_ID` invalido o de otro workspace
- `avatar_id` no pertenece a la cuenta/sandbox usada
- `LIVEAVATAR_SANDBOX=true` con un avatar que no soporta sandbox
- la cuenta no tiene creditos
- hay una sesion activa ocupando la concurrencia disponible del plan

Si el mensaje es:

```txt
avatar_id: This avatar is not supported in sandbox mode
```

Solucion:

1. cambiar a un avatar compatible con sandbox, o
2. poner `LIVEAVATAR_SANDBOX=false` en el env del backend
3. reiniciar API/web
4. probar de nuevo la llamada

La segunda opcion usa creditos de LiveAvatar.

### El Avatar Se Ve Pero No Escucha Ni Responde

Primero distinguir si el problema es entrada de audio o generacion de respuesta.

Si en ElevenLabs conversation details aparece `asr_usage.total_audio_input_seconds > 0` o transcript del usuario con `source_medium: "audio"`, el microfono y el connector estan recibiendo audio. En ese caso el problema probable es que el Agent no esta generando LLM/TTS. Una senal clara es:

```txt
tts_usage.total_audio_output_seconds = 0
llm_usage.model_usage = {}
sin mensajes del agent en transcript
```

Causa probable: YUNI sincronizo el Agent con `conversation_config.conversation.client_events` demasiado reducido. El Agent debe incluir `audio`, `user_transcript`, `agent_response`, `agent_response_correction`, `interruption`, `vad_score` y `conversation_initiation_metadata`.

Solucion:

1. actualizar el backend con la version connector-safe de `ElevenLabsAgentProvider`
2. tocar `Sincronizar agente` para forzar `PATCH` del Agent existente
3. verificar por ElevenLabs API/UI que `client_events` contiene `audio` y `agent_response`
4. iniciar una llamada nueva
5. confirmar que ahora `tts_usage.total_audio_output_seconds > 0` y aparece al menos un mensaje del agent

Si no hay ASR ni transcript de usuario en ElevenLabs, recien ahi tratarlo como problema de microfono. Causa probable: el video de LiveAvatar conecto, pero el `VoiceChat` del Web SDK no pudo activar o publicar el microfono. En la version `0.0.17` del SDK, `LiveAvatarSession.start()` intenta iniciar `voiceChat` internamente, pero si falla solo hace `console.warn` y la sesion visual puede quedar conectada.

Solucion en YUNI:

1. despues de `session.start()`, verificar que `session.voiceChat.state` sea `ACTIVE`
2. si no esta activo, llamar explicitamente `session.voiceChat.start({ defaultMuted: false })`
3. si sigue fallando, mostrar error de permisos de microfono y cerrar la sesion

Checklist manual:

- confirmar que el navegador pidio permiso de microfono
- confirmar que `localhost` tiene permiso de microfono en Chrome/Safari
- confirmar que el boton no queda en `Activar microfono`
- hablar y revisar si aparece el badge `Usuario hablando` o transcript
- si el microfono esta activo pero no hay respuesta, revisar eventos `ELEVENLABS_AGENT_EVENT` y logs del API/LiveAvatar

Diagnostico visible en `/interact/[avatarId]`:

- El badge conversacional muestra `Escuchando`, `Pensando`, `Hablando` o `Interrumpido`.
- `Microfono SDK: ACTIVE` indica que el SDK publico un track de audio local.
- `Nivel mic` debe subir por encima de `0%` cuando se habla. Si queda en `0%`, revisar permiso, dispositivo seleccionado o mute fisico del sistema.
- `Eventos recibidos` debe aumentar cuando LiveAvatar/ElevenLabs manda eventos por `agent-response`.
- `ElevenLabs` muestra el ultimo evento passthrough del agent, por ejemplo `conversation_initiation_metadata`, `user_transcript` o `agent_response`.
- `Probar agente por texto` manda un `user_message` por el canal `agent-control`. Si el avatar responde a esta prueba pero no a la voz, el connector y el agent estan bien y el problema esta en la entrada de audio/microfono.

## Fuentes

- LiveAvatar LITE Mode Overview: https://docs.liveavatar.com/docs/lite-mode/overview
- LiveAvatar ElevenLabs Agent Connector: https://docs.liveavatar.com/docs/lite-mode/connectors/elevenlabs-agent
- LiveAvatar FULL Mode Events: https://docs.liveavatar.com/docs/full-mode/events
- LiveAvatar Secrets: https://docs.liveavatar.com/docs/core-concepts/secrets
- LiveAvatar API Key Configuration: https://docs.liveavatar.com/docs/faq/api-key
- ElevenLabs LiveAvatar Integration: https://elevenlabs.io/docs/eleven-agents/guides/integrations/live-avatar
- ElevenLabs Client Events: https://elevenlabs.io/docs/eleven-agents/customization/events/client-events
- ElevenLabs Expressive Mode: https://elevenlabs.io/docs/eleven-agents/customization/voice/expressive-mode
- ElevenLabs Conversation Flow: https://elevenlabs.io/docs/eleven-agents/customization/conversation-flow
- ElevenLabs Conversational Voice Design: https://elevenlabs.io/docs/eleven-agents/customization/voice/best-practices/conversational-voice-design
- ElevenLabs API Authentication: https://elevenlabs.io/docs/api-reference/authentication
- ElevenLabs Voice ID Help: https://help.elevenlabs.io/hc/en-us/articles/14599760033937-How-do-I-find-the-voice-ID-of-my-voices-via-the-website-and-API
- ElevenLabs Agents Pricing: https://elevenlabs.io/pricing/agents
