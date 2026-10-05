# Estudio de caso: estabilidad de audio e interrupciones grupales

## Estado y trazabilidad

Incidente y análisis inicial: 2026-08-28. Revisión de la decisión: 2026-09-08; checkpoint de cierre: 2026-09-09; implementación de interrupción y contexto: 2026-09-12. **Reconstrucción desde `main`: fases 2/3 implementadas para validación; ensayo técnico de interrupción ejecutado con providers y Scribe simulado; aceptación formal y QA físico PENDIENTES.** La implementación anterior falló el QA con proveedores reales; sus tests aprobados no constituyen aceptación de producto. Después de validar el contrato de comandos y reproducir el tail silenciado, la corrección acotada pasó tres rondas deterministas con providers: nueve respuestas sin PCM bloqueado observado. El usuario confirmó luego que volvió la voz y pidió continuar con las interrupciones. Esto no demuestra ausencia de falsos cortes ni aceptación del nuevo barge-in.

Este estudio conserva la explicación narrativa del incidente. [ADR 0026](decision-records/0026-user-preemptible-group-call-floor.md) contiene la decisión canónica y [el plan 39](../plan-prompts/39-user-preemptible-group-call-floor.md) ordena su implementación. La versión histórica de estos documentos permanece en el commit `afa73e88e4944572e449f358314490775419d753`.

## Contexto y problema observado

Una llamada grupal utiliza tres sesiones LiveAvatar LITE independientes, un ElevenLabs Agent por avatar y un Scribe para escuchar a la persona. YUNI decide el orden, guarda la conversación y autoriza un único avatar audible. El usuario confirmó que la base de `main` funciona tanto localmente como desplegada.

El objetivo de producto es permitir que una persona vuelva a hablar para detener una respuesta, corregir una premisa o cambiar de prioridad. La ronda anterior debe cancelarse y el orquestador debe decidir quién responde ahora, con conocimiento de la intervención interrumpida. Obligar a esperar una respuesta larga o toda la ronda hace que los participantes continúen sobre una intención obsoleta.

Al agregar esa capacidad aparecieron varios síntomas, en distintos momentos de las pruebas:

- avatares simultáneos y avatares animados sin voz;
- respuestas de una palabra inaudibles;
- palabras distorsionadas o audio entrecortado;
- turnos detenidos en “Preparando respuesta”.

No hay una causa única demostrada para todos ellos. El último video muestra una falla de inicio de respuesta incluso sin una interrupción humana registrada. El límite de duración de las sesiones sandbox no explica los fallos anteriores al vencimiento.

## Evidencia histórica y límites del análisis

El análisis de agosto correlacionó eventos del frontend, receipts, transcripciones y grabaciones de ElevenLabs:

- Una respuesta corta registró un `speak_ended` 408 ms después de `speak_started`, seguido por otro `speak_started` 646 ms después del end. El transcript fuente contenía la palabra completa. La traza cuestionó el uso de un primer end como única señal para cerrar el gate; no estableció una duración universal de drain.
- `Okey.` produjo una receipt 604 ms antes del commit. Las variantes `ok` y `okay` se ignoraban, pero `okey` no: se confirmó un falso positivo de clasificación.
- Una respuesta larga con sonido extraño tuvo un lifecycle normal y ningún error del provider. Eso no permite decidir entre un artefacto de generación, transporte o reproducción.
- El PCM de 24 kHz coincidía con el formato requerido por el connector. No se halló un desajuste de sample rate en esa evidencia.
- El preset grupal Flash con `optimize_streaming_latency=3` y `stability=0.45` era una hipótesis sobre calidad de generación. No se demostró que causara el silencio de todos los turnos.
- El SDK `0.0.17` crea y publica un track local al configurar `voiceChat.defaultMuted`. Estar muteado no equivale a no crear el micrófono; Scribe ya aportaba la captura humana necesaria.

El intento de agosto agregó un reducer acústico con estados `silent`, `armed`, `playing`, `draining` y `cutting`, drain de 750 ms, barge-in inmediato o a 300 ms, heurística de eco, watchdog de 20 segundos y métricas de medio. También simplificó la persistencia hasta descartar el fragmento interrumpido. Son decisiones históricas ensayadas, no requisitos heredados automáticamente por la reconstrucción.

Las pruebas automatizadas reportadas el 2026-08-29 fueron 320 tests web, 243 API, 25 de dominio, 38 de voz y 42 de repositorio/integración PostgreSQL; algunos casos se omitieron según el runner. Los resultados quedaron registrados en la versión histórica del estudio. La revisión posterior comprobó que los dobles de prueba podían aceptar contratos de transporte que no funcionaban con el provider. Esos números no prueban entrega real de `user_message`, audio completo ni ausencia de falsos cortes.

## Reapertura del incidente el 2026-09-08

En la sesión `cmttg99ce002ap6n985npx8tc`, la consulta de la base local registró inicio a las `2026-09-09T01:58:42.830Z`, activación a las `01:58:47.082Z` y creación de ronda a las `01:58:54.595Z` (todavía 2026-09-08 en Argentina). Vera falló a las `01:59:14.731Z`, 20,136 segundos después de crear la ronda; Bruno falló a las `01:59:34.843Z`, otros 20,112 segundos después. La sesión terminó a las `01:59:34.891Z`.

Los registros consultados tenían cero eventos provider persistidos y cero interrupciones humanas. La conversación consultada en ElevenLabs contenía el saludo `Conectado.` y actualizaciones de contexto, pero no el `user_message` dirigido. La secuencia es compatible con vencimientos consecutivos del watchdog de 20 segundos sin inicio de respuesta; no hay evidencia de un barge-in que explique el silencio. La ausencia de eventos persistidos no prueba que el SDK no recibiera ningún frame: esos frames no pueden reconstruirse a partir del video.

La rama enviaba al provider un `event_id` construido como `group-turn:<epoch>:<turnId>`. Las actualizaciones de contexto sin ese ID alcanzaban ElevenLabs. El tipo oficial de comando describe `event_id` como UUID v4. Esa diferencia motivó la hipótesis de pérdida de la orden antes de la generación; el ensayo controlado posterior reprodujo la regresión del ID custom, como se detalla abajo. No alcanza con ver `publishData` exitoso para concluir que ElevenLabs procesó la orden.

Se incorpora así un cuarto plano causal anterior al audio: **envío y aceptación del comando**. Un watchdog puede detectar falta de progreso, pero no corrige un mensaje rechazado o perdido; cambiar TTS o aumentar un drain tampoco lo hace.

### Corrección de la evaluación del SDK

La conclusión previa de que `0.0.18` no aportaba una API pública útil fue incorrecta. La ausencia de una API nueva de métricas no justificaba descartar todas sus capacidades.

La consulta al [registro npm del SDK](https://registry.npmjs.org/@heygen%2Fliveavatar-web-sdk) y la inspección del [tarball publicado 0.0.18](https://registry.npmjs.org/@heygen/liveavatar-web-sdk/-/liveavatar-web-sdk-0.0.18.tgz) confirmaron publicación el `2026-05-07T18:39:59.184Z`, asociada al commit `5faad721ef991bd7ddba9dcbc9827d5426f7b9ca`. Su bundle ejecutable exporta `ElevenLabsAgentSession` y métodos públicos para enviar mensajes, contexto, actividad y resultados de herramientas. No era sólo una declaración de tipos ni código posterior de `master`.

La [clase publicada](https://github.com/heygen-com/liveavatar-web-sdk/blob/5faad721ef991bd7ddba9dcbc9827d5426f7b9ca/packages/js-sdk/src/LiveAvatarSession/ElevenLabsAgentSession.ts) genera un UUID, incluye `session_id` y devuelve el ID enviado. Verifica conexión e ID de sesión antes del envío. La publicación confiable en LiveKit no espera un ACK de aceptación por ElevenLabs; el ID retornado no demuestra reproducción. `interrupt()` sigue devolviendo `void`, sin ID ni confirmación remota. La reconstrucción debe validar esas fronteras en vez de simular garantías inexistentes.

### Comparación real del contrato de envío

El 2026-09-08 se ejecutó un harness aislado con los mismos Agents y configuración de generación: SDK `0.0.18` con API pública y UUID pasó con los tres avatares; la base `0.0.17` omitiendo `event_id` también pasó con los tres. ElevenLabs confirmó el mensaje exacto y una respuesta posterior, y el navegador midió audio no silencioso en los seis turnos. Los primeros starts llegaron entre 1213 y 1518 ms después del envío.

Al enviar manualmente `group-turn:...` con SDK `0.0.18`, Vera no inició habla ni produjo audio significativo durante 20.052 ms. ElevenLabs terminó con audio del saludo, pero sin el pedido ni respuesta posterior. Con un UUID v4 manual, el mismo Agent recibió el pedido y respondió: start a 1368 ms y aproximadamente 300 ms de muestras no silenciosas. Esta comparación confirma la regresión del comando custom bajo las condiciones ensayadas; no permite afirmar cuál es el validador interno del worker.

La [evidencia sanitizada](evidence/2026-09-08-group-provider-command-contract.md) conserva los ocho IDs de conversación, versiones, métricas, diferencias observadas de tracks y hashes de reports. Las consultas iniciales `processing` se reemplazan en los resultados por las reconsultas finales `done`; `hasAudio=true` por sí solo no distingue el saludo de una respuesta al pedido. El ensayo no ejercita el orquestador/floor de YUNI ni demuestra completitud acústica o ausencia de ecos.

### Aplicación real: el transporte se recupera, el audio corto todavía no

La sesión posterior `cmtthpf2l0039ilxwj7jyzd7r` ejercitó UI, API, orquestador, SDK y providers reales con entrada committed de Scribe simulada. Los tres turnos finalizaron, el backend volvió a `listening`, se observó como máximo un elemento desmuteado y hubo audio en los tres participantes. Eso confirma avance de ronda, no respuestas completas.

La medición cada 50 ms encontró 3, 5 y 7 muestras no silenciosas muteadas en Vera, Bruno y Benjita: aproximadamente 150, 250 y 350 ms de energía del stream impedida por el gate. Los tres tuvieron un nuevo start después del primer end HTTP —621, 528 y 457 ms, respectivamente— que recibió `suppress` como audio no autorizado. Se reproduce así el problema de cola/continuación con el gate heredado de `main`, independientemente de la regresión custom ya aislada. No se afirma qué palabra exacta se perdió ni cuánto de esa energía era habla inteligible.

La aceptación de respuestas cortas completas **falló en ese ensayo**. Que la base funcionara en las pruebas habituales del usuario no garantizaba este caso límite. Se decidió no habilitar barge-in sobre esa frontera de reproducción todavía incorrecta y resolver primero el cierre, sin heredar automáticamente los timers del intento anterior.

También se registró la configuración efectiva: el harness aislado utilizó los Agents con latencia 0 y estabilidad 0,65; al iniciar YUNI, el sync de `main` restableció latencia 3 y estabilidad 0,45. Ambos conservaron Flash/PCM 24 kHz. Esa diferencia impide confundir los dos ensayos como una comparación de calidad TTS. La presencia de muestras con el gate cerrado sí demuestra un problema de reproducción sin atribuirlo a la generación.

### Corrección acotada del cierre, 2026-09-09

La relectura de las siete respuestas cortas exitosas del harness encontró dos pares de start/end con la misma fuente: el segundo start llegó entre 638 y 642 ms después del primer end. La transcripción final apareció entre ambos pares, 292–385 ms después del primer end. Por eso ni el primer end ni la transcripción final podían usarse como comprobante de reproducción terminada. Tampoco se decidió contar exactamente dos pares: una respuesta larga puede segmentarse de otra manera.

Se implementó una barrera de cierre de 1000 ms sobre el mismo turno y la cola serializada existente. El owner conserva autorización `speaking` y audio mientras se espera; una continuación invalida el candidato antes del dedupe lógico. La finalización se valida dentro de la cola, incluso si estuvo esperando un ACK HTTP anterior. Sólo entonces se mutea, se marca el turno completo y se confirma un end al backend. El saludo inicial utiliza la misma espera, siempre muteado. Cierre, fallo, lease vencida y reemplazo invalidan la espera; al desmontar, se mutea el elemento antes de perder su referencia.

Esta alternativa no recupera el reducer acústico anterior, no agrega una captura WebAudio ni modifica TTS. El costo es aproximadamente un segundo adicional para ceder el turno después del último end. Es una heurística motivada por las trazas, no un ACK acústico ni una garantía contra demoras arbitrarias. Las métricas PCM quedan en el harness de QA, separadas del producto. El [checkpoint de cierre](evidence/2026-09-09-group-speech-completion.md) registra las pruebas y sus límites; no debe confundirse con aceptación de interrupciones.

Las rondas desktop corta, desktop larga de extensión fija y mobile emulado corta finalizaron con un único comando por avatar y cero muestras de respuesta bloqueadas o continuaciones suprimidas. En la larga de Bruno se observó PCM hasta 75 ms después del último end de control: la barrera lo conservó audible. Un ensayo largo abierto agotó los 45 segundos del harness después de dos cierres; se conserva como no aprobado, no se oculta ni se atribuye a una falla de red. Las 333 pruebas web y la evidencia de providers respaldan esta corrección bajo las condiciones medidas; parlantes, auriculares, dispositivos físicos y entrada Scribe real siguen pendientes.

### Contrato de interrupción y evidencia textual

Un ensayo sandbox separado muteó el elemento y llamó `interrupt()` después de 1200 ms acumulados de PCM no silencioso. Llegó un único `speak_ended` a los 489 ms —registrado por SDK y raw— y siguió habiendo PCM remoto hasta los 680 ms, siempre muteado. No se recibieron `interruption` ni `agent_response_correction` en los siguientes 12 segundos. El `source_event_id` terminal no coincidió con el UUID del `user_message`.

La consulta final de ElevenLabs quedó `done`, con el pedido recibido y una respuesta de 283 caracteres marcada como interrumpida, frente a un borrador vivo de 1157 caracteres. Esto no acredita qué oyó la persona: demuestra que el historial final puede estar truncado sin una corrección en vivo observada. No se ensayó reutilización del connector ni se emitió otra orden después del corte.

La evidencia refuerza la decisión de no esperar correcciones para detener/cancelar y de conservar por separado borrador, fragmento provider e incertidumbre. También impide tratar `interrupt(): void`, el terminal de control o una correlación supuesta como confirmación de silencio/reutilización. Es análisis de contrato para las fases siguientes, no implementación o aceptación de barge-in.

## Alternativas reconsideradas y solución elegida

Se consideró seguir reparando la rama acumulada, desactivar las interrupciones, aumentar timeouts, modificar únicamente la voz, agregar otro VAD o migrar toda la conversación a otra infraestructura. Se eligió una rama limpia desde `main`, conservando la rama anterior y su evidencia para recuperar piezas de forma selectiva.

La primera fase migró el transporte grupal al SDK publicado `0.0.18` y sus métodos públicos. La comparación exigió comprobar que el contexto y el mensaje llegan al Agent elegido, que éste genera una respuesta audible y que el siguiente participante recibe el contexto correcto. Conservó la configuración TTS de la base y mantuvo las interrupciones deshabilitadas mientras se aislaba el cierre prematuro.

El incremento del 2026-09-12 incorpora una transacción de cancelación humana sobre el floor de YUNI. El corte perceptible y la cancelación no esperan una corrección textual. El nuevo turno sí respeta la cancelación autoritativa, el commit de Scribe y la disponibilidad del connector reemplazado.

El contexto distingue tres cosas: el borrador generado por el Agent, el fragmento informado por el provider y la parte pendiente o de exposición desconocida. `agent_response` contiene texto completo desde el comienzo del audio; no significa que el usuario haya oído todo. `agent_response_correction` es la mejor corrección textual disponible cuando se puede atribuir al turno, pero tampoco acredita por sí sola el instante exacto de reproducción en el navegador. Si no hay evidencia suficiente, se conserva esa incertidumbre. El detalle normativo se mantiene en ADR 0026.

### Retomar el objetivo de producto, 2026-09-12

Después del ajuste del cierre, el usuario confirmó que los avatares volvieron a hablar, pero señaló que todavía no podía interrumpirlos. La revisión encontró una causa directa en nuestra implementación: Scribe sólo tenía listener de committed, el frontend descartaba la frase mientras existía un floor y el control manual seguía deshabilitado. No se trataba de un fallo nuevo demostrado del micrófono ni de ElevenLabs: la reconstrucción había recuperado la conversación base, pero todavía no había completado el objetivo de producto.

El usuario pidió continuar con las interrupciones y dejó fuera de alcance un desfase intermitente de lip-sync. Se separan así los problemas: no se vuelve a cambiar la reproducción, el SDK o el preset TTS al implementar la preempción humana. Tampoco se declara resuelto el desfase ni se lo usa para posponer nuevamente la mejora principal.

La implementación retoma Scribe como único canal humano y agrega clasificación de parciales: comandos iniciales de detención y `sí/ok/dale + pero` cortan inmediatamente; otra intervención significativa usa una confirmación de 300 ms sin reiniciar el plazo por cada parcial. Se incorporan variantes de backchannels que antes faltaban, como `Okey.`, y sus combinaciones. Una ventana efímera de texto generado por avatar —2,5 segundos, hasta 64 tokens— ayuda a ignorar coincidencias de eco. Es una heurística, no identificación biométrica ni evidencia del texto efectivamente oído. Si el parcial empezó mientras se preparaba una respuesta no corta; su committed se conserva para cancelar la intención obsoleta o atenderlo al quedar libre el floor.

El corte cierra todos los medios antes de llamar al SDK o a la API. Una generación local invalida operaciones de control anteriores; el recorrido normal conserva la cola serializada que protegía el avance entre avatares. La cancelación transaccional anclada a ronda/turno produce una receipt durable e invalida toda la cola anterior, incluso si el owner pasó de A a B dentro de esa ronda. Un evento del provider no tiene esa autoridad. El committed humano se conserva antes o después del ACK y la cancelación usa hasta tres intentos con el mismo identificador, con silencio y recuperación explícita ante un fallo.

La evidencia anterior no probó que el mismo connector pudiera reutilizarse con seguridad tras el corte. Por eso la nueva implementación reemplaza sólo los connectors afectados y vincula sus attempts a la receipt, en lugar de considerar suficiente un terminal ambiguo o una espera fija. El costo es latencia de reconexión y operación adicional; ese tradeoff debe medirse en llamadas reales. Detener el connector también puede impedir recibir una corrección tardía: el contexto conserva el borrador como generado y declara desconocido lo oído cuando no hay fragmento informado.

`GroupVoiceInterruptionEvent` registra la cancelación y `GroupVoiceInterruptedTurn` separa borrador, fragmento provider y certeza desconocida. La transacción conserva respuestas ya completadas; sólo el fragmento informado aparece como mensaje interrumpido. Las correcciones tardías atribuibles actualizan el mismo registro, no una ronda posterior. La migración aditiva `20260912120000_group_human_interruption_context` se verificó en una base aislada y después se aplicó a desarrollo. El modelo canónico de receipt usa la tabla nueva `GroupVoiceHumanInterruptionReceipt`, preservando la tabla legacy `GroupVoiceInterruptionEvent` de la migración `20260824120000` sin modificarla.

Antes de aplicar la migración local se creó el backup `/private/tmp/yuni-before-barge-in-xYmPtw/yuni_dev.dump`. Los conteos antes y después coincidieron: 11 usuarios, 7 avatares, 200 mensajes, 51 conversaciones y 13 receipts legacy. Es una comprobación de preservación de esos conjuntos, no una afirmación de igualdad byte a byte de toda la base. No se tocó producción ni se modificaron migraciones ya aplicadas.

Este incremento implementa las fases 2 y 3, pero no las declara aceptadas por QA físico. Los resultados automatizados del checkpoint se registran más abajo y no se confunden con los totales históricos. La [decisión canónica](decision-records/0026-user-preemptible-group-call-floor.md) y la [guía operativa](../integrations/group-calls-elevenlabs-liveavatar.md) definen el flujo y la matriz pendiente sin duplicar otro ensayo narrativo.

### Primer checkpoint técnico de barge-in, 2026-09-12

El primer ensayo de aplicación con providers, sesión `cmtyv84v5000nulmf8ywqf5km`, falló con HTTP 500 de la API. Su causa todavía no está confirmada; no se elimina del registro ni se lo atribuye automáticamente al proveedor.

El ensayo posterior, sesión `cmtyverz5000fg8pobz2xjf4l`, utilizó providers reales con Scribe simulado. Observó cierre del gate 15 ms después del disparo, máximo un elemento desmuteado, una receipt de cancelación y la ronda anterior cancelada. Hubo dos submits humanos y dos comandos de usuario en total; Bruno recibió el turno siguiente y reprodujo audio. El reemplazo se verificó en sandbox.

La sesión `cmtyvl1ir000fau5g8gika6rq` ejercitó la elección del mismo avatar después del corte. El gate cerró en 24 ms, se mantuvo un máximo de un elemento desmuteado y hubo una receipt, dos submits humanos y dos comandos. Vera volvió a responder sobre un connector nuevo y se observaron 19 muestras de energía de audio. Los dos ensayos cumplieron sus once comprobaciones técnicas dirigidas. Estas observaciones no prueban inteligibilidad, completitud acústica ni reconocimiento del micrófono real.

Desde el parcial inyectado hasta la primera energía de la respuesta nueva transcurrieron 7.475 ms al cambiar de avatar y 8.401 ms al volver al mismo. El corte local fue rápido, pero la continuación no: esas pausas incluyen cancelación, reemplazo, startup, ruteo y generación. Se documentan como un costo pendiente de optimización, no como una conversación ya natural ni como latencia exclusivamente del proveedor. Una reutilización más rápida sigue requiriendo evidencia de aislamiento seguro del connector.

Las receipts de esos ensayos conservaron borradores de 349 y 382 caracteres, respectivamente, con `reportedFragment: null`, fuente nula, `heardCertainty: "unknown"` y sin `messageId`. No se observó una corrección del provider. En cada caso la ronda anterior quedó con tres turnos interrumpidos y el nuevo turno completó una respuesta de cinco caracteres. Esto verifica la conservación del borrador y la incertidumbre, **no** la visualización real de un fragmento corregido en historial: ese recorrido sólo tiene evidencia automatizada en este checkpoint.

El oráculo experimental quedó **inconcluso en ambos ensayos**, por lo que no se marcan como aceptación formal. La prueba con micrófono físico, parlantes/auriculares, ecos y backchannels sigue pendiente. La [evidencia específica](evidence/2026-09-12-group-human-barge-in.md) concentra artefactos y resultados, sin trasladar una observación favorable a los casos todavía no comprobados. La necesidad operativa de reiniciar la API tras regenerar Prisma no constituye una causa confirmada del primer HTTP 500.

## Novedades de ElevenLabs evaluadas

- **V3 Conversational:** disponible para Agents desde el [2026-02-09](https://elevenlabs.io/docs/changelog/2026/2/9). Es `eleven_v3_conversational`, distinto de `eleven_v3`, y aporta expresividad. Se evaluará por separado después de estabilizar turnos, con las voces del producto; no se lo presenta como arreglo del mensaje ausente.
- **Turn-taking con prosodia:** [Expressive Mode](https://elevenlabs.io/docs/eleven-agents/customization/voice/expressive-mode) utiliza señales de Scribe para interpretar cuándo hablar o esperar. En YUNI los Agents reciben texto y el micrófono lo tiene un Scribe externo; cambiar `turn_eagerness` en cada Agent no incorpora automáticamente esas señales al orquestador grupal.
- **`agent_response_complete`:** anunciado el [2026-04-27](https://elevenlabs.io/docs/changelog/2026/4/27), puede distinguir un final de respuesta completo. No aparece en la tabla de eventos reenviados del connector LiveAvatar; debe comprobarse su disponibilidad y relación con el audio real antes de depender de él.
- **Filtrado de fondo:** [Scribe Realtime](https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime) ofrece `filter_background_audio`. Requiere QA comparativo; no es identificación biométrica y no puede combinarse con timestamps. Se mantiene apagado durante la prueba base.
- **Speech Engine:** [disponible desde mayo](https://elevenlabs.io/docs/changelog/2026/5/25), delega voz y turn-taking conservando un LLM propio. Implicaría rediseñar la conexión con LiveAvatar y el manejo de los Agents/Knowledge Bases. Las sesiones de orquestador self-hosted anunciadas en [agosto](https://elevenlabs.io/docs/changelog/2026/8/17) están marcadas como experimentales. Ninguna es dependencia de esta reparación.

## Síntoma, evidencia, mitigación y resultado

| Síntoma                                             | Evidencia                                                                                       | Causa o hipótesis                                            | Mitigación evaluada                                               | Resultado                                                         |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| Avatares simultáneos o sin voz                      | QA real de agosto                                                                               | Coordinación de estados y eventos; causa completa no aislada | Cancelación mínima, luego reducer acústico                        | El intento anterior no superó QA real                             |
| Una palabra inaudible                               | Traza de agosto y aplicación previa con 150/250/350 ms aproximados de energía muteada           | Cierre prematuro del gate y starts posteriores suprimidos    | Barrera acotada de cierre con continuaciones, validada en la cola | Tres rondas técnicas aprobadas el 2026-09-09; QA físico pendiente |
| Palabra distorsionada                               | Lifecycle normal; PCM correcto                                                                  | TTS, transporte o reproducción                               | Preset y métricas del intento anterior                            | Causa pendiente de comparación fuente/navegador                   |
| `Okey.` corta al avatar                             | Receipt 604 ms antes del commit                                                                 | Backchannel mal clasificado                                  | Normalización y clasificación híbrida                             | Regresión aislada cubierta entonces; QA global falló              |
| “Preparando respuesta” hasta watchdog               | Ensayo custom falla; sin ID/UUID se recibe el pedido y la nueva aplicación finaliza tres turnos | Regresión reproducida del contrato del comando custom        | SDK `0.0.18` y envío público con UUID                             | Entrega y avance verificados; completitud de audio no aceptada    |
| Orquestador desconoce el turno interrumpido         | El intento reducido descartaba el fragmento                                                     | Pérdida de contexto conversacional                           | Separar generado, informado por provider y pendiente/desconocido  | Implementado para validación el 2026-09-12; QA real pendiente     |
| La voz volvió, pero el usuario no puede interrumpir | Confirmación del usuario y listener que descartaba committed durante el floor, 2026-09-12       | Reconstrucción parcial: barge-in todavía deshabilitado       | Parciales Scribe, cancelación durable, reemplazo y nuevo ruteo    | Implementado para validación; sin aceptación de QA físico todavía |

## Validación y resultados de la reconstrucción

| Fase                                  | Evidencia requerida                                                                                        | Estado al 2026-09-12                                                                                              |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1. Contrato de envío y llamada normal | Versiones y commit; recepción en ElevenLabs; audio; secuencia A→B→C; IDs observados                        | Contrato y tres rondas técnicas verificados; usuario confirmó recuperación de voz; QA físico exhaustivo pendiente |
| 2. Corte y nuevo ruteo                | Un corte por frase humana, ronda cancelada, committed conservado y próximo turno válido                    | IMPLEMENTADO PARA VALIDACIÓN; QA físico pendiente                                                                 |
| 3. Contexto interrumpido              | Generado e informado por provider separados; incertidumbre explícita; correcciones tardías correlacionadas | IMPLEMENTADO PARA VALIDACIÓN; QA real pendiente                                                                   |
| 4. QA acústico y expresividad         | Fuente/navegador, parlantes/auriculares, desktop/mobile, cortas/largas, eco y carga                        | PENDIENTE                                                                                                         |

Cada registro posterior debe incluir fecha, commit, SDK, parámetros efectivos, IDs no secretos, acciones realizadas, resultado y limitaciones. Los tests con mocks verifican nuestra lógica; las llamadas con proveedores verifican el contrato externo. Una falla de QA no se reemplaza por un conteo de tests aprobados.

La validación automatizada de la fase 1 reportó 308 tests web, 25 de dominio, 16 de avatars, 36 de voice y 270 de API aprobados, con 6 casos API omitidos; typecheck aprobó los 12 paquetes y lint web aprobó. Es evidencia del cambio de transporte, no aceptación acústica de la llamada. El lockfile conserva las dependencias transitivas de `main` y cambia únicamente el SDK `0.0.17` por `0.0.18`. No hubo cambios de schema ni migraciones. El harness real confirmó el contrato externo y la aplicación real completó la ronda, pero no superó el control de cola de audio. El QA físico y la entrada de voz humana real siguen pendientes.

### Suites ejecutadas en el checkpoint del 2026-09-12

| Suite              | Resultado ejecutado                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| Web                | 431/431 aprobados en la repetición completa con salida 0; incluye 76 tests de lifecycle grupal  |
| API                | 286/286 aprobados, incluidos los seis casos de integración                                      |
| DB                 | 86/86 aprobados; incluye 32 tests de floor y la comprobación de preservación de la tabla legacy |
| AI                 | 36/36 aprobados                                                                                 |
| Domain             | 26/26 aprobados                                                                                 |
| Voice              | 36/36 aprobados                                                                                 |
| Herramientas de QA | 24/24 aprobados                                                                                 |
| Typecheck y lint   | Aprobados en los 12 paquetes                                                                    |

Una primera ejecución web aprobó las 431 aserciones pero terminó con salida 1 por un error de teardown `window is not defined` en `context-toast.lifecycle`, mientras otra tarea modificaba esa UI. Esa corrida no se cuenta como exitosa. La repetición completa de las 18:09:19 terminó correctamente; la corrida DB de las 18:10:35 incluyó la compatibilidad legacy habilitada. Los totales corresponden a las suites del workspace en ese checkpoint, no a 431 pruebas exclusivas de interrupciones. La [evidencia del checkpoint](evidence/2026-09-12-group-human-barge-in.md) conserva el detalle; estos resultados no sustituyen QA físico ni una corrección provider observada en vivo.

## Fuentes y trazabilidad

- [ADR 0005: ElevenLabs Expressive Conversation UX](decision-records/0005-elevenlabs-expressive-conversation-ux.md)
- [ADR 0019: base de floor estricto](decision-records/0019-strict-floor-independent-liveavatar-group-sessions.md)
- [ADR 0026: decisión de interrupción y reconstrucción](decision-records/0026-user-preemptible-group-call-floor.md)
- [Plan 39](../plan-prompts/39-user-preemptible-group-call-floor.md) y [guía operativa](../integrations/group-calls-elevenlabs-liveavatar.md)
- [Checkpoint de interrupción humana, 2026-09-12](evidence/2026-09-12-group-human-barge-in.md)
- [LiveAvatar: contrato del connector ElevenLabs](https://docs.liveavatar.com/docs/lite-mode/connectors/elevenlabs-agent)
- [ElevenLabs: eventos del cliente](https://elevenlabs.io/docs/eleven-agents/customization/events/client-events)
- [ElevenLabs: comandos y contexto](https://elevenlabs.io/docs/eleven-agents/customization/events/client-to-server-events)
- [LiveKit: publicación confiable de datos](https://docs.livekit.io/transport/data/packets/)
- [Tests de lifecycle grupal](../../apps/web/group-interact-call.lifecycle.test.tsx)
