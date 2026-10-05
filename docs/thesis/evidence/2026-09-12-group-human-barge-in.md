# Checkpoint: interrupción humana y nuevo ruteo grupal

Fecha: **2026-09-12**, America/Argentina/Buenos_Aires. Rama `lucaslovaglio/group-user-barge-in-v2`, cambios de trabajo sobre `e52211c`, todavía sin commit ni push al registrar los ensayos. No se modifican SDK `0.0.18`, TTS, voces, lip-sync ni la barrera de cierre natural de un segundo.

Estado: **implementado para validación, QA físico pendiente**. Dos ensayos con providers reales verificaron corte, cancelación y respuesta nueva; Scribe y micrófono fueron simulados. El oráculo de interrupción conserva `experimental-not-accepted` y `inconclusive`: sus comprobaciones técnicas no son aceptación perceptual ni de reconocimiento de voz.

Este registro contiene resultados y trazabilidad. La explicación del incidente permanece en el [estudio de caso](../group-call-audio-stability-case-study.md) y la decisión en [ADR 0026](../decision-records/0026-user-preemptible-group-call-floor.md).

## Condiciones del experimento

- App local real: frontend, API, orquestador, SDK y connectors ElevenLabs/LiveAvatar. Grupo de tres participantes, Chrome desktop automatizado con perfil temporal, micrófono ficticio y autoplay permitido.
- Se solicita una respuesta larga y se espera evidencia de inicio más PCM energético del primer avatar. Se inyecta un parcial de detención y, unos 100 ms después, una frase committed que pide una respuesta de una palabra al mismo avatar o a otro.
- Scribe no reconoce audio real en este ensayo. No verifica eco, permisos de micrófono, inteligibilidad, Bluetooth, parlantes ni auriculares.
- Antes de iniciar cada connector, incluidos los reemplazos, se comprueban claims sandbox recibidos de la API loopback autenticada. No se verifica la firma JWT (`signatureVerified: false`); después del inicio, se exige metadata del provider HTTP 200 con `isSandbox: true`.
- El perfil TTS antes/después de cada llamada fue idéntico: `eleven_flash_v2_5`, `pcm_24000`, latencia 3, estabilidad 0,45, velocidad 0,98 y similitud 0,78. Este incremento no aplica el preset experimental anterior.
- Todas las llamadas creadas por el ensayo se cerraron con HTTP 200. No se cerraron sesiones ajenas ni se borraron conversaciones de QA.

## Resultados de proveedores

| Ensayo                      | Creación del reporte (UTC) | Sesión YUNI                 | Resultado                                                                              |
| --------------------------- | -------------------------- | --------------------------- | -------------------------------------------------------------------------------------- |
| Primer intento, otro avatar | `20:56:20.020`             | `cmtyv84v5000nulmf8ywqf5km` | Fallido: API 500, sin receipt ni nuevo ruteo                                           |
| Vera → Bruno                | `21:01:31.971`             | `cmtyverz5000fg8pobz2xjf4l` | 11 comprobaciones técnicas verdaderas; QA físico pendiente                             |
| Vera → Vera                 | `21:06:28.595`             | `cmtyvl1ir000fau5g8gika6rq` | 11 comprobaciones técnicas verdaderas; nuevo connector verificado; QA físico pendiente |

### Primer ensayo: fallo conservado

Los endpoints de eventos de habla y cancelación produjeron diez HTTP 500 concentrados entre `20:56:46.128` y `20:56:46.719 UTC`. Se observaron seis requests de cancelación con la misma identidad: al agotarse los primeros tres antes del commit, éste iniciaba otra tanda automáticamente. El frontend cerró el audio, pero no hubo receipt durable ni nueva ronda. El harness agotó sus 45 segundos (`QaDeadlineExceeded`); la cancelación que se ve después en DB corresponde al cierre de cleanup, no a una interrupción humana confirmada.

Se corrigió la repetición automática: agotar los intentos exige recuperación explícita, incluso si llega después el committed. La frase permanece retenida. La regresión automatizada comprueba tres fallos, commit tardío sin requests adicionales y un único reenrutado tras pulsar el botón.

**La causa de los 500 no quedó determinada.** El reporte no contiene la excepción interna de la API. Los eventos sin turno que obtuvieron HTTP 200 ocurrieron unos 29 segundos después, no simultáneamente. Había cambios y reinicios de desarrollo en esa ventana; atribuir el fallo a hot reload o a un cliente Prisma anterior sería una hipótesis, no un diagnóstico confirmado. Los dos ensayos siguientes con el código estable no reprodujeron el error. Como precaución operativa, después de generar Prisma o aplicar schema se debe reiniciar la API; cambiar archivos generados no reemplaza por sí solo un cliente ya instanciado.

### Corte y recuperación observados

| Medida                                                 | Vera → Bruno | Vera → Vera |
| ------------------------------------------------------ | -----------: | ----------: |
| Parcial inyectado → primera muestra con gate cerrado   |        15 ms |       24 ms |
| Máximo de elementos desmuteados observado              |            1 |           1 |
| Identidades de interrupción / receipts                 |        1 / 1 |       1 / 1 |
| Submits humanos totales, inicial + intervención        |            2 |           2 |
| Comandos `user_message` totales                        |            2 |           2 |
| Muestras energéticas habilitadas de la respuesta nueva |           28 |          19 |
| Parcial → primera energía de la respuesta nueva        |     7.475 ms |    8.401 ms |
| HTTP 500 durante el ensayo                             |            0 |           0 |

La ronda anterior terminó `cancelled`, con sus tres turnos `interrupted`. La nueva ronda tuvo un único turno completo del avatar solicitado y volvió a `listening`. La confirmación de ElevenLabs identificó la conversación a partir de metadata del connector: pedido recibido, respuesta posterior de cinco caracteres, audio disponible y estado `done`.

En el segundo escenario, Vera recibió el nuevo comando en la sesión `76a3edc0-3160-4924-82d5-8d553c4c6eeb`, diferente de la interrumpida `7f777ce6-0387-4fd3-8540-12b597c4b042`. El reemplazo no se confunde con reutilizar una sesión cortada ni con suponer que un terminal sin correlación la dejó limpia.

La pausa hasta la nueva respuesta **sigue siendo un costo importante**: estos 7,5–8,4 segundos incluyen cancelación, creación/conexión del reemplazo, startup, nuevo ruteo y generación. No se atribuyen enteramente al proveedor ni se presentan como tiempo objetivo de conversación natural. Optimizar esa pausa requiere evidencia del contrato de reutilización y una comparación separada; no se sacrifica la exclusión de voz para ocultarla.

El muestreo es nominalmente cada 20 ms, con umbral `RMS > 0.001`. “Energía habilitada” exige elemento no muteado, volumen positivo y reproducción no pausada, pero no demuestra palabras inteligibles ni salida física. La latencia incluye incertidumbre del muestreo y de la inyección Playwright/socket; no es una medición de latencia desde la voz humana. No se usa el oráculo de cierre normal para reprobar PCM intencionalmente silenciado después de un corte.

## Contexto persistido

La lectura posterior de las receipts confirmó, sin imprimir texto:

| Sesión                      | Longitud del borrador generado | Fragmento provider | Certeza de audición | Mensaje assistant interrumpido |
| --------------------------- | -----------------------------: | ------------------ | ------------------- | ------------------------------ |
| `cmtyverz5000fg8pobz2xjf4l` |                 349 caracteres | Ausente            | `unknown`           | No creado                      |
| `cmtyvl1ir000fau5g8gika6rq` |                 382 caracteres | Ausente            | `unknown`           | No creado                      |

Es el comportamiento esperado sin corrección: conservar contenido pendiente sin inventar lo oído ni publicar el borrador como respuesta pronunciada. Las receipts preceden a los nuevos pedidos. La propagación diferenciada al orquestador/contexto y la actualización histórica por corrección tardía están cubiertas por integración y tests; estos dos ensayos **no verifican recepción real de `agent_response_correction` ni la visualización de un fragmento corregido**.

## Persistencia y datos existentes

La migración nueva `20260912120000_group_human_interruption_context` se verificó primero en una base aislada y luego se aplicó a desarrollo local con backup PostgreSQL custom verificado. No se ejecutó contra producción, no se editaron migraciones aplicadas y no se hizo reset.

El modelo `GroupVoiceInterruptionEvent` usa la tabla física nueva `GroupVoiceHumanInterruptionReceipt`. Se conserva intacta la tabla experimental anterior `GroupVoiceInterruptionEvent`, creada por una migración histórica de la rama de respaldo. Antes y después de aplicar la migración se mantuvieron **11 usuarios, 7 avatares, 200 mensajes, 51 conversaciones y 13 receipts antiguas**. Las llamadas de QA posteriores agregan sus propios registros y no se confunden con esa comparación previa.

Backup local: `/private/tmp/yuni-before-barge-in-xYmPtw/yuni_dev.dump`, permisos `0600`, listado verificado con `pg_restore`. Es un archivo temporal local, no un backup de producción ni un artefacto para versionar.

## Validación automatizada

Checkpoint final del workspace compartido, incluyendo cambios concurrentes ajenos a interrupciones:

- Web: **431/431**, incluyendo **76 lifecycle grupales**, **66 clasificación/eco**, **15 cierre natural** y **9 runtime**.
- API: **286/286**, con las seis pruebas de integración habilitadas.
- DB: **86/86**, incluyendo **32 floor/integración**. La prueba de compatibilidad legacy se habilitó explícitamente con `TEST_LEGACY_GROUP_INTERRUPTION_COMPAT=true` en la base aislada que contiene ambas tablas.
- AI: **36/36**; dominio: **26/26**; voz: **36/36**; herramientas QA: **24/24**.
- Typecheck y lint: **12 paquetes aprobados**.

Una ejecución web anterior completó las 431 aserciones, pero terminó con un error de teardown `window is not defined` atribuido a `context-toast.lifecycle.test.tsx`. No se la contó como aprobada. La repetición completa terminó sin errores y con exit code 0; no se modificó ese test desde esta tarea ni se afirma haber aislado la causa.

La matriz cubre commit antes/después del ACK, parciales duplicados, comienzo durante preparación, backchannels, eco textual, micrófono muteado, A→B con ACK atrasado, cancelación agotada, reintento explícito, reemplazo fallido, cierre, epoch, unmount, borradores, correcciones tardías y preservación de respuestas completadas. No sustituye la matriz física.

## Seguimiento: drift local y desconexiones reales

El usuario volvió a reportar dos problemas después del checkpoint: `migrate dev` pedía reset por la migración histórica ausente, y el avatar interrumpido se desconectaba con una pausa poco fluida. Se investigaron separadamente; los ensayos anteriores no se reescriben como si hubieran validado estas correcciones.

### Historial restaurado sin modificar datos

Conservar la tabla legacy al aplicar la migración v2 no resolvía el historial de desarrollo. Se restauró `20260824120000_user_preemptible_group_call_floor/migration.sql` exactamente desde `afa73e8`; su SHA-256 coincide con el registro aplicado. El schema ahora representa esa estructura como `LegacyGroupVoiceInterruptionEvent`, mapeada a la tabla antigua e ignorada por Prisma Client, con su enum, relaciones e índices. Así una próxima migración no propone eliminarla. No se alteró el SQL ya aplicado de ninguna de las dos versiones ni se reemplazaron registros de `_prisma_migrations`.

Verificaciones ejecutadas:

- **23/23** archivos de migración coinciden con los checksums locales aplicados, sin registros faltantes o fallidos.
- `migrate status` sobre desarrollo: **up to date**.
- DB de desarrollo → schema Prisma: **No difference detected**.
- Reproducción de las 23 migraciones desde cero en `yuni_history_restore_verify_20260912` → DB de desarrollo: **No difference detected**.
- `migrate dev --skip-generate` sobre esa base aislada: **Already in sync, no schema change or pending migration was found**.

El intento de `migrate dev --create-only --skip-generate` sobre desarrollo llegó a pedir nombre para una migración vacía y se canceló; no se creó ni aplicó otra migración. La ejecución normal sobre los datos de desarrollo fue bloqueada por el control de seguridad, por lo que su comprobación completa se hizo exclusivamente en la base aislada. No se afirma haber ejecutado el comando normal sobre `yuni_dev`.

Antes/después de esta reparación se conservaron **11 usuarios, 7 avatares, 211 mensajes, 56 conversaciones, 13 receipts legacy y 5 receipts v2**. La huella MD5 del agregado ordenado de las filas legacy se mantuvo `2db71f6b57500053fe118ca6ab3add14`; se usa sólo para comparar preservación, no como garantía criptográfica. Las diferencias respecto del checkpoint anterior provienen de las llamadas posteriores, no de una migración destructiva. Esta reparación cambió archivos, no datos de desarrollo.

### Llamadas del usuario y fallos de lifecycle

Lectura posterior de DB, timestamps UTC del mismo día:

| Sesión / avatar                     | Interrupción   | Evidencia posterior                                                                                            |
| ----------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------- |
| `cmtyxipst00fdau5gmaj8j1a4` / Bruno | `22:01:33.313` | Reemplazo activado aproximadamente 4,94 s después; ronda nueva a las `22:01:39.898` y voz a las `22:01:41.401` |
| `cmtyxk49w00inau5gdpz3rjti` / Vera  | `22:02:28.234` | Reemplazo activado a las `22:02:32.474`; sesión finalizada a las `22:02:33.950`, sin ronda nueva               |

Las receipts nuevas y los attempts de reemplazo se persistieron: no hay evidencia en estas llamadas de tablas faltantes que impidieran cancelar. La desconexión y parte de la demora corresponden a la estrategia explícita de retirar el connector cortado y crear otro. La causa exacta del último cierre de llamada no queda probada por estos registros y no se atribuye al usuario.

En Vera, el provider antiguo se detuvo a las `22:02:28.954`; 48 ms después se reportó `session_stopped` de ese intento viejo, aunque el reemplazo ya existía. El backend lo trató como obsoleto. La revisión del frontend reprodujo dos bugs:

1. Un cierre del connector retirado durante el request de reemplazo todavía entraba en la recuperación ordinaria de participante. Ahora hace su limpieza, pero no publica un nuevo failure si pertenece al episodio de interrupción activo.
2. La excepción para fallos durante inicialización del reemplazo duraba toda su vida. Ahora se limita a esa inicialización: una desconexión real posterior vuelve a notificar el fallo y recuperar normalmente.

Las tres regresiones nuevas —stop/disconnect del viejo durante el ACK y fallo del nuevo después de inicializarse— fallaban antes y pasan con el fix. Resultado posterior: **79 lifecycle grupales**, **436 web**, **287 API con integración** y **89 DB** aprobados; typecheck/lint de 12 paquetes aprobados. Los totales incluyen los cambios concurrentes del workspace. La preservación de receipts legacy ya se prueba en toda ejecución DB con integración, sin flag adicional, y tres tests nuevos protegen el SQL aplicado y la separación de modelos.

No se realizaron nuevas llamadas a proveedores después de estos dos fixes: falta repetir QA físico. Tampoco se eliminó la reconexión deliberada ni se acreditó menor latencia. El próximo incremento de fluidez deberá validar un contrato seguro de reutilización o desacoplar la respuesta de un avatar sano de la reconexión del retirado, sin reabrir voz ambigua ni perder contexto.

### Video posterior: el reemplazo deliberado sigue siendo visible

Un nuevo video del usuario, `Screen Recording 2026-09-12 at 7.18.38 PM.mov` (49,02 s), corresponde a la sesión `cmtyy5oaf004md0m5exnc2ibb`, iniciada a las `22:18:39 UTC`. La inspección local muestra a Bruno hablando y, después de cada corte, su tile pasando por «Conectando con el avatar». Se extrajeron fotogramas localmente sin modificar ni subir el original.

La DB permite separar este síntoma de los fallos corregidos en el checkpoint anterior:

| Avatar | Interrupción (UTC) | Tiempo hasta activar su reemplazo | Resultado          |
| ------ | ------------------ | --------------------------------: | ------------------ |
| Bruno  | `22:19:00.164`     |                           3,142 s | Reemplazo activado |
| Bruno  | `22:19:09.619`     |                           3,663 s | Reemplazo activado |
| Bruno  | `22:19:21.660`     |                           2,858 s | Reemplazo activado |

Las tres receipts y los tres reemplazos se persistieron; hubo un nuevo ruteo después de cada interrupción. No se registraron fallos de participante de Bruno en esta sesión. **El síntoma persiste porque la implementación todavía cierra y reemplaza obligatoriamente el connector interrumpido**, no porque esos reemplazos hayan fallado. Los fixes anteriores evitaron notificaciones de fallo incorrectas, pero no eliminaron esta desconexión deliberada ni su costo visual y temporal. Este resultado no satisface la expectativa de continuidad natural del usuario.

Después del intervalo grabado, a las `22:19:43.479 UTC`, terminó la llamada completa. Vera y Benjita conservaban sus connectors originales y emitieron `session_stopped` aproximadamente 60 s después de activarse. La consulta posterior a LiveAvatar respondió HTTP 200 para ambas sesiones (`1912598c-beba-424f-b12d-1d90468fc76f` y `c89a1a03-4a15-446d-a9b1-86b4b46c6f83`) con `is_sandbox: true` y `end_reason: MAX_DURATION_REACHED`. El backend cierra el grupo cuando quedan menos de dos participantes. Este cierre por duración sandbox es independiente de los reemplazos visibles de Bruno; no se atribuye al video un final que ocurrió después de terminar la grabación.

La migración no explica las reconexiones observadas: sus escrituras de cancelación y recuperación funcionaron. El siguiente experimento debe comprobar `interrupt()` y un segundo `sendUserMessage()` sobre la misma instancia y sesión, identificando terminales, fuentes de habla y PCM remanente. Recibir un terminal o esperar un intervalo fijo no acredita por sí solo que sea seguro reabrir el audio. La barrera backend actual exige reemplazo, por lo que tampoco basta con quitar `stop()` del frontend: una eventual reutilización necesita resolver esa barrera de forma autenticada, idempotente y vinculada al intento/receipt, sin permitir que un evento atrasado afecte una ronda nueva.

### Ensayo aislado de interrupción y reutilización nativa

A las `22:31:57.158 UTC` se inició un único ensayo adicional con el Agent grupal de Bruno y un avatar visual de prueba. No usa la app, Scribe ni el orquestador: prueba exclusivamente el contrato del connector mediante `ElevenLabsAgentSession` de SDK `0.0.18`, con `voiceChat` muteado como en la configuración de referencia. No se cambian voces, TTS ni configuraciones del Agent. Los guards de token y la consulta posterior a LiveAvatar confirmaron sandbox. La sesión fue `74793c11-fe42-4650-bffa-548771699907`, con conversación ElevenLabs `conv_8901m2bvzn31e67s25mrdc1bjxhy`; cleanup REST HTTP 200.

Después de once muestras energéticas habilitadas (muestreo nominal de 50 ms), el harness muteó el medio y llamó `interrupt()`, sin `stop()` ni crear otra sesión. Esperó un terminal, observó 300 ms adicionales muteado y envió un segundo pedido breve por la misma instancia SDK. Ese intervalo es una ventana diagnóstica del ensayo, **no una garantía ni una nueva política de producción**.

| Observación                                                                                | Resultado de este ensayo                                                             |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Corte → `speak_ended` de la fuente anterior                                                | 909 ms                                                                               |
| PCM remanente después del corte                                                            | Se siguió recibiendo muteado hasta 805 ms después del corte                          |
| Muestras energéticas en los 300 ms observados después del terminal                         | 0                                                                                    |
| Segundo comando → primera muestra energética habilitada                                    | 1.264 ms                                                                             |
| Fuente de habla de la respuesta nueva                                                      | Distinta de la anterior; start/end coincidentes entre sí                             |
| PCM habilitado antes del nuevo start / eventos de fuente vieja después del segundo comando | 0 / 0                                                                                |
| Sesión y tracks                                                                            | Los mismos; cero stops/disconnects durante el ensayo                                 |
| Recepción en ElevenLabs                                                                    | Dos pedidos exactos confirmados y respuesta posterior al segundo de cinco caracteres |

Se observaron doce muestras energéticas habilitadas de la respuesta nueva, incluyendo su continuación. Esto acredita recepción de audio en el navegador, no inteligibilidad ni reproducción física. El resultado es favorable a la viabilidad de reutilizar el connector, **no aceptación general**: permanece `experimental`, `inconclusive` y exit code 1 intencional. Las [trazas de este ensayo](2026-09-12-native-interrupt-reuse-trace.json) conservan evidencia sin contenido textual.

Dos detalles impiden convertir este resultado en un atajo inseguro:

1. El terminal local de habla llegó a los `10.012 ms` del ensayo, pero `interruption` de ElevenLabs apareció a los `10.610 ms` y `agent_response_correction` a los `10.614 ms`, después del segundo comando (`10.330 ms`). La corrección contiene 45 caracteres y no trae `source_event_id` en el evento observado. No prueba qué oyó el usuario ni puede asignarse automáticamente al turno que esté activo cuando llegue. Tampoco queda demostrado si su emisión fue causada por el corte o por la nueva entrada, porque el ensayo no separó esas condiciones. Esperar esa corrección antes de cualquier nuevo comando habría impuesto una dependencia que este recorrido no acredita.
2. La respuesta nueva tuvo start a `11.453 ms`, end a `11.850 ms`, otro start a `12.495 ms` —**645 ms después, con la misma fuente nueva**— y otro end a `12.813 ms`. Hubo PCM energético hasta `12.748 ms`, 898 ms después del primer end. Reutilizar la sesión no autoriza a eliminar el manejo existente de continuaciones de cierre natural ni a considerar el primer end como final acústico.

La decisión propuesta a partir de esta evidencia es retirar el reemplazo incondicional y conservar la conexión durante una interrupción normal, con una resolución autenticada de la barrera por receipt/intento y terminal de la fuente anterior. Eventos y correcciones tardíos deben permanecer vinculados a su turno, no al floor actual. Si falta evidencia de resolución, la frase humana debe conservarse y la recuperación ser explícita; no se debe presentar un temporizador como prueba de limpieza. La implementación de producto **no cambió en este seguimiento**: sólo se agregaron el escenario de diagnóstico, ocho tests del harness/replay y este registro. Las herramientas QA pasan **32/32**; falta implementar y validar el recorrido completo, incluidas carreras A→B, interrupciones repetidas, ausencia de terminal y QA físico.

## Archivo y próximos controles

Las [trazas sanitizadas](2026-09-12-group-human-barge-in-traces.json) preservan IDs, estados, timestamps observados, comandos sin contenido, RMS/gate y hashes SHA-256 de los reportes originales. Conservan toda muestra energética y cambios de estado; omiten silencio sin cambios y `vad_score`. No contienen transcripciones, tokens, cookies ni grabaciones. El primer resultado permanece `failed`; los dos siguientes permanecen `inconclusive`, sin promoción retrospectiva a aceptación total.

Falta completar la matriz de Scribe/micrófono reales, comandos y frases espontáneas, backchannels/eco, parlantes/auriculares, desktop/mobile físicos, DevTools cerrado, interrupciones consecutivas, red/CPU degradadas y comparación con grabaciones fuente. El ensayo aislado ya recibió una corrección provider, pero sigue pendiente comprobar su atribución, persistencia y visualización dentro de la app. El siguiente incremento debe implementar y validar la continuidad sin reemplazo obligatorio; no cambiar TTS o lip-sync ni desplegar automáticamente a `main`.

Reproducción y límites del runner: [guía QA](../../../tools/group-call-qa/README.md). Operación y diagnóstico: [integración grupal](../../integrations/group-calls-elevenlabs-liveavatar.md). Alcance y aceptación: [plan 39](../../plan-prompts/39-user-preemptible-group-call-floor.md).
