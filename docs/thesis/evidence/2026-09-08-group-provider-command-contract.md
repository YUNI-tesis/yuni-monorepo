# Evidencia: contrato de comandos grupales con proveedores reales

## Alcance y procedencia

Fecha local: **2026-09-08, America/Argentina/Buenos_Aires**. Ensayos de protocolo UTC: `2026-09-09T02:32:14.280Z` a `2026-09-09T02:34:43.290Z`; aplicación real desde `2026-09-09T02:39:07.198Z`; contrato de interrupción desde `2026-09-09T02:41:32.113Z`. Base Git: `43724c72cbce7264d95e6a1e32264ffe8a421371`; cambios de transporte de la rama `lucaslovaglio/group-user-barge-in-v2` todavía sin commit al medir.

Primero se probaron sesiones reales LiveAvatar LITE/ElevenLabs desde un harness aislado del lifecycle de YUNI. Se mantuvieron el texto dirigido de 40 caracteres, los Agents, voces y configuración de generación de la comparación; este artefacto omite deliberadamente transcripciones, tokens, credenciales y audio. La segunda prueba, separada abajo, utilizó la aplicación real con entrada STT simulada. Ninguna sustituye QA acústico con parlantes o auriculares.

El harness midió RMS del stream recibido cada 50 ms. `audio aproximado` cuenta muestras con RMS > 0,001, elemento no muteado y no pausado; no acredita inteligibilidad, completitud de la palabra ni el último sample oído por una persona. La latencia de start se mide desde el envío del comando hasta el primer `speak_started`.

Los primeros GET de ElevenLabs incluidos en los reports devolvieron `status=processing`; sus campos negativos **no son resultados finales**. La tabla siguiente utiliza las reconsultas autorizadas posteriores, una vez que las ocho conversaciones llegaron a `status=done`. Esos resultados finales fueron constatados durante la investigación; los hashes identifican los reports originales, que conservan la consulta preliminar.

## Resultados por turno

| Variante                           | SDK    | Avatar  | Conversation ID                     | Start (ms) | Audio aproximado (ms) | Pico RMS | Mensaje exacto recibido / respuesta posterior | Resultado                 |
| ---------------------------------- | ------ | ------- | ----------------------------------- | ---------: | --------------------: | -------: | --------------------------------------------- | ------------------------- |
| API pública, UUID generado por SDK | 0.0.18 | Vera    | `conv_4201m2204nf7fkg8b84krcyzvhfg` |       1343 |                   350 | 0,334950 | sí / sí                                       | PASS                      |
| API pública, UUID generado por SDK | 0.0.18 | Bruno   | `conv_6301m2204nytf3pv04jejew4wp43` |       1213 |                   550 | 0,178057 | sí / sí                                       | PASS                      |
| API pública, UUID generado por SDK | 0.0.18 | Benjita | `conv_3701m2204p7he799eh6nm8mt5crx` |       1518 |                   550 | 0,270195 | sí / sí                                       | PASS                      |
| Baseline, `event_id` omitido       | 0.0.17 | Vera    | `conv_0501m220696wfh3apz34x7w4gyp3` |       1271 |                   300 | 0,416040 | sí / sí                                       | PASS                      |
| Baseline, `event_id` omitido       | 0.0.17 | Bruno   | `conv_1801m2206aa3fjzrw60rzwvs8ad4` |       1418 |                   600 | 0,161461 | sí / sí                                       | PASS                      |
| Baseline, `event_id` omitido       | 0.0.17 | Benjita | `conv_0801m2206a4jf70t9k4fyhcc7jdn` |       1327 |                   550 | 0,249284 | sí / sí                                       | PASS                      |
| Envío manual, ID `group-turn:...`  | 0.0.18 | Vera    | `conv_5301m2207qeyebz9t3yyf6743gke` |          — |                     0 | 0,000017 | no / no                                       | FAIL: timeout a 20.052 ms |
| Envío manual, UUID v4              | 0.0.18 | Vera    | `conv_1501m22095qjee8v05qqx9qvw5px` |       1368 |                   300 | 0,398984 | sí / sí                                       | PASS                      |

Todas las consultas finales tuvieron `hasAudio=true`. **Eso no equivale a que se haya respondido al pedido:** en la variante custom había un solo mensaje Agent, correspondiente al saludo, sin mensaje humano exacto ni respuesta posterior. El navegador tampoco registró inicio de habla o audio significativo durante los 20 segundos posteriores al comando custom. Las siete variantes exitosas sí registraron respuesta posterior y audio del turno.

Los comandos SDK oficiales retornaron estos UUID: Vera `4674ea3d-459f-4e49-a76a-10798b2d46fb`, Bruno `c813d864-01e2-4b53-b523-583e49ae7249`, Benjita `893cf516-e4a6-4676-a95a-f60ade300c5c`. El custom fue `group-turn:provider-probe:4fb0b866-b8de-4cb4-b0fe-27d22dd2ae52`; el manual UUID fue `8b5d6862-7588-40cd-920b-03e419088d7f`. Estos identificadores no son credenciales ni contienen texto conversacional.

## Conclusión y límites

La comparación reproduce la regresión del envío con ID custom: la base sin ID y la API pública con UUID reciben la orden y generan audio; la forma `group-turn:...` no entrega el pedido observado. El UUID manual también funciona. Esto justifica reemplazar el acceso privado por el contrato público de `ElevenLabsAgentSession`, manteniendo la correlación interna de YUNI separada del `event_id` externo. No demuestra qué validación interna aplica el worker, ni que todos los síntomas acústicos anteriores tengan esa causa.

Los reports registran un track local al conectar en las variantes official, omitted y custom, pero cero en la prueba manual UUID, aunque todas declaran `voiceChat=muted`. Se conserva esa diferencia observada: no se afirma igualdad de los tracks entre todas las variantes. Los éxitos oficiales con un track descartan que su sola presencia explique el fallo custom. La remoción del micrófono del connector no fue la variable de aceptación de este ensayo.

Tampoco se utiliza `maxUnmutedElements` del harness como prueba de exclusividad: la variante official guardó cero pese a tener muestras no muteadas. La exclusividad y el avance de ronda se midieron por separado en la aplicación real; el comportamiento con voz humana/Scribe, interrupciones, respuestas largas y calidad acústica física sigue pendiente.

El cierre de las ocho sesiones reportó HTTP 200. No hubo cambios de schema ni migraciones. Este ensayo acepta el contrato de envío, no la funcionalidad completa.

## Prueba de aplicación real: avance correcto, cola de audio silenciada

Sesión YUNI: `cmtthpf2l0039ilxwj7jyzd7r`. Se ejecutaron frontend, API, orquestador, SDK `0.0.18` y providers reales; únicamente se simuló la entrada committed de Scribe. Los tres turnos finalizaron y el backend volvió a `listening`. El muestreo observó como máximo un elemento desmuteado y audio no silencioso en los tres participantes. No hubo errores de página registrados; el cierre de sesión respondió HTTP 200.

Sin embargo, **no se acepta la fase 1 como llamada de respuestas completas**. Al correlacionar las muestras con los eventos HTTP, aparecieron muestras no silenciosas mientras el elemento ya estaba muteado. La ventana de cada participante va desde la respuesta HTTP de `agent_response` hasta 1500 ms después de la respuesta HTTP de su primer `speak_ended`. Son tiempos de observación HTTP, no timestamps exactos del provider.

| Avatar  | Turno YUNI                  | Muestras no silenciosas desmuteadas | Muestras no silenciosas muteadas | Tiempo muestreado muteado aproximado | Segundo start después del primer end HTTP |
| ------- | --------------------------- | ----------------------------------: | -------------------------------: | -----------------------------------: | ----------------------------------------: |
| Vera    | `cmtthpnl50044ilxw838yf8pe` |                                   5 |                                3 |                               150 ms |                                    621 ms |
| Bruno   | `cmtthpnl50045ilxw49vni2md` |                                   6 |                                5 |                               250 ms |                                    528 ms |
| Benjita | `cmtthpnl50046ilxwp3seq4av` |                                   4 |                                7 |                               350 ms |                                    457 ms |

Evidencia de muestras muteadas, como pares `(ms desde inicio de observación, RMS)`:

- Vera: `(13652, 0,193879)`, `(13701, 0,145082)`, `(13752, 0,107516)`.
- Bruno: `(15351, 0,290198)`, `(15402, 0,217254)`, `(16054, 0,001624)`, `(16106, 0,054567)`, `(16156, 0,009020)`.
- Benjita: `(17252, 0,015313)`, `(17302, 0,313507)`, `(17352, 0,280382)`, `(17402, 0,203800)`, `(17903, 0,055641)`, `(17957, 0,025957)`, `(18007, 0,003215)`.

Los tres starts posteriores llegaron sin turno activo y recibieron la directiva `suppress` con motivo `unauthorized_audio`. El gate heredado de la base ya había cerrado con el primer end. La evidencia muestra energía del stream que no se dejó reproducir y una continuación tratada como no autorizada; no identifica una palabra exacta perdida ni demuestra que todo ese tiempo corresponda a habla inteligible.

El campo original `roundPassed=true` sólo verifica finalización de la ronda; `audioDetectedForEveryParticipant=true` sólo indica presencia de algunas muestras audibles. **Ninguno implica audio completo.** Las interrupciones permanecen sin habilitar hasta corregir y aceptar este límite de reproducción.

### Configuración TTS efectiva: no confundir ensayos

La comparación aislada mantuvo el perfil que tenían los tres Agents antes de iniciar YUNI: `eleven_flash_v2_5`, `pcm_24000`, `optimize_streaming_latency=0`, `stability=0.65`, `speed=0.98`, `similarity_boost=0.78`. Al iniciar la aplicación, su sincronización restableció el perfil de `main`: `optimize_streaming_latency=3` y `stability=0.45`; modelo, formato, velocidad y similitud permanecieron iguales.

Los snapshots `ttsBefore`/`ttsAfter` del report documentan esa diferencia. La comparación entre formas de comando no cambió generación; el ensayo de aplicación sí debe interpretarse con su perfil efectivo de `main`. No se atribuye el tail muteado a TTS: las muestras existen en el stream mientras el gate está cerrado. Los posibles artefactos de generación requieren otra comparación de audio fuente y navegador.

**Resultado del checkpoint:** contrato de comando aceptado; avance de ronda y exclusividad observados; respuestas cortas completas **NO ACEPTADAS**; QA físico y barge-in pendientes. La fase 1 sigue **EN VALIDACIÓN**.

## Ensayo acotado de `interrupt()`: no es aceptación de barge-in

Se observó una sesión sandbox adicional con SDK `0.0.18`, sin implementar ni habilitar el flujo humano en YUNI. LiveAvatar session ID: `63485794-9d1c-4d59-ac91-c913f9b6926a`; ElevenLabs conversation ID: `conv_9601m220nn5veym85sassv9se0x9`. El muestreo de este ensayo fue cada **20 ms**, RMS > 0,001, distinto del muestreo de 50 ms anterior.

Después de 1200 ms acumulados de muestras PCM no silenciosas, el harness muteó el elemento y llamó `interrupt()`. El SDK devolvió `undefined` y publicó `avatar.interrupt` sin ID de evento. Se observó durante otros 12.002 ms sin enviar ningún pedido nuevo:

| Observación                                                | Resultado                                    |
| ---------------------------------------------------------- | -------------------------------------------- |
| Gate cerrado antes de llamar `interrupt()`                 | sí                                           |
| Primer terminal `speak_ended`                              | 489 ms después del corte                     |
| Cantidad de terminales únicos                              | 1; dos registros del mismo evento, SDK y raw |
| Última muestra PCM remota no silenciosa posterior al corte | 680 ms después del corte; elemento muteado   |
| Muestras desmuteadas posteriores al corte                  | 0                                            |
| Correcciones `agent_response_correction` en vivo           | 0                                            |
| Eventos passthrough `interruption` en vivo                 | 0                                            |
| Borrador generado                                          | 1157 caracteres; texto no conservado aquí    |
| Nuevos `user_message` después del corte                    | 0                                            |
| Reutilización segura demostrada                            | no                                           |

El comando humano tenía UUID `2ea2dd67-a9f1-43ce-88cd-035c01cf266a`. El terminal tuvo `event_id=66c29dfe-8d1e-4bd6-9250-2aa3a5cb172d` y `source_event_id=96f7678c-d563-4887-8a8b-f7b473b9707f`, distinto del UUID del comando. No puede asumirse igualdad universal para correlacionar un terminal con el turno YUNI.

La consulta inicial volvió a ser `processing`. La reconsulta final confirmó `done`, audio presente, pedido exacto de 204 caracteres y respuesta Agent de 283 caracteres marcada `interrupted=true`. ElevenLabs conservó una respuesta truncada en su historial final, **pero no se observó una corrección equivalente en el canal vivo durante esta ventana**. No se convierte ese texto final ni el borrador en un fragmento acreditado como oído.

Este ensayo sustenta separar corte local, cancelación YUNI, terminal provider y evidencia textual: ni el retorno de `interrupt()` ni un terminal certifican ausencia instantánea de PCM. Tampoco permite adoptar un tiempo universal de reutilización. La falta de corrección viva exige conservar contexto generado y exposición desconocida sin bloquear el corte a la espera de texto. El cierre sandbox respondió HTTP 200.

## Identidad de los reports originales

Los originales permanecieron durante la ejecución en `/private/tmp/yuni-provider-probe.DkwowH/` y `/private/tmp/yuni-interrupt-contract.tKLhx6/`; esas ubicaciones temporales no son el archivo durable de la tesis. Las [trazas sanitizadas en JSON](2026-09-08-group-call-traces.json) conservan los seis ensayos, muestras PCM de la aplicación y corte, y comprobaciones finales de ElevenLabs sin transcripciones ni tokens. Permiten recalcular los resultados sin depender de esos temporales.

El JSON sanitizado elimina duplicados raw y eventos `vad_score`, omite rutas locales del SDK y marca como no válido el contador de exclusividad del ensayo official. Los hashes siguientes identifican los **reports originales**, no el archivo normalizado. Este resumen conserva esa procedencia sin copiar contenido sensible.

| Report                               | SHA-256                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| `report-1788921155181-official.json` | `0bc270f56f8961722378d7df1226ca1dc6eee3233d1c31739b317c17a78be5a4` |
| `report-1788921209751-omitted.json`  | `7b7b7aa4b2e87d1bc207fc36213e4a4fa37e10a531224885749ac00c46870f29` |
| `report-1788921266597-custom.json`   | `4bbeea83b9fedeafe06c8045f5285ed5a8b6a2ab4d5741504f649671af3fe534` |
| `report-1788921311406-uuid.json`     | `c29bb24849078f09f972ca484e79d05c206695c2a4846238b95a179542b2fbd6` |
| `full-app-report-1788921575849.json` | `5cf6c60572b965a219d6a8bee7e730bad0be7573b5483365a68cf9f386af1e3c` |
| `report-1788921719085.json`          | `2cb28a1a8cc53307b617f33349f87d026dd20ab1d5458eaa5e1c7adbc6733ee4` |

## Trazabilidad

- El cambio de protocolo medido quedó preservado después de las pruebas en el commit `f53b44b84c762337c01043a44496428497b9be5a`; ese commit no implementa todavía barge-in ni corrige el cierre prematuro del audio.
- [Herramientas de reproducción y controles de seguridad](../../../tools/group-call-qa/README.md)
- [Estudio de caso](../group-call-audio-stability-case-study.md)
- [ADR 0026](../decision-records/0026-user-preemptible-group-call-floor.md)
- [Plan 39](../../plan-prompts/39-user-preemptible-group-call-floor.md)
- [Contrato publicado de ElevenLabsAgentSession](https://github.com/heygen-com/liveavatar-web-sdk/blob/5faad721ef991bd7ddba9dcbc9827d5426f7b9ca/packages/js-sdk/src/LiveAvatarSession/ElevenLabsAgentSession.ts)
