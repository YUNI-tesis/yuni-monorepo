# Handoff — interrupciones grupales sin desconectar al avatar

> Continuación local del mismo día: la reutilización ya fue integrada y probada de forma determinista. Ver [checkpoint posterior](../thesis/evidence/2026-09-13-group-interruption-reuse.md). El texto siguiente conserva el estado original de este handoff; sus frases “pendiente/no integrada” describen ese momento, no el workspace posterior. El QA con providers de la nueva implementación sigue pendiente.

Fecha: **2026-09-13**. Este documento permite continuar en un chat nuevo sin depender del historial anterior. Es un checkpoint de trabajo, no una declaración de aceptación ni de despliegue.

## 1. Objetivo y próximo paso

El usuario quiere que, al volver a hablar durante una respuesta, los avatares frenen, escuchen y el orquestador decida quién responde a la nueva intención. Debe conservarse el contexto de lo generado, lo posiblemente pronunciado y lo pendiente, sin inventar qué escuchó el usuario. Interrumpir **no debe sacar al avatar de la llamada**.

**Problema actual confirmado:** la implementación interrumpe y cancela la ronda, pero después cierra y reemplaza obligatoriamente el connector afectado. Eso provoca el tile «Conectando» y varios segundos de pausa. No es un fallo de migración. Los fixes previos corrigieron errores secundarios, pero no retiraron esa política.

**Próximo incremento pendiente:** integrar reutilización de la conexión sana después de una interrupción nativa, con confirmación vinculada a la fuente de habla/intento/receipt, protección contra eventos tardíos y recuperación explícita si no se puede confirmar. La reconexión debe quedar como recuperación de fallos, no como efecto normal de cada corte.

La viabilidad se probó con un provider real en un ensayo aislado; **todavía no está integrada en la app**. No confundir el probe nuevo con una implementación terminada. El usuario pidió este handoff, no crear otro chat automáticamente, cambiar de rama ni publicar cambios.

## 2. Workspace y preservación

- Repositorio: `/Users/lucaslovaglio/projects/university/tesis/yuni-ai`.
- Rama actual verificada al preparar el handoff: `lucaslovaglio/group-user-barge-in-v2`.
- HEAD: `e52211c`.
- Respaldo de la implementación anterior: `lucaslovaglio/group-interruption-stability-main`, commit `afa73e88e4944572e449f358314490775419d753`.
- Hay **muchos cambios locales modificados y archivos nuevos sin commit**, incluidos implementación v2, migraciones restauradas/nuevas, tests y evidencia. No asumir que están respaldados por el HEAD o pusheados.
- No se hizo commit, push, merge, cambio de rama ni escritura de producción durante el último diagnóstico. No se hizo fetch en el handoff; no asumir que las referencias remotas estén actualizadas.
- Releer `git status` y el diff antes de editar. Las líneas citadas más abajo son orientativas y pueden moverse.

Hay trabajo concurrente ajeno a interrupciones que debe conservarse intacto:

- Perfil, información y contexto de avatares: archivos bajo `apps/web/components/avatar-profile/`, `useAvatarContext.ts`, `avatar-api.ts`, tests de perfil/contexto y notices nuevos.
- Cards: `AvatarCard.tsx`, `avatar-card.test.tsx`.
- API de avatares/contexto: `domains/avatars/`, `domains/context/`, `avatar-list.test.ts`, incluido `failure-messages.ts` nuevo.
- `packages/ui/src/components/Tabs.tsx`.
- `apps/web/components/interact/InteractCall.tsx`: cambios de etiquetas de llamadas individuales, no son el fix grupal actual.
- `apps/web/next-env.d.ts`: cambio de ruta generada `.next/types` → `.next/dev/types`; no borrarlo ni adjudicárselo a esta mejora.

No hacer reset de DB, editar SQL ya aplicado, borrar tablas legacy, modificar `_prisma_migrations`, limpiar cambios locales en bloque ni usar `git reset --hard`/checkout destructivo. El usuario no puede perder datos y no tiene acceso a la DB de producción. Las operaciones de GitHub/red requieren los permisos del entorno; un `gh auth status` fallido dentro del sandbox no prueba una sesión vencida.

## 3. Arquitectura y alcance a conservar

- Tres sesiones LiveAvatar LITE con connector ElevenLabs y un único Scribe como entrada humana.
- El backend/orquestador decide la ronda y los turnos. Máximo un avatar audible.
- SDK actual **`@heygen/liveavatar-web-sdk@0.0.18`**, con `ElevenLabsAgentSession.sendUserMessage`, `sendContextualUpdate` y `sendUserActivity` públicos.
- No volver al `event_id: "group-turn:..."` personalizado: el SDK construye el protocolo. Su retorno no acredita recepción por ElevenLabs.
- Los micrófonos de connectors permanecen muteados en la configuración de referencia; Scribe captura al usuario. El probe nativo también usó `voiceChat` muteado. No mezclar este incremento con cambios de tracks locales, SDK o voces.
- Mantener el manejo existente del cierre natural y su barrera de un segundo para continuaciones. No trasladar automáticamente el floor acústico/drain experimental de 750 ms de la rama descartada.
- No tocar lip-sync, TTS, llamadas individuales, subtítulos ni diagnósticos técnicos visibles. No activar `filterBackgroundAudio` por defecto.
- Mantener cola serializada de operaciones normales, epoch/generación de control, receipts idempotentes, anclaje a ronda/turno y frase humana retenida durante cancelación/recovery.
- `AVATAR_TRANSCRIPTION` significa texto generado, no prueba de lo oído. Una corrección provider tampoco garantiza audición exacta en el navegador.
- Logs y artefactos de diagnóstico: IDs, tiempos, estados, longitudes y métricas; nunca transcripciones, tokens ni credenciales.

Las skills relevantes al retomar son `liveavatar-debug` y `liveavatar-integrate`; leer sus instrucciones actuales. Usar pruebas sandbox y no enviar feedback externo sin autorización (el usuario anteriormente pidió no mandar nada).

## 4. Evidencia que ya está confirmada

### Video del usuario: reconexiones deliberadas

Original: `/Users/lucaslovaglio/Desktop/Screen Recording 2026-09-12 at 7.18.38 PM.mov`, duración 49,02 s. Se inspeccionó localmente, sin modificar ni subir el video.

Sesión YUNI: `cmtyy5oaf004md0m5exnc2ibb`, iniciada `2026-09-12 22:18:39 UTC`.

| Interrupción de Bruno (UTC) | Tiempo hasta activar el reemplazo |
| --------------------------- | --------------------------------: |
| `22:19:00.164`              |                           3,142 s |
| `22:19:09.619`              |                           3,663 s |
| `22:19:21.660`              |                           2,858 s |

Las tres receipts y reemplazos se persistieron; hubo nuevo ruteo en cada caso y ningún failure de participante de Bruno. Lo visible es el reemplazo obligatorio, no un reemplazo fallido.

**Otro hecho independiente:** después del intervalo grabado, a `22:19:43.479 UTC`, terminó el grupo. Vera y Benjita conservaban los connectors originales; LiveAvatar confirmó HTTP 200, `is_sandbox: true` y `end_reason: MAX_DURATION_REACHED` al alcanzar aproximadamente un minuto. El backend cierra cuando quedan menos de dos participantes. No decir que el video muestra ese cierre posterior ni usar el límite sandbox como explicación de los cortes durante la conversación.

### Probe nativo: continuidad sin reemplazo observada

Ensayo único creado `2026-09-12 22:31:57.158 UTC`, con Agent grupal de Bruno y avatar visual de prueba. No usó la app, su API, DB, Scribe ni orquestador.

- Sesión LiveAvatar: `74793c11-fe42-4650-bffa-548771699907`.
- Conversación ElevenLabs: `conv_8901m2bvzn31e67s25mrdc1bjxhy`.
- Se esperó inicio y más de 500 ms nominales de PCM energético habilitado; se muteó localmente y ejecutó `interrupt()` sin `stop()`.
- Terminal con **la misma fuente de habla anterior**, 909 ms después del corte. Esa fuente NO coincide con el UUID de `sendUserMessage`; no asumir correlación extremo a extremo de IDs de comando.
- Audio viejo siguió llegando muteado hasta 805 ms después del corte. Cero muestras energéticas en los 300 ms observados después del terminal. Los 300 ms son una ventana de diagnóstico, **no una prueba general de limpieza ni un timeout aprobado para producto**.
- Segundo pedido sobre la misma instancia, sesión y tracks; cero stops/disconnects durante el ensayo. ElevenLabs confirmó exactamente los dos pedidos.
- Primera energía habilitada de la respuesta nueva, 1.264 ms después del segundo comando. Fuente nueva, ningún evento de fuente vieja después de ese comando, cero energía habilitada antes del start nuevo.
- Doce muestras energéticas nuevas, incluidas continuaciones. No prueba inteligibilidad ni salida física.
- Cleanup confirmado HTTP 200. No quedó un proceso del ensayo vivo.

Dos observaciones críticas del mismo ensayo:

1. `interruption` de ElevenLabs y `agent_response_correction` llegaron **después de enviar el nuevo pedido**. La corrección tenía 45 caracteres y no traía `source_event_id` en el evento observado. No asignarla al turno actual; conservar atribución a la respuesta anterior. No quedó aislado si fue causada por `interrupt()` o por el nuevo mensaje. No hacer que el ruteo dependa de una corrección que puede aparecer después del siguiente comando.
2. La respuesta nueva de una palabra emitió start → end → otro start **645 ms después con la misma fuente** → end. Hubo PCM hasta 898 ms después del primer end. El primer `speak_ended` no demuestra final acústico. Este hallazgo también existía en el incidente anterior y justifica conservar continuaciones.

El resultado formal del probe permanece **experimental / inconclusive**, con exit code 1 intencional. Es evidencia favorable de viabilidad, no aceptación de toda la integración. No repetir pruebas pagas automáticamente ni presentar este resultado como un fix aplicado.

## 5. Implementación actual: dónde continuar

### Frontend

Archivo principal: `apps/web/components/interact/GroupInteractCall.tsx`.

- `beginHumanInterruption` (~1034): captura epoch/turno/avatar/source, aumenta generación, mutea antes de requests, marca `interruptedTurnId`, cancela cierre natural, llama `interrupt()` al owner y comienza cancelación backend.
- `resumeHumanInterruption` (~1755): reintenta cancelación como máximo tres veces con el mismo ID; exige receipt cancelada, fase listening y floor vacío. Después **recorre siempre los avatares afectados y llama `retryParticipant`**, crea connector, espera startup y sólo entonces envía el committed retenido.
- `initializeLiveParticipant`: retira listeners, hace `old.stop()`, inicia nueva instancia, confirma `/started` y espera barrera de startup. Éste es el origen del cambio visible a «Conectando».
- `interruptedTurnId` actualmente hace ignorar futuros starts/ends del intento cortado. Para reutilizar, hace falta un estado explícito que conserve/correlacione el terminal y libere la cuarentena correctamente; no basta borrar el flag.
- `currentSpeechSources` / `completedSpeechSources` identifican fuentes del provider. Conservar fuentes retiradas para descartar eventos viejos tras reutilizar.
- `turnLedgerRef` y generación protegen contra HTTP/callbacks viejos. Las correcciones no deben adjudicarse ciegamente al último turno.
- Gate abierto antes de `sendUserMessage`, con reproducción preparada: preservar para no volver a perder respuestas muy cortas.

Fixes previos ya implementados y cubiertos por tests; no revertir:

1. Stop/disconnect esperado del connector retirado durante el ACK de reemplazo no debe reportarse como failure normal.
2. La supresión de failures durante startup del reemplazo termina al completar su inicialización (`initializationComplete`); una desconexión real posterior sí debe reportarse.

Hallazgo de auditoría separado, **no causa confirmada del video**: se puede marcar participante activo tras startup/ACK sin garantizar `SESSION_STREAM_READY` o `srcObject/play` efectivo. No mezclar cambios sobre esto sin evidencia nueva. Tampoco se encontró evidencia de detach del track viejo borrando el nuevo: el video tiene key por avatar y LiveKit separa tracks por identidad.

### Backend y contratos

- `packages/db/src/repositories/avatar-group-repository.ts`: cancelación transaccional, contexto, receipts y recuperación.
- `hasPendingInterruptionReplacement` (~2925) bloquea `beginRound` si el intento afectado sigue siendo el actual, incluso si está activo. Por eso quitar la reconexión sólo en frontend dejaría la llamada bloqueada.
- `readAffectedParticipants` (~2905) lee JSON de receipt con `avatarId`, `participantAttemptId`, `replacementAttemptId?`.
- `beginParticipantRetry` (~1070) crea reemplazo y cleanup durable del viejo. Es semántica de reemplazo, no un ACK de reutilización.
- Contratos: `packages/domain/src/schemas/avatar-group.ts`; servicios/controladores owner y públicos en `apps/api/src/domains/avatar-groups/` y `group-public-sessions/`.
- Transportes a mantener consistentes: `apps/web/lib/api/avatar-group-api.ts`, `group-sharing-api.ts`, `group-call-transport.ts` (owner, compartido y público).
- Contexto del orquestador: `packages/ai/src/group-orchestrator.ts`; historial compartido: `CallExperience.tsx`.

### Diseño propuesto, todavía NO implementado

Un endpoint dedicado, por ejemplo `POST /group-voice-sessions/:sessionId/participants/:avatarId/interruption-ready`, para resolver reutilización sin fingir un `/retry` o `/started`.

Body orientativo: `interruptionSourceEventId`, `participantAttemptId`, `interruptedTurnId` y evidencia terminal (`type`, `eventId`, `speechSourceEventId`). La forma final debe basarse en el contrato observado, no inventar IDs que el provider no transmite. El backend recibe evidencia reportada por el cliente autenticado, no confirmación criptográfica del provider.

En transacción bajo el lock de sesión:

- Validar acceso owner/shared/public, receipt cancelada, ronda/turno/avatar afectado y mismo intento vigente activo.
- Rechazar si hay ronda posterior, otro floor incompatible, intento fallido/terminado o reemplazo ya iniciado.
- Registrar reutilización confirmada del intento y su evidencia dentro del JSON existente; no mover floor, reactivar participante ni alterar mensajes.
- Hacer idempotente el ACK idéntico, sin que uno viejo cambie una ronda posterior.
- Liberar la barrera sólo cuando cada afectado esté resuelto por reutilización confirmada o reemplazo activado. A→B puede requerir resolver ambos intentos.
- ACK y retry compiten bajo el mismo lock: una receipt ya liberada no debe disparar reemplazo automático atrasado.

No parece requerir migración nueva: el JSON existente permite extender resolución, pero revisar el parser para no perder campos. No alterar migraciones aplicadas.

Casos no triviales que no se pueden omitir:

- Terminal anterior al ACK HTTP de cancelación: conservarlo y utilizarlo al confirmar la receipt.
- Sin terminal: no reutilizar a ciegas ni desconectar sólo porque pasó un timer; conservar frase/audio cerrado y ofrecer recuperación explícita.
- Preparación sin comando publicado: puede no existir terminal. Definir explícitamente cómo resolver «no despachado» o recuperar, sin inventar éxito.
- Reutilización del mismo attempt: `failParticipant` descarta intentos viejos por ID, pero eso ya no basta para un `stream_error` tardío de un comando anterior. Guardar turno/generación; no ignorar `SESSION_STOPPED`/desconexiones reales del connector actual.
- Correcciones tardías de una generación anterior, backchannels, duplicados, commit antes/después de cancelación, mute, epoch, cierre/unmount, reconexión y terminal sin correlación.

## 6. Migraciones: problema anterior resuelto sin reset

La DB de desarrollo ya tenía aplicada `20260824120000_user_preemptible_group_call_floor`, pero su archivo faltaba en esta rama. Se restauró exactamente desde `afa73e8` y se representó la tabla histórica en Prisma sin usarla para el runtime nuevo.

**Conservar inmutables ambos SQL aplicados:**

| Migración                                          | SHA-256                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| `20260824120000_user_preemptible_group_call_floor` | `a601d57144fbf734075d7a2483397d4583f7c7f1edc47017756a65c6b4508e67` |
| `20260912120000_group_human_interruption_context`  | `402d1926050acab5f317d01ce2a5732c92f379a37fef92b2c20e6c75fc1639c7` |

- `LegacyGroupVoiceInterruptionEvent`: `@@ignore`, `@@map("GroupVoiceInterruptionEvent")`, conserva enum, índices y relaciones históricas.
- Modelo runtime `GroupVoiceInterruptionEvent`: tabla física **`GroupVoiceHumanInterruptionReceipt`**, separada de la legacy. También existe `GroupVoiceInterruptedTurn`.
- `packages/db/src/migration-history.test.ts` protege checksums y separación.
- Últimas verificaciones del 12/09: 23/23 archivos coinciden con el historial, `migrate status` up to date, DB→schema sin diferencias y replay completo en base aislada sin diferencias.
- `migrate dev --skip-generate` pasó **sólo en base aislada**. La ejecución normal en desarrollo fue bloqueada por seguridad; no reintentar por un wrapper para evadirlo. Un intento previo `--create-only` llegó a pedir nombre de migración vacía y se canceló, sin crear archivo.
- La reparación del historial cambió archivos, no datos. Antes/después se conservaron 11 usuarios, 7 avatares, 211 mensajes, 56 conversaciones, 13 receipts legacy y 5 v2; llamadas posteriores agregan registros. No presentar esos conteos como actuales sin volver a leer.
- Backup de desarrollo anterior: `/private/tmp/yuni-before-barge-in-xYmPtw/yuni_dev.dump`, custom PostgreSQL, permisos 0600 y listado verificado. Es temporal; comprobar existencia antes de necesitarlo. No contiene producción y no se debe versionar.
- Base aislada con las 23 migraciones para tests: `yuni_history_restore_verify_20260912`, PostgreSQL local. Verificar configuración y apuntar explícitamente `TEST_DATABASE_URL` antes de tests con escritura. Nunca correr integración contra `yuni_dev`.
- No usar para replay fresco `yuni_barge_in_v2_verify_20260912`: tiene tabla legacy agregada manualmente sin su entrada histórica. No borrar bases de ensayos anteriores.

## 7. Validación y artefactos

Últimos resultados verificados, **no reejecutados todos al preparar este handoff**:

- Web: **436/436**, incluyendo **79 lifecycle grupales**, 66 clasificación/eco, 15 cierre natural y 9 runtime.
- API: **287/287**, con seis tests de integración.
- DB: **89/89**, con 32 de floor/integración y tres de historial de migraciones.
- AI: 36, dominio: 26, voz: 36, del checkpoint anterior.
- Typecheck/lint: 12 paquetes aprobados en ese checkpoint.
- Herramientas QA después del probe nativo: **32/32**, ESLint, Prettier y `git diff --check` aprobados.
- Los totales incluyen trabajo concurrente ajeno; no atribuir todos los tests nuevos a interrupciones.

Tests focalizados: `apps/web/group-interact-call.lifecycle.test.tsx`, `apps/web/components/interact/group-barge-in.test.ts`, `apps/web/group-call-runtime.test.ts`, `packages/db/src/avatar-group-floor.integration.test.ts`, servicios API de grupos y tests del orquestador.

Herramientas: `tools/group-call-qa/probe.mjs --scenario=interrupt-reuse`, `browser.js`, `interrupt-reuse.test.mjs`, `full-app.mjs`, `interruption-guards.test.mjs` y su README. El escenario full-app `barge-in` todavía exige reemplazo para `same`; habrá que adaptar esa expectativa al implementar reuse, sin debilitar el resto del oráculo. Usa Scribe simulado y providers reales: no equivale a QA de micrófono.

Los ensayos anteriores Vera→Bruno y Vera→Vera confirmaron cancelación/nuevo ruteo con reemplazos y pausas hasta nueva energía de **7,475/8,401 s**. No recibieron corrección provider. Un primer ensayo falló con HTTP 500 y su causa interna no se aisló: conservarlo como fallo, no atribuirlo retrospectivamente al hot reload o a migraciones sin evidencia.

Lectura prioritaria en el chat nuevo:

1. [Evidencia del 12/09, incluidas las últimas dos secciones](../thesis/evidence/2026-09-12-group-human-barge-in.md).
2. [Traza sanitizada del reuse nativo](../thesis/evidence/2026-09-12-native-interrupt-reuse-trace.json).
3. [Plan 39](../plan-prompts/39-user-preemptible-group-call-floor.md) y [ADR 0026](../thesis/decision-records/0026-user-preemptible-group-call-floor.md). Distinguir su implementación actual de reemplazo de la propuesta nueva todavía pendiente.
4. [Guía operativa](../integrations/group-calls-elevenlabs-liveavatar.md), [guía QA](../../tools/group-call-qa/README.md) y [estudio de caso](../thesis/group-call-audio-stability-case-study.md).

Fuentes oficiales ya contrastadas: [connector ElevenLabs](https://docs.liveavatar.com/docs/lite-mode/connectors/elevenlabs-agent), [eventos de control](https://docs.liveavatar.com/docs/full-mode/events). En esta integración LITE con connector, el canal de control usa eventos FULL; no confundirlo con el protocolo websocket raw de LITE.

## 8. Orden recomendado para retomar

1. Leer este handoff y la evidencia, inspeccionar estado git y preservar cambios concurrentes. No rehacer la investigación desde cero ni mezclar la vieja rama experimental con esta base.
2. Acordar el contrato mínimo de resolución de reutilización entre frontend/backend; implementar guardas de receipt/ronda/attempt con tests transaccionales.
3. Sustituir el reemplazo incondicional por reutilización confirmada; mantener gate, serialización y atribución de eventos/correcciones, con recovery explícito.
4. Probar ausencia de terminal, A→B/ACK atrasado, mismo avatar, backchannels y cierre; mantener la regresión de continuaciones +645 ms y respuestas cortas.
5. Ejecutar suites y después ensayos sandbox de recorrido completo, tanto mismo avatar como otro. No acreditar entrega por resolver `publishData` ni aceptación por RMS solamente.
6. Completar QA físico desktop/mobile, parlantes/auriculares, DevTools cerrado, repetidas interrupciones, eco/backchannels y comparación con fuente ElevenLabs. El usuario ya mostró que tests verdes no bastan.
7. Actualizar documentación con resultados realmente obtenidos. No push/PR/main sin pedido explícito.

Al entregar el próximo resultado, distinguir con claridad qué se implementó, qué se probó con mocks, qué con provider real y qué falta físicamente. No volver a decir que «se arregló la desconexión» si la app todavía reemplaza la conexión en cada corte.
