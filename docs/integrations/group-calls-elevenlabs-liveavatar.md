# Llamadas grupales con ElevenLabs y LiveAvatar

Esta guía describe la arquitectura vigente de llamadas privadas con dos o tres avatares. Complementa la configuración de proveedores de [ElevenLabs + LiveAvatar MVP](elevenlabs-liveavatar-mvp.md).

Al 2026-09-12, las **fases 2 y 3 de interrupción humana y contexto están implementadas para validación; aceptación formal y QA físico PENDIENTES**. `ElevenLabsAgentSession` del SDK `0.0.18` pasó el ensayo de comandos; el cierre acotado pasó tres rondas deterministas con providers, nueve respuestas sin PCM bloqueado observado. El usuario confirmó que volvió la voz y pidió avanzar con barge-in. La migración aditiva se aplicó sólo a desarrollo, con backup y conteos pre/post idénticos. El [checkpoint de interrupción](../thesis/evidence/2026-09-12-group-human-barge-in.md) registra un primer HTTP 500 de causa sin confirmar y dos ensayos técnicos posteriores con corte y respuesta del siguiente avatar, incluyendo volver al mismo sobre un connector nuevo. Sus oráculos experimentales quedaron inconclusos. [ADR 0026](../thesis/decision-records/0026-user-preemptible-group-call-floor.md) contiene la decisión y el [estudio de caso](../thesis/group-call-audio-stability-case-study.md) distingue evidencia histórica y resultados nuevos. Este incremento no modifica SDK, TTS, cierre natural ni lip-sync; no hubo despliegue a producción.

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

La persona también puede volver a hablar durante una respuesta. Una intervención significativa cierra el audio, cancela la ronda anterior y se conserva para que el orquestador elija nuevamente quién responde. El avatar interrumpido no retoma automáticamente; el contexto distingue su borrador del fragmento informado después del corte.

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

Los 1.000 ms contemplan continuaciones observadas aproximadamente 638–642 ms después de un end. Son una heurística de eventos, **no un ACK acústico**: pueden agregar una pausa y no garantizan absorber cualquier continuación futura. Ese ajuste no agregó WebAudio, medición de reproducción en producto, cambios TTS ni barge-in. La interrupción humana es un incremento posterior y no modifica la barrera. La lease existente sigue siendo el límite de seguridad. Ver la [evidencia del cierre natural](../thesis/evidence/2026-09-09-group-speech-completion.md); esta guía no anticipa su aceptación de QA físico.

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

| Configuración             | Llamada individual    | Llamada grupal                                                       |
| ------------------------- | --------------------- | -------------------------------------------------------------------- |
| Agent persistido          | `providerAgentId`     | `groupProviderAgentId`                                               |
| Knowledge Base, voz y TTS | Nativos de ElevenLabs | Los mismos recursos nativos                                          |
| `turn_timeout`            | 10 segundos           | 30 segundos                                                          |
| `soft_timeout`            | filler natural        | deshabilitado (`-1`)                                                 |
| Micrófono del connector   | activo                | muteado; Scribe es el único input                                    |
| Interrupción humana       | habilitada            | Scribe-authoritative implementada para validación; QA real pendiente |

## Flujo Scribe-authoritative

1. El primer parcial Scribe crea un episodio. Si empezó durante `speaking`, un comando inicial de detención o `sí/ok/dale + pero` corta inmediatamente; otra frase significativa espera 300 ms desde el primer candidato. Los parciales posteriores no renuevan ese plazo y un committed anticipado funciona como fallback.
2. Backchannels aislados o combinados, incluidos `Okey.`, `sí sí` y `ok dale`, no cortan. `sí, pero…` sí lo hace. `para` dentro de una frase no se trata como orden inmediata. La heurística de eco conserva texto generado por avatar durante 2,5 segundos y hasta 64 tokens; no acredita qué oyó la persona ni identifica al hablante.
3. Si el parcial comenzó en preparación no interrumpe. Su committed se conserva hasta cancelar la intención obsoleta con un turno esperado válido, o enviarlo como una entrada normal cuando el backend está `listening`.
4. El cliente cierra todos los medios antes del HTTP y de `interrupt()` sobre el avatar capturado y el owner/preparación local actual, invalida candidatos de cierre y cambia la generación local de control. ACKs anteriores no pueden reabrir el audio ni avanzar una ronda nueva. Las operaciones normales siguen serializadas.
5. El endpoint autenticado cancela toda la ronda en una transacción y devuelve una receipt idempotente por sesión/`sourceEventId`. Si A pasó a B dentro de esa ronda, también se cancela B; una ronda posterior responde `stale` sin cambiarla. Un evento provider `interruption` sólo registra evidencia/telemetría.
6. El committed humano se conserva antes o después del ACK. La cancelación se reintenta hasta tres veces con el mismo identificador. Mientras falte confirmación se mantiene silencio y no se abre una ronda nueva; ante fallo se ofrece recuperación explícita conservando la frase.
7. Desde el incremento local del 2026-09-13, se conserva cada conexión sana. `POST .../participants/:avatarId/interruption-ready` confirma receipt, turno, attempt activo y evidencia de `speak_ended` con la fuente observada de esa respuesta. Un turno nunca despachado usa evidencia explícita `not_dispatched`; no se confunde un UUID de comando con una fuente de habla. Cada afectado se resuelve antes del nuevo ruteo. Si no llega evidencia en cinco segundos, se conserva la frase y se ofrece recuperación: ese timeout no autoriza reutilización ni dispara desconexión.
8. El intento reutilizado mantiene las fuentes retiradas y espera un start con fuente nueva para abrir audio, con el medio preparado antes del comando para aceptar respuestas síncronas muy cortas. Los finales viejos, desconocidos o sin fuente no cierran el turno nuevo. Se mantiene la barrera natural de continuaciones de un segundo. La reconexión queda como recuperación explícita cuando no hay evidencia o cuando falla realmente el connector; una receipt liberada no permite reemplazar un attempt activo por un retry atrasado.
9. Una vez confirmadas cancelación y disponibilidad de todos los afectados, el orquestador recibe la intervención una sola vez y elige al próximo hablante. El avatar interrumpido no retoma automáticamente.

El corte y la cancelación no esperan una corrección textual. `GroupVoiceInterruptionEvent` conserva la receipt y `GroupVoiceInterruptedTurn` separa borrador generado, fragmento provider y certeza de audición desconocida. El próximo input del orquestador y `contextual_update` reciben esa distinción. `agent_response` no demuestra audio oído; `agent_response_correction` atribuible puede mejorar el mismo registro histórico sin reabrirlo. El historial muestra sólo el fragmento informado con la marca “Interrumpido”; preserva respuestas completadas y no convierte el borrador en texto pronunciado.

El micrófono puede activarse/desactivarse durante el turno del avatar; mientras está apagado no origina barge-in. Durante un episodio iniciado se bloquea el toggle para no abandonar la captura inadvertidamente. Se muestran “{avatar} está hablando · hablá para interrumpir” y “Te escuchamos · interrumpiendo a {avatar}…”. El botón manual compartido sigue deshabilitado. No se agregan subtítulos ni diagnósticos técnicos visibles.

Los contratos owner, compartido y público transportan la expectativa de turno y la receipt. La migración `20260912120000_group_human_interruption_context` sólo agrega persistencia nueva: no modifica migraciones aplicadas ni requiere reset. Se validó en PostgreSQL aislado y se aplicó a desarrollo después de un backup, con los conteos verificados idénticos. `GroupVoiceInterruptionEvent` es el nombre canónico del modelo, mapeado a la tabla nueva `GroupVoiceHumanInterruptionReceipt`; la tabla experimental anterior permanece intacta. Producción no se modificó. En otro entorno, comprobar esa migración antes de probar la nueva API y no atribuir automáticamente un error de schema al proveedor.

### Historial de migraciones sin reset

El reporte local del 2026-09-12 mostró que conservar la tabla experimental no era suficiente: faltaba `20260824120000_user_preemptible_group_call_floor` en el directorio y su representación en el schema. `migrate deploy` había agregado la persistencia nueva, pero no detecta el drift como `migrate dev`.

Se restauró el SQL histórico byte por byte desde `afa73e8`, checksum `a601d57144fbf734075d7a2483397d4583f7c7f1edc47017756a65c6b4508e67`. `LegacyGroupVoiceInterruptionEvent` representa su tabla, enum, índices y relaciones, con `@@ignore` para excluirla del cliente activo; no para excluirla del historial de Migrate. La receipt v2 conserva su tabla diferente. En una base nueva ambas estructuras se crean; en la local ya aplicada no se vuelve a ejecutar esa migración.

Ante un pedido de reset, cancelar con `N` o Ctrl+C. Verificar los archivos originales y sus checksums, restaurarlos y comparar schema/historial antes de reintentar. No borrar `_prisma_migrations`, marcar SQL inexistente como aplicado ni usar reset o `db push --accept-data-loss` para silenciar el aviso. [Prisma recomienda restaurar el archivo faltante o su versión aplicada](https://www.prisma.io/docs/orm/v6/prisma-migrate/understanding-prisma-migrate/migration-histories).

Comprobaciones de lectura usando el entorno del proyecto:

```sh
pnpm --filter @yuni/db exec tsx ../config/scripts/run-with-env.ts prisma migrate status --schema prisma/schema.prisma
pnpm --filter @yuni/db exec tsx ../config/scripts/run-with-env.ts prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code
```

También se debe reproducir el historial completo en una base aislada y compararlo con el entorno real; `status` por sí solo no acredita ausencia de drift. El [seguimiento del checkpoint](../thesis/evidence/2026-09-12-group-human-barge-in.md#seguimiento-drift-local-y-desconexiones-reales) registra las tres verificaciones y conservación de datos.

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

Si la intervención humana no corta o queda detenida:

1. Confirmar rama, versión, historial completo y migración aditiva aplicada en el entorno de QA, sin resetear datos ni modificar migraciones anteriores.
2. Verificar micrófono activo y listeners de parcial/committed de Scribe. Distinguir un episodio iniciado durante voz de uno iniciado en preparación; `Okey.` aislado no debe producir corte.
3. Correlacionar `callEpoch`, generación local, `sourceEventId`, sesión, ronda, turno, avatar y attempts, sin contenido textual en logs. El gate debe cerrarse antes del request.
4. Comprobar receipt `cancelled` frente a `stale`. Tres intentos con el mismo ID no son tres intervenciones distintas; un fallo no autoriza liberar audio ni reenrutar sin confirmación.
5. Confirmar conservación del committed y la recuperación explícita si fallan captura, cancelación, reemplazo o nuevo ruteo. No repetir automáticamente un `user_message` cuyo procesamiento se desconoce.
6. Verificar ACK de reutilización para cada afectado, mismos attempts/sesiones/tracks y ausencia de retry/stop en el recorrido normal. Si falta terminal correlacionado, verificar silencio y frase retenida sin reemplazo automático; el usuario puede solicitar recuperación.
7. Inspeccionar por separado borrador y fragmento informado. La ausencia de corrección no debe bloquear la cancelación; una corrección de un turno anterior no debe asociarse al último turno sólo por compartir avatar.
8. Reproducir ACKs y eventos atrasados después de que el nuevo owner empieza; no deben cambiar su gate o floor. El evento provider `interruption` sin receipt humana tampoco puede hacerlo.

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

El recorrido de regresión conserva el TTS y primero deja terminar las respuestas sin intervenir:

1. Crear un grupo de tres avatares con documentos distintos.
2. Iniciar la llamada y permanecer más de 35 segundos en silencio.
3. Decir “¿Podrían introducirse una vez cada uno?”.
4. Verificar una intervención por avatar, orden fijo, cero superposición y retorno del piso.
5. Probar una pregunta normal, una mención y un debate.
6. Detener una sesión individual y comprobar continuidad degradada y retry.
7. Revisar el historial y una llamada individual de regresión.
8. Verificar recepción del `user_message` de cada turno en ElevenLabs y registrar IDs y tiempos de inicio/final, además del resultado audible.
9. Repetir respuestas de una palabra y respuestas largas; comparar audio fuente con navegador en parlantes/auriculares y desktop/mobile.

Después se ejercita la interrupción implementada, todavía pendiente de QA físico:

1. Interrumpir con “pará”, “esperá”, “sí, pero…” y una frase significativa normal; esperar un corte y un único nuevo ruteo.
2. Emitir `Okey.`, `sí sí`, `ok dale` y sonidos de fondo sin cambiar de intención; comprobar ausencia de falsos cortes con parlantes y auriculares.
3. Empezar una frase durante preparación y confirmar que su committed no se pierda; repetir con commit antes/después del ACK y parciales duplicados.
4. Forzar A→B dentro de la ronda y elegir luego al mismo avatar u otro. Confirmar que todos los connectors afectados se resuelven por reutilización antes del comando nuevo, sin cambiar sus attempts, y que la ronda cancelada no retoma.
5. Simular cancelación fallida, caída de Scribe, reemplazo fallido y fallo del nuevo ruteo: mantener silencio cuando corresponde, conservar la frase y probar recuperación explícita.
6. Revisar historial, input del orquestador y contexto del próximo avatar: generado y fragmento informado separados, desconocido explícito y correcciones tardías sobre el turno original.
7. Repetir con micrófono muteado, cierre/reconexión, cambio de epoch, mobile/desktop físico, DevTools cerrado y red/CPU degradadas. Comparar audio fuente y navegador sin incorporar cambios de lip-sync en este incremento.

Cada resultado se registra en el estudio de caso con fecha y commit. Los tests automatizados no acreditan por sí solos la ausencia de eco, la naturalidad del corte ni el tiempo real de reconexión.

## Decisión asociada

- [ADR 0019: Floor estricto con sesiones LiveAvatar grupales independientes](../thesis/decision-records/0019-strict-floor-independent-liveavatar-group-sessions.md)
- [ADR 0026: interrupción humana y reconstrucción por fases](../thesis/decision-records/0026-user-preemptible-group-call-floor.md)
- [Plan 39 y estado de aceptación](../plan-prompts/39-user-preemptible-group-call-floor.md)
- [Checkpoint de interrupción y migración local](../thesis/evidence/2026-09-12-group-human-barge-in.md)

### Checkpoint local de continuidad — 2026-09-13

Implementación y pruebas deterministas en [evidencia de reutilización integrada](../thesis/evidence/2026-09-13-group-interruption-reuse.md). El flujo normal ya no llama `/retry`, `stop()` ni `/started` en cada corte. Los ensayos reales del día anterior siguen siendo históricos: no miden esta implementación. Quedan pendientes recorridos sandbox completos con provider y QA físico de micrófono/eco/audio; no se afirma una latencia nueva ni audición exacta.
