# Checkpoint: cierre de audio grupal

Fecha: **2026-09-09, America/Argentina/Buenos_Aires**. Rama `lucaslovaglio/group-user-barge-in-v2`, sobre `122c2c8`. Corrección acotada anterior a barge-in; no cambia el SDK ya restaurado, TTS, migraciones ni llamadas individuales.

La implementación medida quedó preservada después de los ensayos en el commit `7bcfa2a` (`fix(group-calls): settle natural speech before advancing turns`). Las trazas conservan su procedencia previa al commit y no se reescriben como si se hubieran medido después.

Estado: **fase 1 global EN VALIDACIÓN**. Tres rondas con providers reales superaron el oráculo técnico de cierre de audio: nueve respuestas, sin muestras energéticas bloqueadas. Esto no sustituye la aceptación física ni habilita todavía barge-in.

## Evidencia que motivó el cambio

Las [trazas anteriores](2026-09-08-group-call-traces.json) contienen siete respuestas cortas exitosas fuera del lifecycle de YUNI. En ellas se observan dos pares de start/end con la misma fuente: la continuación comienza 638–642 ms después del primer end. La transcripción final aparece antes de esa continuación, 292–385 ms después del primer end. En la aplicación real, cerrar con el primer end silenció muestras de respuesta y produjo un `suppress` por avatar.

El nuevo oráculo de QA reproduce el fallo anterior sin acreditar como respuesta el audio anterior a la evidencia de generación: conserva 3, 5 y 7 muestras bloqueadas para Vera, Bruno y Benjita. Cinco muestras tempranas de Vera quedan sin atribuir; podrían corresponder al saludo y no acreditan una respuesta escuchada.

## Implementación

- Una barrera de 1000 ms desde el último end conserva el mismo floor, owner y autorización `speaking`. No introduce otro reducer ni avanza la ronda durante la espera.
- Un nuevo start invalida el candidato pendiente, incluso cuando el timer venció pero su callback espera una confirmación HTTP en la cola. Los duplicados exactos no prolongan la espera.
- El cierre se consume una sola vez dentro de la cola, verificando instancia, epoch, attempt y autorización del turno. Después se mutea y se confirma un único end lógico al backend, incluyendo el texto más reciente.
- El saludo inicial se estabiliza siempre muteado. Las fuentes ya finalizadas no se reasignan a otro turno. No se exige que `source_event_id` coincida con el UUID del comando humano.
- Failure, release, lease vencida, cierre, retry y cleanup invalidan candidatos. Desmontar mutea el elemento antes de eliminar su referencia. Los no-owners se mutean antes de abrir el owner, sin pulsar el mute de quien ya tiene voz.

El SDK/connector no ofrece un ACK público del último sample reproducido. Los 1000 ms son una heurística basada en estas trazas, no una garantía frente a retrasos arbitrarios; agregan aproximadamente un segundo entre voces después del end final. Las continuaciones siguen bajo la lease existente. No se agregó analizador PCM ni acceso privado al SDK en producción.

## Validación automatizada

- Lifecycle grupal: **49/49**.
- Barrera aislada: **15/15**.
- Runtime/gate: **8/8**.
- Suite web completa: **333/333**, incluyendo llamadas individuales; voz: **36/36**.
- API: **270 aprobados, 6 omitidos**; dominio: **25/25**.
- Herramientas de QA: **19/19**, incluidos **11/11** tests del oráculo acústico y el replay de las trazas durables.
- Typecheck y lint: **12 paquetes del workspace aprobados**.

Incluye la secuencia `start → end a 408 ms → start 646 ms después`, espera A→B, ACK de start pendiente, duplicados, end fallido con redelivery de la misma identidad, fuentes retiradas, visibility, failure, unmount y cierre. Estos tests no demuestran inteligibilidad física ni ausencia universal de cortes.

## Ensayos con providers

### Guardas previas al inicio

Los primeros intentos, sesiones YUNI `cmttil4mb00bjilxw4fs7o3n2` y `cmttit9x700dyilxw5uev2i7i`, fueron bloqueados por la guarda sandbox antes de `SDK.start()`. El cleanup devolvió 200. El segundo intento instrumentado obtuvo HTTP 400 al consultar las tres sesiones todavía no iniciadas, sin metadata sandbox. La comprobación del runner no podía validar el modo en ese punto del lifecycle; no se interpreta como fallo del cierre de audio. No hay resultado acústico de esos intentos.

La guarda del harness se corrigió en dos etapas: antes de iniciar, inspecciona la forma del JWT recién obtenido de la API local autenticada, su vencimiento, la coincidencia de sesión y `start_session_data.is_sandbox`. **No verifica la firma**: registra `signatureVerified: false` y `trust: authenticated_loopback_api`. Después de iniciar consulta la metadata del provider. En las tres rondas aprobadas, las nueve consultas posteriores devolvieron **HTTP 200 e `isSandbox: true`**. No se persistieron tokens.

### Tres rondas aprobadas por el oráculo

Se ejecutó el frontend, API, orquestador y connector reales; únicamente el websocket Scribe recibió un commit simulado. El navegador fue automatizado con micrófono falso y autoplay permitido, con layout desktop o viewport mobile. No equivale a una prueba en un teléfono físico ni a una conversación con STT real.

| Ensayo                | Creación del reporte, UTC | Sesión YUNI                 | Resultado técnico          |
| --------------------- | ------------------------- | --------------------------- | -------------------------- |
| Desktop corto         | `03:14:52.493`            | `cmttize7i00fzilxwxseqfw1i` | PASS, 3/3 turnos completos |
| Desktop largo acotado | `03:18:29.929`            | `cmttj41uh00lrilxwh7ssppk5` | PASS, 3/3 turnos completos |
| Mobile corto          | `03:19:39.862`            | `cmttj5jtr00opilxwouvxfyq6` | PASS, 3/3 turnos completos |

Las fechas corresponden al 9 de septiembre. Cada ronda tuvo **un submit al orquestador**, **un `user_message` por avatar** y **un único `speak_started`/`speak_ended` lógico confirmado por avatar**, aunque el provider emitiera más de un par. El máximo observado fue **un elemento desmuteado**. No hubo comandos de interrupción ni directivas `suppress` durante las respuestas. Las nueve conversaciones de ElevenLabs finalizaron en `done`, con un mensaje humano, respuesta posterior y audio disponible. Las respuestas cortas registraron cinco caracteres cada una; las largas acotadas, 139. Estas comprobaciones no comparan semánticamente la grabación fuente con el audio escuchado.

El oráculo usa `RMS > 0.001`, con muestreo nominal cada 20 ms. “Audible” significa energía observada con el elemento no muteado, volumen distinto de cero y reproducción no pausada; no significa palabra inteligible ni llegada comprobada al dispositivo físico. El margen mide **última muestra energética → request HTTP del cierre final**, no tiempo del provider ni ACK de reproducción.

| Ensayo                | Voz     | Muestras energéticas audibles | Bloqueadas | `suppress` | Margen hasta cierre HTTP (ms) |
| --------------------- | ------- | ----------------------------: | ---------: | ---------: | ----------------------------: |
| Desktop corto         | Vera    |                            16 |          0 |          0 |                          1761 |
| Desktop corto         | Bruno   |                            29 |          0 |          0 |                          1062 |
| Desktop corto         | Benjita |                            26 |          0 |          0 |                          1091 |
| Desktop largo acotado | Vera    |                           320 |          0 |          0 |                          1104 |
| Desktop largo acotado | Bruno   |                           362 |          0 |          0 |                           929 |
| Desktop largo acotado | Benjita |                           351 |          0 |          0 |                          1134 |
| Mobile corto          | Vera    |                            20 |          0 |          0 |                          1084 |
| Mobile corto          | Bruno   |                            27 |          0 |          0 |                          1088 |
| Mobile corto          | Benjita |                            27 |          0 |          0 |                          1087 |

Los cortos produjeron dos pares raw de start/end por voz: las continuaciones comenzaron **661/638/640 ms** después del primer end en desktop y **639/640/638 ms** en mobile, respectivamente para Vera/Bruno/Benjita. Se conservaron bajo el mismo turno sin cortar ni publicar otro comando. En el largo acotado, Bruno tuvo PCM energético hasta **75 ms después del último end raw**; permaneció audible. El siguiente comando de la ronda se observó al llegar la confirmación del cierre anterior o después, nunca durante su espera.

Los eventos speech de cada respuesta comparten una fuente, pero esa `source_event_id` no coincide con el UUID del `user_message`. Por eso el replay conserva la atribución explícita **`api_turn_observation`** y utiliza el inicio observado de generación/turno: no atribuye el saludo previo a la respuesta ni inventa una correlación directa del provider. Los tres resultados recalculados coincidieron exactamente con `acousticEvidence` guardado.

### Largo abierto: intento no aceptado

El ensayo desktop `cmttj0wbg00ivilxw569h4ee7`, creado a las `03:16:02.780 UTC`, agotó los **45 segundos de espera del harness para completar toda la ronda**, antes de terminar Benjita. No se cambió un timeout de producción para repetirlo: el siguiente ensayo acotó la longitud solicitada para caber en la sesión sandbox.

Se preserva su resultado original **`failed`**. Un replay posterior del oráculo devuelve **`inconclusive`**, no PASS: Vera y Bruno completaron con 632 y 633 muestras energéticas audibles; Benjita tenía 423, sin cierre confirmado. No se observaron muestras bloqueadas, `suppress` ni interrupciones durante esa ventana; tampoco un fallo de participante. El cleanup detuvo la sesión con HTTP 200. Que ElevenLabs haya guardado audio y texto parcial del tercer avatar no demuestra que la ronda se completara.

El error sanitizado original contiene sólo `name: Error` y `stage: full-app`; **no contiene** `QaDeadlineExceeded` ni `timeoutMs`. La atribución al límite del harness procede de la ejecución observada y de la ventana temporal, no de un campo inexistente. No se reemplaza retrospectivamente el error por la forma instrumentada después.

### Archivo y reproducción de evidencia

Las [trazas durables de este checkpoint](2026-09-09-group-speech-completion-traces.json) conservan metadata, identidades, timestamps de API y provider, comandos y muestras PCM/gate en tuplas compactas, junto con la procedencia y SHA-256 de los reportes originales. No contienen transcripciones, credenciales ni audio grabado. La selección conserva todas las muestras con `RMS > 0.001`, el estado inicial y los cambios de mute/pausa/volumen, incluidos cambios sin energía; omite las muestras quietas sin cambios y los eventos `vad_score`, manteniendo el conteo original. Deben decodificarse según su esquema para recalcular el oráculo; no basta con leer el resultado resumido.

El replay anterior sigue fallando con **3/5/7** muestras bloqueadas; los tres nuevos ensayos pasan con **0/0/0**. Es evidencia específica de la mitigación de cierre prematuro en estas trazas, no una garantía universal de estabilidad acústica.

## Aceptación pendiente

La fase 1 permanece **EN VALIDACIÓN**. Falta QA manual con micrófono y Scribe reales, parlantes y auriculares, desktop y mobile físicos, DevTools cerrado, y comparación de grabaciones fuente con lo efectivamente escuchado. No se probaron en estos ensayos ruido/eco, red o CPU degradadas, ni llamadas individuales reales. Los tests individuales automatizados no sustituyen ese control.

No se afirma ausencia universal de distorsión ni aceptación del barge-in: sigue sin implementarse en esta reconstrucción. Tampoco se acredita el lote físico de diez respuestas cortas y diez largas por voz; aquí se registran exactamente tres rondas aprobadas, un largo incompleto y dos bloqueos previos al inicio.

## Trazabilidad

- [Estudio de caso](../group-call-audio-stability-case-study.md)
- [ADR 0026](../decision-records/0026-user-preemptible-group-call-floor.md)
- [Plan 39](../../plan-prompts/39-user-preemptible-group-call-floor.md)
- [Guía operativa](../../integrations/group-calls-elevenlabs-liveavatar.md)
- [Runner y límites de QA](../../../tools/group-call-qa/README.md)
- [Contrato oficial del connector](https://docs.liveavatar.com/docs/lite-mode/connectors/elevenlabs-agent)
- [Eventos oficiales LiveAvatar](https://docs.liveavatar.com/docs/full-mode/events)
