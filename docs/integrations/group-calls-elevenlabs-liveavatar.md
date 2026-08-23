# Llamadas grupales con ElevenLabs y LiveAvatar

Esta guía describe la arquitectura vigente de llamadas privadas con dos o tres avatares. Complementa la configuración de proveedores de [ElevenLabs + LiveAvatar MVP](elevenlabs-liveavatar-mvp.md).

## Cómo funciona, en simple

Pensá la llamada como una videollamada con varios expertos y un director invisible. Cada avatar está en su propia cabina: tiene su propio Agent de ElevenLabs, sus propios documentos, su propia voz y una sesión de LiveAvatar independiente. Los avatares no conversan libremente ni comparten un cerebro. YUNI dirige la conversación y les entrega la información necesaria cuando llega su turno.

Las responsabilidades se pueden resumir así:

- **YUNI es el director:** escucha el pedido, decide quién debe responder, fija el orden, conserva el historial compartido y autoriza un solo turno a la vez.
- **ElevenLabs es el cerebro y la voz:** el Agent seleccionado consulta su propia Knowledge Base, genera la respuesta y la convierte en audio.
- **LiveAvatar es el cuerpo:** muestra el avatar, mueve su rostro y transporta su audio.
- **El navegador es el guardia:** mantiene a todos muteados y hace audible únicamente al avatar autorizado por YUNI.

Cuando habla el usuario ocurre lo siguiente:

1. Un único micrófono convierte su voz en texto.
2. YUNI guarda el mensaje y decide qué avatar debe responder y, si corresponde, quién hablará después.
3. Antes de habilitar al primer avatar, YUNI le envía la lista de participantes, el historial compartido y una instrucción privada sobre qué aportar.
4. Ese avatar consulta solamente su propia Knowledge Base, genera su respuesta y la pronuncia con su propia voz.
5. Los demás avatares permanecen muteados mientras esperan.
6. Al terminar, YUNI guarda el texto exacto de la respuesta.
7. Si hay otro participante en la ronda, recibe un contexto actualizado que ya incluye lo que dijo el anterior.
8. Cuando termina la ronda, el turno vuelve al usuario.

Por ejemplo, ante “¿Podrían presentarse los tres?”, YUNI crea una fila con los participantes en el orden fijo del grupo. El primero recibe la instrucción de presentarse brevemente; cuando termina, el segundo recibe el transcript que ya contiene esa presentación; luego habla el tercero. Cada uno interviene una sola vez y ninguno necesita responder en nombre de los demás.

La idea central es: **los avatares no comparten su RAG; comparten la conversación mediante YUNI**.

## Arquitectura vigente

- Una sesión LiveAvatar LITE independiente y administrada por avatar.
- Un ElevenLabs Agent grupal por avatar, separado del Agent directo pero con la misma voz, TTS y Knowledge Base.
- Un único Scribe en el navegador; los micrófonos de los connectors grupales permanecen muteados.
- LangGraph decide quién participa y prepara instrucciones privadas. El ElevenLabs Agent consulta su RAG, genera el texto y produce la voz.
- YUNI persiste ronda, cola, lease y owner del floor. El navegador sólo ejecuta las directivas del servidor.
- El mosaico y las rondas conservan el snapshot de posiciones creado al iniciar la conversación, aunque el grupo se edite desde otra pestaña.
- Cada conexión tiene un `participantAttemptId`; callbacks, failures y retries sólo pueden mutar ese attempt.
- Cada token pendiente de detener queda cifrado en un job durable `session_cleanup` hasta que LiveAvatar confirma el cierre.

No se usan Custom LLM, endpoints OpenAI-compatible para ElevenLabs, JWTs de texto planificado, túneles ni recuperación documental paralela en YUNI.

El router usa la API de OpenAI ya configurada en YUNI. Sus defaults específicos son:

```env
OPENAI_GROUP_ROUTER_MODEL=gpt-5.4-nano
OPENAI_GROUP_ROUTER_TIMEOUT_MS=3000
```

## Flujo de una ronda

1. Scribe confirma una intervención humana y YUNI la persiste de forma idempotente.
2. El router resuelve colectivos y menciones determinísticamente; para el resto selecciona semánticamente uno, dos o tres expertos.
3. El servidor reclama un único floor con lease y devuelve una directiva `speak`.
4. El navegador mantiene todos los streams muteados, envía `contextual_update` al seleccionado y luego abre sólo su gate de audio.
5. El navegador envía `user_message` únicamente al Agent seleccionado.
6. El Agent usa sus instrucciones y Knowledge Base nativas, genera la respuesta y la pronuncia con su propia voz.
7. `speak_ended` se confirma después de volver a mutearlo. El servidor habilita el siguiente turno o devuelve el piso al usuario.

El contexto se reconstruye justo antes de cada turno. Por eso el segundo participante recibe el texto exacto que produjo el primero, además del roster completo, aunque ambas instrucciones privadas se hayan planificado al comienzo de la ronda. El paquete conserva los ocho mensajes públicos más recientes, acota cada entrada y no supera 9.000 bytes para mantenerse dentro de un margen seguro del canal de datos.

## Floor y audibilidad

El backend es autoridad de `floorOwnerAvatarId`, `floorTurnId`, fase y lease. Dos claims concurrentes no pueden ser válidos a la vez.

LiveAvatar adjunta audio y video remotos al mismo elemento multimedia. `voiceChat.defaultMuted` sólo controla el micrófono local del connector; no silencia la voz remota. La llamada grupal aplica por eso dos acciones:

- `applyAudioGate(null)` mantiene todos los elementos remotos muteados;
- `applyAudioGate(avatarId)` desmutea exclusivamente al owner autorizado.

Un `speak_started` no autorizado se reporta con `turnId: null`. El servidor responde `suppress`; el cliente mantiene al infractor muteado y llama `interrupt()` únicamente sobre esa sesión. El floor válido no cambia y el evento no entra al transcript.

Los fallos de participante guardan una receipt durable por `sourceEventId` y `participantAttemptId`. El primero hace idempotente la entrega; el segundo impide que un evento de la conexión anterior degrade un retry vigente. `session.stopped` y `session.disconnected` convergen en el mismo reporte y el navegador lo reintenta con el ID original hasta recibir ACK.

Cada respuesta del floor incluye su snapshot vigente. Cuando `speak_started` renueva el lease, el navegador sólo adopta la nueva expiración si `turnId` y `avatarId` coinciden con su autorización local. El snapshot nunca habilita audio por sí mismo.

Una directiva `speak` sólo es ejecutable cuando coincide exactamente con `turnId`, `avatarId` y lease vigente del `floor` incluido en esa misma respuesta. El servidor vuelve a comprobar ese conjunto después de reconstruir el contexto; el navegador descarta de forma segura cualquier combinación inconsistente.

Con sesiones independientes el backend no controla directamente los tracks de LiveKit. El gate del navegador impide audibilidad en YUNI; no enviar `user_message` evita generación dirigida; `user_activity` reduce las respuestas autónomas causadas por inactividad.

## Lifecycle y cleanup

- `live.start()` está acotado por participante; una conexión que resuelve tarde se detiene y nunca se adjunta.
- Start, retry, failure y end usan CAS contra el attempt y el estado de la sesión padre.
- Terminar una llamada marca el estado inmediatamente y encola el stop externo; un error transitorio del provider no pierde el token.
- El worker reintenta stops transitorios y trata una sesión ya inexistente como cleanup exitoso.
- Eliminar un avatar termina las llamadas afectadas, preserva historiales grupales con otros participantes y elimina grupos que queden por debajo de dos miembros.
- Si la composición editable de un grupo cambió durante una llamada, el cleanup usa el snapshot de la conversación y termina todas las sesiones del grupo antes de eliminarlo, incluso entre propietarios distintos.

## Privacidad de grupos compartidos

Si el grupo contiene avatares compartidos, la sesión no se crea hasta que el usuario acepta que la llamada y su transcripción se guardarán y podrán ser consultadas por los creadores de esos avatares. La preferencia recordada se mantiene por usuario y avatar, de modo que agregar un nuevo participante compartido exige un consentimiento nuevo.

## Comandos del connector

Los comandos se publican como datos confiables en topic `agent-control`:

```json
{
  "event_type": "elevenlabs_agent_command",
  "elevenlabs_event_type": "contextual_update",
  "data": { "text": "<contexto compartido>" }
}
```

```json
{
  "event_type": "elevenlabs_agent_command",
  "elevenlabs_event_type": "user_message",
  "data": { "text": "<instrucción privada>" }
}
```

El heartbeat del Agent debe usar `data: {}`; no se agrega `type` dentro de `data`:

```json
{
  "event_type": "elevenlabs_agent_command",
  "elevenlabs_event_type": "user_activity",
  "data": {}
}
```

YUNI envía `user_activity` cada 20 segundos a los Agents sin floor, mantiene el heartbeat HTTP de la sesión grupal cada 20 segundos y llama `LiveAvatarSession.keepAlive()` cada 120 segundos. Los tres ciclos tienen cleanup independiente.

## Configuración de Agents

| Configuración             | Llamada individual    | Llamada grupal                    |
| ------------------------- | --------------------- | --------------------------------- |
| Agent persistido          | `providerAgentId`     | `groupProviderAgentId`            |
| Knowledge Base, voz y TTS | Nativos de ElevenLabs | Los mismos recursos nativos       |
| `turn_timeout`            | 10 segundos           | 30 segundos                       |
| `soft_timeout`            | filler natural        | deshabilitado (`-1`)              |
| Micrófono del connector   | activo                | muteado; Scribe es el único input |
| Interrupción humana       | habilitada            | deshabilitada durante la ronda    |

## Diagnóstico

Si aparece “¿seguís ahí?”:

1. verificar eventos `user_activity` en `agent-control` cada 20 segundos;
2. confirmar que el payload tenga `data: {}`;
3. comprobar que el Agent grupal tenga `turn_timeout=30` y `soft_timeout=-1`;
4. verificar que un timer anterior no haya sobrevivido a end/retry;
5. recordar que el audio gate debe mantener inaudible cualquier respuesta autónoma aun si el timer del navegador fue ralentizado.

Si dos avatares parecen hablar:

1. inspeccionar `floorOwnerAvatarId` y `floorTurnId` en la respuesta del servidor;
2. confirmar que exactamente un elemento `<video>` esté desmuteado;
3. verificar que `speak_started` rogue produzca `suppress`, no `interrupt` global;
4. confirmar que `speak_ended` mutee antes del request de confirmación;
5. revisar eventos tardíos y leases vencidos en logs sin avanzar la ronda.

## Checklist manual

1. Crear un grupo de tres avatares con documentos distintos.
2. Iniciar la llamada y permanecer más de 35 segundos en silencio.
3. Decir “¿Podrían introducirse una vez cada uno?”.
4. Verificar una intervención por avatar, orden fijo, cero superposición y retorno del piso.
5. Probar una pregunta normal, una mención y un debate.
6. Detener una sesión individual y comprobar continuidad degradada y retry.
7. Revisar el historial y una llamada individual de regresión.

## Decisión asociada

- [ADR 0019: Floor estricto con sesiones LiveAvatar grupales independientes](../thesis/decision-records/0019-strict-floor-independent-liveavatar-group-sessions.md)
