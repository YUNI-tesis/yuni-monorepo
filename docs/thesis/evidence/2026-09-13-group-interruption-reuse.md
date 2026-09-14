# Continuidad del avatar después de una interrupción — 2026-09-13

Estado al terminar la implementación: pruebas deterministas y transaccionales aprobadas, sin nueva validación con providers ni aceptación física. El seguimiento del usuario registrado al final agrega evidencia real de receipts y duración, **sin aceptación acústica**. Continúa el [handoff inicial](../../handoffs/2026-09-13-group-interruptions.md) y el [probe aislado anterior](2026-09-12-group-human-barge-in.md#ensayo-aislado-de-interrupción-y-reutilización-nativa).

## Comportamiento implementado

La interrupción humana mutea inmediatamente y llama `interrupt()` conservando la instancia SDK, la sesión y los tracks. El recorrido normal ya no ejecuta `/retry`, `stop()` ni `/started`. El avatar queda en la llamada mientras el orquestador cancela la intención anterior y espera la frase humana. Los backchannels, la clasificación de eco y Scribe continúan con su política previa.

Cada participante afectado confirma disponibilidad mediante `POST .../participants/:avatarId/interruption-ready`, disponible para owner, acceso compartido y sesión pública. El contrato contiene:

- `interruptionSourceEventId`, `participantAttemptId` e `interruptedTurnId`.
- Evidencia `{ type: "speak_ended", eventId, speechSourceEventId }`, correlacionada con una fuente de habla observada de ese turno; o `{ type: "not_dispatched" }` si nunca se intentó despachar la instrucción ni se observó habla de ese turno.

Se registra el intento de despacho **antes** de invocar el SDK: un throw no se convierte en prueba de que el proveedor no recibió nada. El UUID del comando no se usa como fuente de habla. Un turno con cierre natural ya consumido por la barrera existente puede aportar su terminal observado si la frase humana comenzó allí y la ronda pasó al siguiente avatar.

El backend valida, bajo el lock de sesión, acceso, receipt cancelada, turno/ronda/avatar afectados, attempt vigente activado, floor vacío, fase listening y ausencia de una ronda posterior. Sólo guarda la resolución en el JSON existente de la receipt; no mueve el floor, reactiva participantes ni cambia mensajes. El ACK idéntico es idempotente. El backend recibe evidencia reportada por el cliente autenticado, no una certificación criptográfica del provider ni una prueba de audición.

La barrera espera a todos los afectados. En A→B el frontend captura tanto el ancla humana como el owner/preparación local antes de liberar el floor; así conserva el terminal de B aunque llegue antes del ACK HTTP de cancelación. Un terminal sin fuente conocida no autoriza reutilización.

## Eventos atrasados y recuperación

Después del ACK se retiran las fuentes antiguas durante toda la vida del connector. La salida permanece cerrada hasta observar un start con fuente nueva. El medio sigue preparado antes de `sendUserMessage`, y un start síncrono dentro del despacho puede abrirlo para una respuesta muy corta. Los ends retirados, desconocidos o sin fuente no cierran el turno nuevo. Se mantiene la barrera natural de un segundo y la regresión de continuación a los 645 ms; no se agrega el drain experimental de 750 ms ni se adopta la ventana diagnóstica de 300 ms del probe como política.

La atribución de texto incluye avatar, epoch e intento. `wasInterrupted` conserva la marca aun si el turno se había completado localmente antes de cancelar. Una corrección con identidad o texto original se asocia al turno anterior; una respuesta sin evidencia suficiente se descarta antes que contaminar el nuevo historial. Las transcripciones/chunks de una sesión reutilizada también exigen fuente asociada al turno actual. Esta decisión puede omitir texto generado o eco temprano cuando falta correlación: requiere evaluación con el provider real. No se usa una corrección tardía como requisito para volver a rutear.

Si no hay evidencia en cinco segundos, se conservan silencio, conexión y frase, y se ofrece recuperación explícita. El timeout no prueba limpieza ni dispara un reemplazo. Un ACK perdido se reintenta con el mismo payload; un ACK obsoleto no aplica un floor nuevo. La recuperación puede reemplazar un connector sin evidencia por decisión del usuario. Una desconexión real del connector vigente sigue notificándose, incluso después de reutilizar.

ACK y retry compiten bajo el mismo lock. Un retry viejo de receipt liberada no reemplaza un attempt activo. Si el servidor guardó el ACK, se perdió la respuesta y luego falló realmente ese mismo attempt, se admite recuperación sólo con su ID exacto y ambos registros persistidos `errored`. Se preserva la resolución histórica y se espera la activación del replacement; el ID enviado por el cliente por sí solo no autoriza esa excepción.

## Verificación realizada

| Alcance                | Resultado final                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| Web completa           | 480/480, incluidos 88 lifecycle grupales, 14 del helper de reutilización y 25 de atribución/runtime |
| API completa           | 299/299, con las seis integraciones habilitadas en base aislada                                     |
| Floor transaccional DB | 38/38 en base aislada; suite DB completa anterior a la última regresión: 94/94                      |
| Dominio                | 27/27                                                                                               |
| AI / voz               | 36/36 cada paquete                                                                                  |
| Herramientas QA        | 43/43, sin solicitudes a providers                                                                  |
| Monorepo               | Typecheck y lint aprobados en los 12 paquetes                                                       |

Las pruebas incluyen terminal antes/después del ACK, fuente incorrecta o ausente, frase retenida, ACK perdido, A→B con B despachado o sólo preparado, mismo avatar, fuente vieja después del nuevo start, cierre/unmount, backchannels, Scribe fallido, recuperación de replacement y disconnect real después de reutilizar. También verifican exclusión ACK/retry y que un ACK viejo no modifique una ronda posterior. Los totales incluyen cambios locales previos y trabajo concurrente: no se atribuyen todos a este incremento.

El full-app `barge-in` fue adaptado para exigir continuidad de attempt/sesión/tracks tanto en `same` como en `other`, cero reemplazos/stops en el recorrido normal, terminal correlacionado, fuente nueva antes de PCM habilitado y conservación de los conteos exactos de entradas/comandos. Mantiene resultado experimental `inconclusive`; se probaron sus oráculos, **no se ejecutaron recorridos reales nuevos**.

Las escrituras de integración se limitaron a `yuni_history_restore_verify_20260912`, verificada explícitamente antes de ejecutar. No se modificaron datos de desarrollo o producción, migraciones aplicadas ni tablas históricas. Se conservaron los cambios locales; no hubo reset, cambio de rama, commit ni push.

## Pendiente de aceptación

Repetir recorridos sandbox de la app con el mismo avatar y con otro, verificar recepción y atribución frente a ElevenLabs, interrupciones consecutivas y ausencia de audio viejo habilitado. Después completar escucha con micrófono real, parlantes/auriculares, desktop/mobile, eco y backchannels, con DevTools cerrado. Un start/end o RMS no demuestran inteligibilidad, ausencia de remanente acústico ni palabras efectivamente oídas.

No se midió una latencia nueva. Los tiempos de 7,5–8,4 segundos del diseño anterior y los 1.264 ms del probe nativo aislado no describen esta implementación integrada. La documentación oficial confirma el [protocolo del connector](https://docs.liveavatar.com/docs/lite-mode/connectors/elevenlabs-agent) y sus [eventos de control](https://docs.liveavatar.com/docs/full-mode/events); la continuidad física de este recorrido sigue requiriendo observación.

## Seguimiento del usuario: límite de duración fuera de sandbox

El usuario informó otro corte breve después de desactivar sandbox. Lectura local en transacción `READ ONLY`, metadatos de procesos y GETs a sesiones existentes de LiveAvatar; no se crearon nuevas llamadas ni se modificaron datos/configuración durante este diagnóstico.

`.env` cambió a `LIVEAVATAR_SANDBOX=false` a las 21:15:21 del 13/09, hora de Buenos Aires; la API se inició a las 21:15:25 y su variable efectiva también era `false`. La última sesión YUNI fue `cmu0hrxcf000dbxc3otjwanoq`, creada a las `2026-09-14 00:15:36.592 UTC`, activada a las `00:15:42.300 UTC` y cerrada a las `00:17:40.950 UTC`. Su expiración local estaba prevista para `00:25:36.590 UTC`, por lo que no agotó el límite de diez minutos de la app.

Los tres GETs a LiveAvatar respondieron HTTP 200:

| Sesión LiveAvatar                      | Sandbox | Duración reportada | Motivo               |
| -------------------------------------- | ------- | ------------------ | -------------------- |
| `7bca8f80-44a1-4f9b-b934-2210bd24aaa5` | false   | 120 s              | MAX_DURATION_REACHED |
| `cc09f29e-31ff-4cf6-9e8c-8fe69379464c` | false   | 120 s              | MAX_DURATION_REACHED |
| `7ae42b00-48d0-4c9a-a3af-31e0da7ee551` | false   | 120 s              | MAX_DURATION_REACHED |

La sesión anterior de las 21:08 sí duró aproximadamente un minuto; su connector `24b4be9a-d531-41cd-869e-30ed30b5fba3` confirmó `is_sandbox=true` y `MAX_DURATION_REACHED`. No se confunden los dos recorridos.

Antes del cierre de la última llamada se guardaron cuatro receipts canceladas con `reuseConfirmed`, terminales correlacionados y los attempts originales: tres cortes del mismo participante a las `00:16:05.992`, `00:16:48.672` y `00:16:58.173 UTC`, y otro participante a las `00:17:02.952 UTC`. No tienen `replacementAttemptId`. Esto aporta evidencia real de la integración de reutilización y de cortes consecutivos; no mide audio remanente, inteligibilidad, latencia ni aceptación física.

El tope observado de 120 segundos coincide con el máximo publicado para el plan Free en [LiveAvatar](https://www.liveavatar.com/). Es una correspondencia, no una confirmación del plan de esta cuenta. La [API de tokens](https://docs.liveavatar.com/api-reference/sessions/create-session-token) limita `max_session_duration` al máximo de la suscripción. El request actual de YUNI no envía ese parámetro; desactivar sandbox no elimina los límites de duración de LiveAvatar. La confirmación del plan/workspace de la API key queda pendiente del usuario.
