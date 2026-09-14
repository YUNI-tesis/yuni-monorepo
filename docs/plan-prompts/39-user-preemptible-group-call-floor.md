# 39 - Floor grupal preemptivo exclusivo del usuario

## Estado

**Reconstrucción desde `main`: fases 2 y 3 implementadas para validación, actualizado al 2026-09-12. Ensayo técnico con providers y Scribe simulado ejecutado; aceptación formal y QA físico PENDIENTES.** El intento de agosto fue implementado y cubierto por tests, pero falló QA con proveedores reales. No se considera terminado ni se importa completo en la nueva rama `lucaslovaglio/group-user-barge-in-v2`.

Checkpoint de transporte y cierre: contrato provider validado; el ensayo previo falló por energía del stream silenciada después del primer end. El ajuste acotado del cierre natural pasó tres rondas con providers y STT simulado: desktop corta, desktop larga de extensión fija y mobile emulado corta, nueve respuestas sin PCM bloqueado observado. Un ensayo largo abierto agotó el tiempo del harness y permanece no aprobado. La [evidencia sanitizada del contrato](../thesis/evidence/2026-09-08-group-provider-command-contract.md) separa los ensayos y sus perfiles TTS; la [evidencia del cierre natural](../thesis/evidence/2026-09-09-group-speech-completion.md) conserva resultados y límites.

El 2026-09-12 el usuario confirmó que los avatares volvieron a hablar y pidió avanzar con las interrupciones. Se implementa esa siguiente etapa sin convertir su confirmación en aceptación de toda la matriz acústica. El lip-sync intermitente queda explícitamente fuera de este incremento; no se cambian SDK, TTS ni el cierre natural de un segundo. La migración nueva se aplicó a desarrollo después de un backup y conservó los conteos verificados; no se tocó producción. El [checkpoint de barge-in](../thesis/evidence/2026-09-12-group-human-barge-in.md) conserva un primer ensayo fallido con HTTP 500 y dos ensayos técnicos posteriores: corte, receipt única y audio después de elegir otro avatar o el mismo sobre un connector nuevo. Los oráculos experimentales quedaron inconclusos y el micrófono físico todavía no se validó.

## Objetivo y problema

Permitir que una frase nueva de la persona detenga al avatar, cancele la ronda anterior y devuelva al orquestador la decisión del próximo turno. Su contexto debe distinguir lo que el Agent generó, el fragmento informado por el provider y lo que quedó pendiente o no se sabe si se oyó.

La base de `main` funciona localmente y desplegada según la validación del usuario. El intento acumulado introdujo silencios, superposición, falsos cortes y turnos preparando sin voz. El análisis del 2026-09-08 encontró contexto recibido por ElevenLabs pero ausencia del `user_message`. La comparación real posterior reprodujo el fallo con ID custom `group-turn:...` y recibió mensajes/audio con la base sin ID, UUID manual y API pública `0.0.18`. Esto valida el contrato de envío; la prueba de aplicación posterior aisló además un límite del gate heredado de la base, que cierra antes de que desaparezca toda la energía del stream.

## Secuencia de implementación y aceptación

### Fase 1: transporte y llamada normal

- Partir de `main` y preservar la rama anterior y los commits de respaldo. Recuperar sólo piezas revisadas, con su evidencia.
- Fijar el SDK LiveAvatar `0.0.18` y utilizar `ElevenLabsAgentSession` en grupos, con sus métodos públicos para mensaje, contexto y actividad.
- Correlacionar el UUID retornado con sesión, attempt, epoch, turno y avatar. No enviar `group-turn:...` como `event_id` externo ni tratar la publicación confiable como ACK del Agent.
- Verificar readiness de sesión, recepción real de la orden en ElevenLabs, inicio de audio y final de turno. No hacer redelivery ciego cuando no hay progreso.
- Mantener TTS y comportamiento conversacional de la base durante la comparación. La secuencia original no habilitaba barge-in antes de esta aceptación; el checkpoint del 2026-09-12 autoriza implementar la etapa siguiente tras la recuperación de voz confirmada por el usuario, sin dar por aprobado el QA físico pendiente.
- Aceptación: tres avatares responden al turno dirigido, uno por vez; respuestas cortas y largas completas; contexto recibido por el siguiente; IDs y lifecycle registrados con proveedores reales. Tests de contrato y lifecycle acompañan, sin sustituir QA.

#### Ajuste acotado del cierre natural, 2026-09-09

- Retener el floor existente y la autorización `speaking` al recibir un end. Esperar 1.000 ms de estabilización del control antes de confirmar el cierre al backend; no transferir primero el turno y agregar luego un drain independiente.
- Invalidar el candidato si el mismo owner continúa. Hacerlo antes del dedupe lógico, incluso si el timer ya venció y el cierre quedó encolado detrás de otro ACK. Duplicados de eventos no reinician el timer.
- Consumir el candidato una sola vez **dentro** de la cola, tras verificar identidad y autorización. Sólo entonces mutear al owner, pasar a `committing` y confirmar `speak_ended`.
- Mantener muteado el saludo de startup y aplicar una barrera independiente. Ignorar eventos cuya fuente ya terminó, conservando IDs de forma acotada; no suponer correlación obligatoria con el UUID de `user_message`.
- Mutear no-owners antes de abrir al owner y evitar pulsar su mute al reaplicar la autorización. Limpiar timers/candidatos/listeners ante cancelación local, timeout, failure, reemplazo, cierre y cambio de epoch.
- Conservar la lease como límite de seguridad. Los 1.000 ms se apoyan en continuaciones medidas de 638–642 ms, pero no prueban el final acústico ni la reutilización segura de un connector interrumpido.
- No incorporar WebAudio, medición de reproducción en producto, otro floor, cambios TTS ni interrupción humana en este ajuste.
- Validar continuaciones, end duplicado, ACK atrasado, falla/reentrega del end, startup, cambio A→B, fuentes finalizadas, visibility, cleanup y reproducción real antes de aceptar la fase. Registrar resultados sólo después de ejecutarlos.

### Fase 2: cancelación y nuevo ruteo

- Implementada para validación el 2026-09-12. Scribe continúa como única entrada humana. Un parcial iniciado durante `speaking` puede cortar inmediatamente ante comandos de detención o `sí/ok/dale + pero`; otra frase significativa espera 300 ms desde el primer candidato, sin reiniciar el timer con cada parcial.
- Ignorar backchannels aislados y sus combinaciones, incluidos `Okey.`, `sí sí` y `ok dale`. `sí, pero…` sí interrumpe; la preposición `para` dentro de una frase no es un comando inmediato. La heurística efímera de eco usa texto generado por avatar, con ventana de 2,5 segundos y hasta 64 tokens; no identifica al hablante ni demuestra qué audio oyó.
- Un parcial iniciado en preparación no corta. Su committed se conserva y cancela la ronda obsoleta cuando existe un turno al que anclarla, o se procesa como intervención normal al volver a `listening`.
- Cerrar todos los medios antes del request HTTP y de `interrupt()` local. Invalidar callbacks y ACKs de control anteriores mediante una generación local, manteniendo serializadas las operaciones normales de turno.
- Cancelar transaccionalmente toda la ronda, con receipt única por sesión y `sourceEventId`; resolver A→B dentro de la misma ronda y responder `stale` sin modificar una ronda posterior.
- Conservar el committed antes o después del ACK. El nuevo ruteo espera cancelación confirmada y connector disponible, no una corrección textual. Reintentar hasta tres veces la cancelación con el mismo identificador; ante fallo, mantener silencio, conservar la frase y ofrecer recuperación explícita.
- Actualizado localmente el 2026-09-13: reutilizar connectors sanos con ACK dedicado vinculado a receipt/attempt/turno y terminal de fuente observada, o evidencia explícita de turno no despachado. Resolver todos los afectados A→B. Ante evidencia ausente, conservar frase y silencio para recuperación explícita; el timer no desconecta. Reservar reemplazo a recuperación. Un evento provider `interruption` es sólo evidencia/telemetría. Ver [implementación y límites de validación](../thesis/evidence/2026-09-13-group-interruption-reuse.md).
- Aceptación: un corte por intervención real, ningún committed perdido, backchannels/eco sin falso corte, micrófono muteado sin barge-in y eventos tardíos incapaces de afectar una ronda posterior.

### Fase 3: contexto interrumpido

- Implementada para validación el 2026-09-12 mediante `GroupVoiceInterruptionEvent` y `GroupVoiceInterruptedTurn`. El modelo canónico de receipt se mapea a la tabla nueva `GroupVoiceHumanInterruptionReceipt`, preservando la tabla experimental `GroupVoiceInterruptionEvent` existente. La migración aditiva `20260912120000_group_human_interruption_context` se verificó en una base aislada y se aplicó a desarrollo después de un backup, con conteos pre/post idénticos. No modifica migraciones aplicadas ni se ejecutó sobre producción.
- Representar por separado borrador generado, fragmento informado por provider y pendiente/desconocido, conforme a ADR 0026.
- Usar `agent_response_correction` atribuida al turno como evidencia textual cuando llegue. No convertir transcripción o texto completo en certeza de exposición acústica.
- Cuando falta evidencia, conservar incertidumbre y el borrador como generado. No inventar una división exacta de dicho/pendiente.
- Propagar la distinción al orquestador y al próximo avatar. Las correcciones tardías actualizan el turno original sin reabrir el floor.
- Aceptación: tests y QA muestran un nuevo pedido atendido con contexto coherente, sin repetir automáticamente todo el borrador ni asumir que la persona oyó su final.

### Fase 4: QA acústico y mejoras de naturalidad

- Probar parlantes/auriculares, desktop/mobile y DevTools cerrado; respuestas breves y largas, backchannels, interrupciones reales, red y CPU degradadas.
- Comparar grabación fuente y navegador antes de atribuir distorsión a TTS, transporte o gate.
- Evaluar `eleven_v3_conversational` y filtrado de fondo como experimentos separados. No incorporar otra infraestructura de conversación en esta reparación.
- Registrar fecha, commit, configuración, casos y resultado. Ninguna fase se marca implementada o validada sin evidencia correspondiente.

## Invariantes y límites

- Un solo avatar audible y Scribe como única entrada humana.
- YUNI autoriza turnos y cancela rondas; los eventos del provider no originan otra preempción humana.
- La cancelación no espera el texto corregido y el transcript committed nunca se descarta por el orden de eventos.
- Los IDs internos, IDs de transporte e idempotencia backend tienen propósitos separados.
- Texto generado, fragmento provider y audio oído se distinguen explícitamente.
- Se preservan los datos existentes. El transporte de fase 1 no requirió migración. Las fases 2/3 agregan una migración nueva, sin alterar las anteriores ni resetear bases.
- No se agregan subtítulos, diagnóstico técnico visible, micrófonos por connector ni cambios de llamadas individuales.

Los timers, el reducer acústico, el preset TTS y el descarte del fragmento del intento anterior permanecen como antecedentes; no son condiciones heredadas por la reconstrucción. La evidencia histórica se conserva en Git y el estudio de caso.

## Decisión y evidencia

El checkpoint automatizado del 2026-09-12 aprobó 431 tests web en la repetición limpia, 286 API y 86 DB, junto con AI/domain/voice, herramientas, typecheck y lint. La primera corrida web con aserciones aprobadas pero error de teardown permanece registrada como fallida. Los [resultados completos](../thesis/group-call-audio-stability-case-study.md#suites-ejecutadas-en-el-checkpoint-del-2026-09-12) y los ensayos técnicos no equivalen a aceptación física: no se observó una corrección provider en vivo que permita verificar ese fragmento en el historial.

- [ADR 0026](../thesis/decision-records/0026-user-preemptible-group-call-floor.md)
- [Estudio de caso: estabilidad de audio e interrupciones grupales](../thesis/group-call-audio-stability-case-study.md)
- [Evidencia sanitizada del contrato provider](../thesis/evidence/2026-09-08-group-provider-command-contract.md)
- [Evidencia del ajuste de cierre natural](../thesis/evidence/2026-09-09-group-speech-completion.md)
- [Checkpoint técnico de interrupción humana, 2026-09-12](../thesis/evidence/2026-09-12-group-human-barge-in.md)
- [Guía operativa y checklist de diagnóstico](../integrations/group-calls-elevenlabs-liveavatar.md)
