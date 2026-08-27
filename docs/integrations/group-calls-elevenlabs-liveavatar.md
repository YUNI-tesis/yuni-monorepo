# Llamadas grupales con ElevenLabs y LiveAvatar

Esta guía describe la arquitectura vigente de llamadas privadas con dos o tres avatares. Complementa la configuración de proveedores de [ElevenLabs + LiveAvatar MVP](elevenlabs-liveavatar-mvp.md).

## Cómo funciona, en simple

Pensá la llamada como una videollamada con varios expertos y un director invisible. Cada avatar está en su propia cabina: tiene su propio Agent de ElevenLabs, sus propios documentos, su propia voz y una sesión de LiveAvatar independiente. Los avatares no conversan libremente ni comparten un cerebro. YUNI dirige la conversación y les entrega la información necesaria cuando llega su turno.

Las responsabilidades se pueden resumir así:

- **YUNI es el director:** escucha el pedido, decide quién debe responder, fija el orden, conserva el historial compartido y autoriza un solo turno a la vez.
- **ElevenLabs es el cerebro y la voz:** el Agent seleccionado consulta su propia Knowledge Base, genera la respuesta y la convierte en audio.
- **LiveAvatar es el cuerpo:** muestra el avatar, mueve su rostro y transporta su audio.
- **El navegador es el guardia:** mantiene a todos muteados y hace audible únicamente al avatar autorizado por YUNI.

Cuando el floor está libre y habla el usuario ocurre lo siguiente:

1. Un único micrófono convierte su voz en texto.
2. YUNI guarda el mensaje y decide qué avatar debe responder y, si corresponde, quién hablará después.
3. Antes de habilitar al primer avatar, YUNI le envía la lista de participantes, el historial compartido y una instrucción privada sobre qué aportar.
4. Ese avatar consulta solamente su propia Knowledge Base, genera su respuesta y la pronuncia con su propia voz.
5. Los demás avatares permanecen muteados mientras esperan.
6. Al terminar, YUNI guarda el texto exacto de la respuesta.
7. Si hay otro participante en la ronda, recibe un contexto actualizado que ya incluye lo que dijo el anterior.
8. Cuando termina la ronda, el turno vuelve al usuario.

Si la persona habla mientras un avatar tiene el floor, Scribe no descarta esa voz. El primer transcript parcial significativo cierra inmediatamente el gate de audio, interrumpe sólo al owner capturado y solicita al backend cancelar toda la ronda. Cuando el backend confirma que liberó el floor y Scribe entrega el transcript committed, YUNI enruta ese pedido una sola vez. Los avatares pendientes ya no responden a la intención anterior.

Por ejemplo, ante “¿Podrían presentarse los tres?”, YUNI crea una fila con los participantes en el orden fijo del grupo. El primero recibe la instrucción de presentarse brevemente; cuando termina, el segundo recibe el transcript que ya contiene esa presentación; luego habla el tercero. Cada uno interviene una sola vez y ninguno necesita responder en nombre de los demás.

La idea central es: **los avatares no comparten su RAG; comparten la conversación mediante YUNI**.

## Arquitectura vigente

- Una sesión LiveAvatar LITE independiente y administrada por avatar.
- Un ElevenLabs Agent grupal por avatar, separado del Agent directo pero con la misma voz, TTS y Knowledge Base.
- Un único Scribe en el navegador; los micrófonos de los connectors grupales permanecen muteados.
- Ese Scribe es también la única autoridad de entrada para el barge-in humano. Los eventos propios de los Agents no pueden preemptar la conversación.
- LangGraph decide quién participa y prepara instrucciones privadas. El ElevenLabs Agent consulta su RAG, genera el texto y produce la voz.
- YUNI persiste ronda, cola, lease y owner del floor. El navegador sólo ejecuta las directivas del servidor.
- La interrupción humana sólo coordina mute local, cancelación autoritativa idempotente y el siguiente transcript committed; su receipt no contiene ni reconstruye la respuesta parcial cortada.
- Cada saludo automático de startup se suprime con `session.interrupt()` y el gate permanece en `null`; mutear el stream sin cortar el provider dejaría al avatar animado “hablando sin voz”.
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

## Interrupción humana de una ronda

El barge-in grupal es asimétrico: sólo la voz recibida por el Scribe único puede iniciarlo. Un avatar nunca interrumpe a otro. Sólo se evalúa con una llamada saludable, micrófono activo y un turno en `queued`, `speaking` o `committing`, incluida una directiva queued pendiente.

1. `PARTIAL_TRANSCRIPT` se normaliza y se compara con los backchannels aislados `si/sí`, `aja/ajá`, `ok/okay`, `dale`, `claro`, `mmm` y `eh`. Esos términos solos no cortan; una frase como “sí, pero esperá” sí.
2. El navegador ejecuta `applyAudioGate(null)` antes de esperar red y llama `LiveAvatarSession.interrupt()` una sola vez sobre el owner capturado.
3. El cliente llama directamente a `POST /group-voice-sessions/:sessionId/interrupt` con `{ reason: "user", trigger: "voice", sourceEventId, expectedAvatarId, expectedTurnId }`. No envía `spokenFragment` ni encola esta cancelación en `orchestrationQueueRef`, para no agregar latencia al corte.
4. La receipt mínima es única por sesión y `sourceEventId` y ancla la cancelación a ronda/turno. El backend cancela todos los turnos restantes de la ronda y libera el floor; si avanzó de A a B en la misma ronda, devuelve una directiva para cortar también a B. El cliente ejecuta esa directiva con el gate todavía en `null` antes de marcar el ACK como confirmado. Una ronda anclada ya inactiva produce `stale` y no modifica otra posterior.
5. `COMMITTED_TRANSCRIPT` no inicia la interrupción. Completa la frase humana que ya empezó con un parcial significativo y queda bufferizado si llega antes del ACK.
6. Un latch reúne ACK y committed, sin importar cuál llegó primero. Cuando ambos existen, el navegador incorpora exactamente un nuevo `/turns` a la cola causal de eventos que afectan el floor. El gate sigue cerrado hasta que su respuesta devuelve una directiva fresca.

Si la directiva fresca vuelve a elegir al mismo avatar interrumpido, el cliente no publica inmediatamente otro `user_message` sobre esa sesión. Espera primero el terminal del episodio anterior (`speak_ended` o `interruption`), y cada `user_message` de turno lleva un `event_id` que los callbacks pueden devolver como `source_event_id`. Mientras la directiva está diferida y todavía no existe un comando nuevo, un terminal sin un `source_event_id` conocido puede cerrar únicamente el head interrumpido. Después del nuevo envío, callbacks correlacionados al turno viejo o callbacks ambiguos no pueden cortar, cerrar ni contaminar el turno fresco.

No se captura `spokenFragment`, no se espera `agent_response_correction`, no existe una gracia temporal y el historial no crea un mensaje parcial con marca “Interrumpido”. Este alcance se retiró después de que QA real expusiera avatares simultáneos y streams silenciosos al coordinar gate, callbacks, persistencia y timers en un mismo state machine.

Mientras un avatar habla, la UI muestra “{Avatar} está hablando · hablá para interrumpir” y, durante el corte, “Te escuchamos · interrumpiendo a {Avatar}…”. El micrófono puede activarse o desactivarse durante un floor normal; muteado no hay barge-in y el toggle queda bloqueado mientras la interrupción está pendiente.

Si la cancelación falla o no confirma `phase: "listening"` con `floor: null`, el audio permanece muteado y la UI muestra el error. No hay retry manual, automático ni una ruta alternativa de reenrutado.

Mientras la interrupción está pendiente, cualquier `speak_started` tardío de cualquier connector se corta localmente. Esa supresión no envía otro POST y no muta el floor.

## Floor y audibilidad

El backend es autoridad de `floorOwnerAvatarId`, `floorTurnId`, fase y lease. Dos claims concurrentes no pueden ser válidos a la vez.

LiveAvatar adjunta audio y video remotos al mismo elemento multimedia. `voiceChat.defaultMuted` sólo controla el micrófono local del connector; no silencia la voz remota. La llamada grupal aplica por eso dos acciones:

- `applyAudioGate(null)` mantiene todos los elementos remotos muteados;
- `applyAudioGate(avatarId)` desmutea exclusivamente al owner autorizado.

Un `speak_started` no autorizado se reporta con `turnId: null`. El servidor responde `suppress`; el cliente mantiene al infractor muteado y llama `interrupt()` únicamente sobre esa sesión. El floor válido no cambia y el evento no entra al transcript.

Ese `interrupt()` defensivo no es un barge-in conversacional: sólo suprime audio rogue. Del mismo modo, un evento provider `interruption` es telemetría/no-op y no libera el floor. La preempción humana nace exclusivamente del flujo autenticado iniciado por Scribe.

Una interrupción humana no persiste la porción incompleta del avatar. El historial y el siguiente contexto contienen los mensajes ya confirmados y la nueva intervención committed.

Una corrección o callback tardío de ese turno se rechaza por lease inválido: no crea un mensaje y no puede modificar una ronda posterior.

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

| Configuración             | Llamada individual    | Llamada grupal                                |
| ------------------------- | --------------------- | --------------------------------------------- |
| Agent persistido          | `providerAgentId`     | `groupProviderAgentId`                        |
| Knowledge Base, voz y TTS | Nativos de ElevenLabs | Los mismos recursos nativos                   |
| `turn_timeout`            | 10 segundos           | 30 segundos                                   |
| `soft_timeout`            | filler natural        | deshabilitado (`-1`)                          |
| Micrófono del connector   | activo                | muteado; Scribe es el único input             |
| Interrupción humana       | habilitada            | habilitada sólo vía Scribe; preempta la ronda |

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

Si varios avatares se animan como si hablaran al iniciar, pero no hay audio:

1. verificar que cada sesión siga con el gate en `null` durante startup;
2. confirmar que el primer `speak_started` de cada startup cue invoque una vez `session.interrupt()`;
3. comprobar que la supresión finalice el estado de startup aunque luego llegue `speak_ended`;
4. no reportar ese cue mediante el endpoint de interrupción humana: no corresponde a una ronda ni a voz de Scribe;
5. revisar que callbacks de un attempt o epoch anterior no finalicen el startup vigente.

Si hablar no interrumpe al avatar:

1. confirmar que el micrófono de Scribe esté activo y que los micrófonos de los connectors sigan muteados;
2. verificar que llegue un `PARTIAL_TRANSCRIPT` significativo; un committed aislado no origina el corte;
3. comprobar que el owner y el turno esperados correspondan al floor capturado;
4. confirmar que el gate se cierre y el SDK interrumpa al owner antes del request;
5. revisar que el backend cancele la ronda y responda con el floor libre;
6. confirmar que un committed temprano quede bufferizado y se enrute una sola vez después del ACK;
7. verificar que el gate no se abra hasta recibir una directiva fresca del nuevo `/turns`.
8. si la ronda nueva elige al mismo avatar, comprobar que el segundo `user_message` se publique después del terminal viejo;
9. revisar que los callbacks frescos incluyan el `source_event_id` del `user_message`. Si falta después de reutilizar el connector, el cliente falla cerrado para la atribución y el lease termina el turno en vez de aceptar un evento ambiguo.

Si se producen interrupciones accidentales:

1. distinguir un backchannel aislado de una frase más larga después de normalizar acentos y puntuación;
2. verificar `echoCancellation` y `noiseSuppression` en el stream de Scribe;
3. probar con auriculares para separar eco del audio remoto de habla humana real;
4. no activar `filterBackgroundAudio` hasta completar una comparación manual entre navegadores y dispositivos.

## Checklist manual

1. Crear un grupo de tres avatares con documentos distintos.
2. Iniciar la llamada y permanecer más de 35 segundos en silencio.
3. Confirmar que cada saludo automático sea interrumpido, todos los videos sigan muteados y ningún avatar quede animado “hablando sin voz”.
4. Decir “¿Podrían introducirse una vez cada uno?”.
5. Verificar una intervención por avatar, orden fijo, cero superposición y retorno del piso.
6. Durante la primera respuesta decir “pará” y confirmar mute inmediato, cancelación de toda la ronda y una sola ronda nueva con el pedido committed.
7. Repetir con “esperá”, “sí, pero…” y commits que lleguen antes y después del ACK.
8. Confirmar que “sí”, “ajá”, “ok”, “dale”, “claro”, “mmm” y “eh” aislados no interrumpan.
9. Confirmar que el historial no agregue el fragmento incompleto ni espere una corrección tardía antes de reenrutar.
10. Mutear el micrófono durante un turno y confirmar que no haya barge-in; reactivarlo y probar de nuevo.
11. Forzar un fallo de cancelación y confirmar error visible, gate cerrado y ausencia de retry o turno alternativo.
12. Forzar que la ronda siguiente vuelva a elegir al mismo avatar; confirmar terminal viejo, `source_event_id` fresco y una sola respuesta audible.
13. Repetir varias interrupciones con parlantes y auriculares y comprobar que nunca haya dos avatares audibles ni streams silenciosos en la ronda siguiente.
14. Probar una pregunta normal, una mención, un debate, un retry de participante y una llamada individual de regresión.

## Decisión asociada

- [ADR 0023: Floor grupal preemptivo exclusivo del usuario](../thesis/decision-records/0023-user-preemptible-group-call-floor.md)
