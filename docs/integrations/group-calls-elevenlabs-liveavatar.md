# Llamadas grupales con ElevenLabs y LiveAvatar

Esta guía describe la arquitectura vigente de llamadas privadas con dos o tres avatares. Complementa la configuración de proveedores de [ElevenLabs + LiveAvatar MVP](elevenlabs-liveavatar-mvp.md).

Al 2026-09-09, la reconstrucción de interrupciones está **EN VALIDACIÓN, fase 1**. La base funcional de `main` sigue siendo la referencia: `ElevenLabsAgentSession` del SDK `0.0.18` pasó el ensayo de comandos; el cierre acotado pasó tres rondas deterministas con providers, nueve respuestas sin PCM bloqueado observado. El ensayo previo que silenció tails y el ensayo largo que agotó el tiempo del harness se conservan como evidencia, no como aprobaciones. La aceptación física sigue pendiente. El barge-in humano y el contexto interrumpido descritos como objetivo más abajo todavía no se habilitan. [ADR 0026](../thesis/decision-records/0026-user-preemptible-group-call-floor.md) contiene la decisión y el [estudio de caso](../thesis/group-call-audio-stability-case-study.md) distingue evidencia histórica y resultados nuevos.

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
7. `speak_ended` inicia una espera de estabilización de 1.000 ms, todavía con el mismo owner audible y su floor retenido. Una continuación invalida ese cierre. Al finalizar un candidato vigente dentro de la cola, el navegador mutea al owner y confirma el end; recién entonces el servidor habilita el siguiente turno o devuelve el piso al usuario.

El contexto se reconstruye justo antes de cada turno. Por eso el segundo participante recibe el texto exacto que produjo el primero, además del roster completo, aunque ambas instrucciones privadas se hayan planificado al comienzo de la ronda. El paquete conserva los ocho mensajes públicos más recientes, acota cada entrada y no supera 9.000 bytes para mantenerse dentro de un margen seguro del canal de datos.

## Floor y audibilidad

El backend es autoridad de `floorOwnerAvatarId`, `floorTurnId`, fase y lease. Dos claims concurrentes no pueden ser válidos a la vez.

LiveAvatar adjunta audio y video remotos al mismo elemento multimedia. `voiceChat.defaultMuted` sólo controla el micrófono local del connector; no silencia la voz remota. La llamada grupal aplica por eso dos acciones:

- `applyAudioGate(null)` mantiene todos los elementos remotos muteados;
- `applyAudioGate(avatarId)` desmutea exclusivamente al owner autorizado.

Para transferir A→B, el gate mutea primero todos los no-owners y abre B al final, sin depender del orden del mapa de elementos. Reaplicar el mismo owner no hace `mute all → unmute owner` ni genera un corte transitorio de su audio.

Un `speak_started` no autorizado se reporta con `turnId: null`. El servidor responde `suppress`; el cliente mantiene al infractor muteado y llama `interrupt()` únicamente sobre esa sesión. El floor válido no cambia y el evento no entra al transcript.

Los fallos de participante guardan una receipt durable por `sourceEventId` y `participantAttemptId`. El primero hace idempotente la entrega; el segundo impide que un evento de la conexión anterior degrade un retry vigente. `session.stopped` y `session.disconnected` convergen en el mismo reporte y el navegador lo reintenta con el ID original hasta recibir ACK.

Cada respuesta del floor incluye su snapshot vigente. Cuando `speak_started` renueva el lease, el navegador sólo adopta la nueva expiración si `turnId` y `avatarId` coinciden con su autorización local. El snapshot nunca habilita audio por sí mismo.

Una directiva `speak` sólo es ejecutable cuando coincide exactamente con `turnId`, `avatarId` y lease vigente del `floor` incluido en esa misma respuesta. El servidor vuelve a comprobar ese conjunto después de reconstruir el contexto; el navegador descarta de forma segura cualquier combinación inconsistente.

Con sesiones independientes el backend no controla directamente los tracks de LiveKit. El gate del navegador impide audibilidad en YUNI; no enviar `user_message` evita generación dirigida; `user_activity` reduce las respuestas autónomas causadas por inactividad.

### Cierre natural y continuaciones

El ajuste usa una barrera de 1.000 ms por identidad de startup o turno, no otro floor. Durante la espera después de un end, la autorización local continúa en `speaking`; el owner y la lease del backend no se liberan. Un nuevo start del owner cancela el candidato antes del dedupe lógico, por lo que una continuación no provoca `interrupt()` ni una segunda confirmación del inicio. Los duplicados del mismo evento no extienden el plazo.

El timer sólo propone un cierre. Su finalización se valida y consume una sola vez dentro de la cola de operaciones, inmediatamente antes de mutear y confirmar el end. Si la cola estaba esperando un ACK anterior y llega otra continuación, el candidato encolado ya no puede cerrar el turno. El contenido de la respuesta se toma al finalizar, no al recibir el primer end.

El saludo de startup permanece muteado hasta completar su propia barrera o el límite de preparación existente. La instancia recuerda de manera acotada fuentes ya finalizadas y descarta sus starts/ends tardíos antes de tratarlos como habla intrusa, sin bloquear la reentrega idempotente del end vigente cuando falló su confirmación. La ausencia de `source_event_id` no se considera por sí sola un error y ese ID no tiene que coincidir con el UUID de `user_message`.

Los 1.000 ms contemplan continuaciones observadas aproximadamente 638–642 ms después de un end. Son una heurística de eventos, **no un ACK acústico**: pueden agregar una pausa y no garantizan absorber cualquier continuación futura. No se agrega WebAudio ni medición de reproducción al producto, no se cambia TTS y no se habilita barge-in. La lease existente sigue siendo el límite de seguridad. Ver la [evidencia del cierre natural](../thesis/evidence/2026-09-09-group-speech-completion.md); esta guía no anticipa su aceptación de QA.

## Lifecycle y cleanup

- `live.start()` está acotado por participante; una conexión que resuelve tarde se detiene y nunca se adjunta.
- Start, retry, failure y end usan CAS contra el attempt y el estado de la sesión padre.
- Terminar una llamada marca el estado inmediatamente y encola el stop externo; un error transitorio del provider no pierde el token.
- El worker reintenta stops transitorios y trata una sesión ya inexistente como cleanup exitoso.
- Eliminar un avatar termina las llamadas afectadas, preserva historiales grupales con otros participantes y elimina grupos que queden por debajo de dos miembros.
- Si la composición editable de un grupo cambió durante una llamada, el cleanup usa el snapshot de la conversación y termina todas las sesiones del grupo antes de eliminarlo, incluso entre propietarios distintos.
- Release del floor, timeout y falla del owner invalidan candidatos de cierre. Reemplazo de instancia, end y unmount descartan las barreras y limpian sus timers/listeners; un callback viejo no confirma un end sobre el turno nuevo. La falla de otro participante no debe mutear al owner válido mientras espera el cierre natural.

## Privacidad de grupos compartidos

Si el grupo contiene avatares compartidos, la sesión no se crea hasta que el usuario acepta que la llamada y su transcripción se guardarán y podrán ser consultadas por los creadores de esos avatares. La preferencia recordada se mantiene por usuario y avatar, de modo que agregar un nuevo participante compartido exige un consentimiento nuevo.

## Comandos del connector

La reconstrucción utiliza los métodos públicos de `ElevenLabsAgentSession` en `@heygen/liveavatar-web-sdk@0.0.18`:

```ts
const contextCommandId = session.sendContextualUpdate(context);
const userCommandId = session.sendUserMessage(instruction);
session.sendUserActivity();
```

El SDK arma el wrapper `elevenlabs_agent_command`, genera `event_id` UUID v4, incluye `session_id` y publica datos confiables en topic `agent-control`. No se escribe `type` dentro de `data` ni se impone un ID interno como `group-turn:...`. La correlación entre el UUID retornado y el turno de YUNI se guarda localmente. `source_event_id` es opcional; no se asume que cada callback lo incluya.

Estos métodos retornan un string; no esperan aceptación del Agent ni playback. Requieren conexión e ID de sesión disponibles. La publicación `reliable:true` no prueba que el worker o ElevenLabs hayan aceptado la orden. `interrupt()` heredado devuelve `void`, sin ACK remoto. La inspección del [paquete publicado](https://www.npmjs.com/package/@heygen/liveavatar-web-sdk) y su [código exacto](https://github.com/heygen-com/liveavatar-web-sdk/blob/5faad721ef991bd7ddba9dcbc9827d5426f7b9ca/packages/js-sdk/src/LiveAvatarSession/ElevenLabsAgentSession.ts) sustenta este contrato.

En el ensayo acotado de interrupción hubo terminal a los 489 ms, PCM remoto hasta los 680 ms y ninguna corrección viva en 12 segundos, aunque ElevenLabs terminó guardando una respuesta truncada. Su `source_event_id` terminal tampoco coincidió con el UUID del pedido. No esperar corrección textual para cortar y no inferir reutilización segura por esos valores: sólo se probó cortar una sesión, no enviar otra orden sobre ella. Los IDs y límites están en la [evidencia sanitizada](../thesis/evidence/2026-09-08-group-provider-command-contract.md).

YUNI envía `user_activity` cada 20 segundos a los Agents sin floor, mantiene el heartbeat HTTP de la sesión grupal cada 20 segundos y llama `LiveAvatarSession.keepAlive()` cada 120 segundos. Los tres ciclos tienen cleanup independiente.

## Configuración de Agents

| Configuración             | Llamada individual    | Llamada grupal                                                    |
| ------------------------- | --------------------- | ----------------------------------------------------------------- |
| Agent persistido          | `providerAgentId`     | `groupProviderAgentId`                                            |
| Knowledge Base, voz y TTS | Nativos de ElevenLabs | Los mismos recursos nativos                                       |
| `turn_timeout`            | 10 segundos           | 30 segundos                                                       |
| `soft_timeout`            | filler natural        | deshabilitado (`-1`)                                              |
| Micrófono del connector   | activo                | muteado; Scribe es el único input                                 |
| Interrupción humana       | habilitada            | pendiente de fase 2; no habilitada en la validación de transporte |

## Flujo Scribe-authoritative objetivo

Después de aceptar la fase 1, una frase significativa capturada por Scribe durante la voz de un avatar cortará el audio y pedirá al backend cancelar la ronda esperada. Los otros avatares no tomarán la palabra por su cuenta. El committed humano se conservará aunque llegue antes del ACK y se reenrutará una sola vez después de cancelar la ronda anterior.

El corte y la cancelación no esperarán una corrección textual. Para el siguiente pedido, YUNI distinguirá el borrador generado del fragmento informado por el provider y de lo pendiente o desconocido. `agent_response` no demuestra audio oído; `agent_response_correction` puede mejorar el fragmento del turno original sin reabrirlo. La ausencia de evidencia se expresa como incertidumbre, no como un texto completo supuestamente pronunciado.

Este flujo es una decisión por implementar. La fase actual conserva el TTS y el micrófono muteado de los connectors de la base. Después de aislar el contrato de transporte, modifica únicamente el cierre natural y el orden seguro del gate descritos arriba, con su aceptación de reproducción todavía pendiente.

## Diagnóstico

Si queda “Preparando respuesta” o no hay voz:

1. Registrar commit, versión de SDK, sesión, attempt, turno, avatar y UUID provider, sin transcripciones ni tokens en los logs ordinarios.
2. Confirmar conexión, `sessionId` y stream adjunto antes de enviar comandos. Distinguir un medio preparado de un Agent listo para procesar la orden.
3. Consultar la conversación de ElevenLabs con acceso autorizado y comprobar recepción de contexto **y** `user_message`; un contexto recibido no demuestra que haya llegado el pedido.
4. Si el pedido no aparece, comparar el wrapper con la API pública del SDK, especialmente UUID y sesión. No concluir que falló TTS ni reenviar automáticamente una orden cuyo resultado es incierto.
5. Si el pedido aparece, comparar respuesta generada y audio fuente con `speak_started`, `speak_ended`, gate y reproducción del navegador. El final del control no acredita por sí solo el último sample audible.
6. Atribuir los callbacks usando la evidencia de correlación realmente disponible. No descartar todo evento sin `source_event_id` suponiendo una garantía que el provider no documenta.
7. Separar una cancelación humana, un watchdog y un cierre de sesión; verificar receipts y eventos persistidos. En la sesión investigada `cmttg99ce002ap6n985npx8tc` hubo vencimientos de aproximadamente 20 segundos y cero interrupciones humanas registradas.

La [comparación real del contrato](../thesis/evidence/2026-09-08-group-provider-command-contract.md) reprodujo el fallo de `group-turn:...` y obtuvo entrega más audio con UUID/API pública. Por eso no deben volver a usarse IDs internos como IDs del protocolo provider. El GET inicial de una conversación en `processing` puede contener resultados incompletos: reconsultar hasta su estado final antes de concluir que el mensaje falta. `hasAudio=true` también puede corresponder sólo al saludo.

En el ensayo previo, la aplicación real con STT simulado completó tres turnos y mantuvo un máximo de un elemento desmuteado, pero silenció muestras del stream después del primer end. Un resultado de ronda completada no acepta respuestas completas: correlacionar RMS y estado muteado mediante el harness de QA, incluyendo starts posteriores y cierres propuestos/confirmados. La barrera nueva no incorpora esas métricas al producto. La fase 1 sigue sin aceptación acústica; `agent_response_complete` de ElevenLabs tampoco se usa como requisito hasta comprobar que el connector lo reenvía. Registrar el perfil TTS efectivo antes y después del sync: la prueba real restableció el preset de `main`, distinto del preset presente durante el harness aislado.

Para diagnosticar el cierre natural, comprobar que una continuación invalide el candidato antes de que se confirme dentro de la cola; distinguir un end recibido de un end confirmado. Revisar que reentregas del mismo evento no prolonguen el timer, que sources ya finalizadas no interrumpan al owner siguiente y que una reentrega tras fallo HTTP conserve la misma clave idempotente del end. Las fuentes conocidas se usan para descartar episodios finalizados, no para exigir una correlación que falta en los eventos restantes.

Si aparece “¿seguís ahí?”:

1. verificar eventos `user_activity` en `agent-control` cada 20 segundos;
2. confirmar que se utilice `sendUserActivity()` y que el heartbeat alcance el connector;
3. comprobar que el Agent grupal tenga `turn_timeout=30` y `soft_timeout=-1`;
4. verificar que un timer anterior no haya sobrevivido a end/retry;
5. recordar que el audio gate debe mantener inaudible cualquier respuesta autónoma aun si el timer del navegador fue ralentizado.

Si dos avatares parecen hablar:

1. inspeccionar `floorOwnerAvatarId` y `floorTurnId` en la respuesta del servidor;
2. confirmar que exactamente un elemento `<video>` esté desmuteado;
3. verificar que `speak_started` rogue produzca `suppress`, no `interrupt` global;
4. confirmar que sólo el candidato de cierre natural vigente mutee antes del request de confirmación, y que ningún comando del avatar siguiente salga durante la espera;
5. revisar eventos tardíos y leases vencidos en logs sin avanzar la ronda.

## Checklist manual

La primera aceptación se ejecuta sin habilitar interrupciones ni cambiar TTS:

1. Crear un grupo de tres avatares con documentos distintos.
2. Iniciar la llamada y permanecer más de 35 segundos en silencio.
3. Decir “¿Podrían introducirse una vez cada uno?”.
4. Verificar una intervención por avatar, orden fijo, cero superposición y retorno del piso.
5. Probar una pregunta normal, una mención y un debate.
6. Detener una sesión individual y comprobar continuidad degradada y retry.
7. Revisar el historial y una llamada individual de regresión.
8. Verificar recepción del `user_message` de cada turno en ElevenLabs y registrar IDs y tiempos de inicio/final, además del resultado audible.
9. Repetir respuestas de una palabra y respuestas largas; comparar audio fuente con navegador en parlantes/auriculares y desktop/mobile.

Sólo después de aceptar esa base se prueba barge-in: frase significativa, backchannels, eco, committed antes/después del ACK, cancelación A→B, reutilización del mismo connector y contexto interrumpido. Cada resultado se registra en el estudio de caso con fecha y commit; una prueba pendiente no se marca como aprobada por tener cobertura automatizada.

## Decisión asociada

- [ADR 0019: Floor estricto con sesiones LiveAvatar grupales independientes](../thesis/decision-records/0019-strict-floor-independent-liveavatar-group-sessions.md)
- [ADR 0026: interrupción humana y reconstrucción por fases](../thesis/decision-records/0026-user-preemptible-group-call-floor.md)
- [Plan 39 y estado de aceptación](../plan-prompts/39-user-preemptible-group-call-floor.md)
