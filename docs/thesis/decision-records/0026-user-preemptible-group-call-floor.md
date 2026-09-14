# Floor grupal preemptivo exclusivo del usuario

## Estado

accepted

Decisión de producto y reconstrucción aceptada; **fases 2 y 3 implementadas para validación al 2026-09-12; aceptación formal y QA físico de interrupciones PENDIENTES**. El usuario confirmó la recuperación de voz y pidió continuar con el barge-in. La migración aditiva se aplicó sólo a desarrollo, después de un backup y verificando conteos; no hubo despliegue a producción. El [checkpoint técnico con providers y Scribe simulado](../evidence/2026-09-12-group-human-barge-in.md) distingue las verificaciones favorables del oráculo experimental inconcluso y conserva el ensayo fallido previo. La base operativa conserva [ADR 0018](0018-atomic-elevenlabs-group-agents.md) y [ADR 0019](0019-strict-floor-independent-liveavatar-group-sessions.md); no se los marca como sustituidos por una implementación que aún debe superar QA.

## Fecha y plan relacionado

Decisión original: 2026-08-24. Enmiendas históricas: 2026-08-25, 2026-08-27 y 2026-08-28. Reconstrucción: 2026-09-08. Ajuste acotado del cierre natural: 2026-09-09. Implementación de interrupción y contexto: 2026-09-12.

[Plan 39](../../plan-prompts/39-user-preemptible-group-call-floor.md). El relato, la evidencia y los resultados pendientes están en el [estudio de estabilidad grupal](../group-call-audio-stability-case-study.md).

## Contexto

El floor estricto evita que los avatares hablen simultáneamente, pero obliga a la persona a esperar ante una respuesta larga, incorrecta o ya irrelevante. Scribe puede seguir capturando su voz mientras la ronda está activa, aunque la base no la utilice para cambiar el turno. La cola restante sigue una intención anterior y la conversación pierde naturalidad.

El usuario requiere detener al hablante, escuchar la frase nueva y dejar que el orquestador decida el siguiente turno, teniendo en cuenta la respuesta que fue interrumpida. Ese contexto debe distinguir lo generado de lo que pudo oírse y de lo que quedó pendiente; no puede presentar como dicho un texto que sólo fue generado.

## Historia conservada

El diseño inicial coordinaba fragmento, corrección tardía, receipt, ACK, commit y una gracia temporal. El QA del 2026-08-25 mostró superposición y silencio, por lo que se redujo al corte y reenrutado sin fragmento. El 2026-08-27 se restringió el candidato a voz iniciada durante un turno hablando. El 2026-08-28 se agregó un floor acústico, drain de 750 ms, clasificación híbrida de 300 ms y diagnóstico de medio.

La implementación acumulada, preservada en `afa73e88e4944572e449f358314490775419d753`, no superó la validación con proveedores. La prueba del 2026-09-08 volvió a mostrar turnos silenciosos sin una interrupción humana registrada. Esa evidencia invalida usar su cobertura automatizada como prueba de estabilidad. Las decisiones y resultados históricos siguen disponibles en el estudio y en Git; no se importan como capacidades terminadas.

## Alternativas consideradas

1. Continuar reparando toda la rama acumulada: mezcla cambios de transporte, reproducción, corte, TTS y contexto, dificultando atribuir una regresión.
2. Mantener el bloqueo humano: conserva el comportamiento base, pero no cumple la experiencia solicitada.
3. Dar un micrófono a cada Agent: duplica entrada y puede activar varios interlocutores fuera del orquestador.
4. Ofrecer sólo un botón manual o agregar otro VAD: introduce otro flujo de interacción o captura sin resolver el contrato de comandos actual.
5. Migrar a Speech Engine u otro pipeline completo: posible evolución, pero cambia simultáneamente voz, contexto, transporte y operación.
6. Reconstruir desde `main`, validar primero el transporte público y agregar una capacidad por vez: opción elegida.

## Decisión

El floor será asimétrico: estricto entre avatares y preemptivo para la voz humana del Scribe único. YUNI conservará la autoridad para cancelar toda la ronda y decidir el próximo participante. Se reconstruirá sobre una rama limpia desde la base funcional de `main`, preservando el intento anterior para recuperar pruebas y aprendizajes selectivamente.

La primera fase fija `@heygen/liveavatar-web-sdk@0.0.18` y utiliza `ElevenLabsAgentSession` para los comandos grupales. Su API publicada genera UUID v4 y agrega la identidad de sesión. Los IDs internos de YUNI se correlacionan localmente con el ID retornado; no se usan como `event_id` del protocolo externo. La primera aceptación exige evidencia de recepción de `user_message` y voz real, además de mocks.

La [comparación con providers del 2026-09-08](../evidence/2026-09-08-group-provider-command-contract.md) reprodujo el fallo de envío con `group-turn:...` y obtuvo recepción más audio con la API pública `0.0.18`, la base `0.0.17` sin ID y un UUID manual. No se infiere de la comparación la semántica interna del validador del worker. La aplicación real con STT simulado completó los tres turnos, pero la medición detectó energía del stream con el gate muteado y continuaciones suprimidas. En ese checkpoint quedó validado el contrato de comandos, pero no se aceptó la reproducción completa ni se habilitaron interrupciones.

La fase 1 aisló ese problema sin cambiar TTS ni incorporar el antiguo reducer acústico. Después del ajuste del cierre y de la recuperación de voz confirmada por el usuario, el incremento del 2026-09-12 implementa las interrupciones para validarlas. No vuelve a modificar SDK, TTS o cierre natural. El lip-sync intermitente queda fuera de alcance por decisión explícita del usuario.

### Cierre natural de voz en fase 1

Se incorpora una barrera de cierre de **1.000 ms** sobre el floor existente, sin introducir otro floor ni un reducer acústico. El valor responde a continuaciones observadas aproximadamente **638–642 ms** después de un `speak_ended`; es una heurística de estabilización del canal de control, no un ACK de reproducción ni una garantía sobre el último sample audible. La [evidencia del ajuste de cierre](../evidence/2026-09-09-group-speech-completion.md) conserva el detalle de la observación y el estado de su validación.

- Un `speak_ended` crea un candidato, pero todavía no confirma el fin al backend. Mientras espera, la autorización local sigue en `speaking`, el owner permanece audible y el backend conserva su turno y lease.
- Un nuevo start del owner invalida ese candidato **antes** del dedupe lógico del turno. La continuación no genera otra confirmación de inicio ni un `interrupt()`; los duplicados del mismo evento de control no reinician el plazo.
- Al vencer el plazo, la finalización se encola. Dentro de la cola se vuelven a comprobar la instancia, la autorización y la vigencia del candidato; sólo entonces se consume una vez, se cierra el audio, se pasa a `committing` y se confirma el end. Un start recibido mientras la cola espera un ACK anterior invalida incluso ese candidato ya encolado.
- El saludo de startup permanece muteado y usa su propia barrera. Se conserva el límite de preparación existente como mecanismo de seguridad.
- Las fuentes de habla ya finalizadas se recuerdan de forma acotada en cada instancia y sus eventos tardíos se ignoran, sin impedir la reentrega idempotente del end vigente si falló su confirmación. Esto no exige que `source_event_id` sea el UUID del comando ni descarta por defecto los eventos que no lo traigan.
- El gate mutea primero todos los no-owners y abre al owner al final; reaplicar el mismo owner no lo mutea transitoriamente. Release, timeout, falla del owner, reemplazo de instancia y cierre invalidan candidatos; el cleanup elimina timers y listeners.

La barrera no renueva indefinidamente la lease ni demuestra que un connector interrumpido pueda reutilizarse. Puede agregar una pausa al cambio de interlocutor y no garantiza absorber toda continuación tardía. Ese ajuste no incorporó WebAudio, métricas de reproducción en producto, nuevos presets TTS ni barge-in. El checkpoint del 2026-09-09 pasó tres rondas deterministas con providers (nueve respuestas, cero PCM bloqueado observado); otro ensayo largo agotó el tiempo del harness y se conserva como no aprobado. Estos resultados no equivalen a QA físico de interrupciones, que sigue pendiente en el incremento siguiente.

### Interrupción humana implementada para validación, 2026-09-12

- Scribe es la única entrada humana. El primer parcial crea un episodio; sólo se habilita el corte por parcial si empezó mientras el owner estaba `speaking`, incluida su espera de cierre natural. Los comandos iniciales de detención y `sí/ok/dale + pero` cortan de inmediato. Otra frase significativa usa 300 ms desde el primer candidato, sin renovar el plazo con cada parcial; un committed anticipado es fallback.
- Los backchannels aislados y sus combinaciones se ignoran. Se incluyen `Okey.`, `sí sí` y `ok dale`, mientras `sí, pero…` sigue siendo significativo. `para` dentro de una frase no se trata como orden inmediata. El texto generado por avatar alimenta una heurística efímera de eco de 2,5 segundos y hasta 64 tokens; palabras nuevas vuelven a la clasificación normal. Son heurísticas de producto pendientes de QA físico, no garantías del provider.
- Un parcial que empezó en preparación no interrumpe. Su committed se conserva: cancela la ronda obsoleta al poder anclarla o se procesa como entrada normal al volver a `listening`. El micrófono puede activarse o desactivarse durante la voz del avatar, pero el toggle se bloquea mientras la captura de una interrupción está en curso.
- El cliente cierra todos los medios **antes** del HTTP y de llamar `interrupt()` sobre el owner capturado. Una generación local de control invalida callbacks y ACKs previos al corte. Se mantiene la cola serializada para el recorrido normal; la recuperación confirmada no queda encadenada a un request anterior que no terminó.
- El corte y la cancelación no esperan `agent_response_correction`, persistencia de fragmentos ni timers de gracia textual. El committed puede llegar antes o después del ACK y se conserva para un solo nuevo ruteo.
- La cancelación autenticada usa `reason: "user"`, `trigger: "voice"`, `sourceEventId`, avatar y turno esperados. Una transacción persiste una receipt única por sesión/evento, cancela la ronda completa y libera su floor. Un avance A→B dentro de esa ronda también se cancela; una ronda posterior responde `stale` sin mutación.
- La cancelación tiene hasta tres intentos con el mismo identificador. Un fallo conserva la intervención y mantiene todos los medios muteados, con recuperación explícita; no se abre una ronda consistente sólo en apariencia.
- Un evento provider `interruption` es evidencia/telemetría, nunca autoridad para cancelar una ronda. El incremento del 2026-09-12 usó reemplazo obligatorio. La revisión local del 2026-09-13 lo sustituye por ACK de reutilización de cada attempt sano vinculado a receipt/turno y terminal con fuente observada, o evidencia explícita de no despacho. La reconexión requiere recuperación; ni una espera fija ni `interrupt(): void` prueban limpieza. No se da por validada la reproducción física de esta revisión.

### Contexto de la respuesta interrumpida

Se mantienen separados el borrador generado, el fragmento informado por el provider y el estado pendiente o de exposición desconocida. `GroupVoiceInterruptionEvent` conserva la receipt y `GroupVoiceInterruptedTurn` la evidencia por turno. El orquestador y el próximo avatar reciben esa distinción antes de elaborar la respuesta al nuevo pedido, también en los transportes de acceso owner, compartido y público.

`agent_response` completo es un borrador: llega al comienzo de la reproducción. Una `agent_response_correction` atribuida al turno puede aportar su fragmento truncado. La transcripción LiveAvatar también es evidencia de texto del Agent, no una medición exacta de lo oído. No se inferirá el fragmento por duración, conteo de caracteres ni movimiento de boca.

Si falta una corrección confiable, se conserva el borrador como generado y se marca como desconocida su exposición; no se convierte el texto completo en un mensaje ya pronunciado. Sólo se calcula una parte pendiente exacta cuando el fragmento puede relacionarse de forma inequívoca con el borrador; de lo contrario esa parte también conserva incertidumbre. Una corrección tardía se atribuye al turno original y actualiza su evidencia, sin reabrirlo ni cancelar una ronda nueva. La ausencia de corrección no debe bloquear el corte o la cancelación.

El historial muestra el fragmento informado cuando existe, con `interrupted: true`; nunca el borrador completo como respuesta pronunciada. Las respuestas completadas antes del corte se conservan. Los logs registran IDs, razones y longitudes, no el contenido textual. La migración nueva `20260912120000_group_human_interruption_context` es aditiva y se validó en PostgreSQL aislado antes de aplicarse a desarrollo con backup. El modelo `GroupVoiceInterruptionEvent` usa `@@map("GroupVoiceHumanInterruptionReceipt")` para preservar intacta la tabla experimental anterior. Los conteos verificados antes/después fueron idénticos y no se tocó producción; el checkpoint conserva el detalle.

La evidencia real del 2026-09-08 respalda esta precaución: un corte sandbox produjo terminal a los 489 ms y PCM remoto hasta los 680 ms, pero ninguna corrección viva en 12 segundos. ElevenLabs sí guardó una respuesta truncada e interrumpida al finalizar. El `source_event_id` del terminal no fue el UUID del comando humano. Por eso se debe verificar correlación y reutilización con el contrato observado; el ensayo no probó reutilización segura ni autoriza convertir el historial final en certeza acústica.

```mermaid
sequenceDiagram
    participant U as Usuario
    participant S as Scribe único
    participant C as Cliente y LiveAvatar
    participant B as Backend YUNI
    participant R as Orquestador
    U->>S: nueva frase durante la respuesta
    S-->>C: habla significativa
    C->>C: cerrar medios e invalidar control anterior
    C->>C: interrupt local del owner capturado
    C->>B: cancelar ronda esperada
    par cancelación autoritativa
        B->>B: receipt, contexto y cancelación de ronda/cola
        B-->>C: confirmación
    and entrada humana
        S-->>C: transcript committed
    and evidencia de respuesta
        C-->>B: borrador y fragmento provider si existe
    end
    Note over C,B: el corte no espera corrección; faltantes quedan desconocidos
    C->>C: conservar terminal correlacionado o prueba de no despacho
    C->>B: interruption-ready por cada receipt/turno/attempt
    B-->>C: ACK de reutilización
    Note over C,B: sin evidencia: frase retenida y recuperación explícita
    C->>B: nueva intervención una sola vez
    B->>R: contexto distinguido y nuevo pedido
    R-->>B: próximo participante
    B-->>C: directiva nueva con contexto actualizado
```

## Invariantes

- Como máximo un avatar audible y un único canal humano de captura.
- La persona puede cambiar la intención; ningún avatar puede preemptar a otro por decisión propia.
- Toda cancelación humana se ancla a sesión, ronda y turno, con idempotencia independiente del ID del comando provider.
- El nuevo pedido no se pierde ni se procesa dos veces por el orden ACK/commit.
- Generado, informado por provider y realmente oído no son conceptos intercambiables.
- Los eventos tardíos no mutan un turno nuevo ni liberan su floor.
- La calidad de red y la telemetría no autorizan voces ni alteran el flujo conversacional.

## Validación, límites y rollout

La fase 1 exigió llamadas normales con tres avatares, respuestas breves y largas, secuencia de turnos y recepción de mensajes en ElevenLabs. La recuperación reportada por el usuario permite avanzar con la implementación de las fases 2/3; no reemplaza la aceptación de interrupción y contexto con parciales duplicados, commit antes/después del ACK, carrera A→B, eventos tardíos, cierre y cambio de epoch. El checkpoint ejecutó 431 tests web, 286 API y 86 DB, además de AI/domain/voice, herramientas, typecheck y lint. El [estudio de caso](../group-call-audio-stability-case-study.md#suites-ejecutadas-en-el-checkpoint-del-2026-09-12) distingue la primera salida web fallida de la repetición limpia y conserva los totales; no se reutilizan los resultados de fase 1 como evidencia de barge-in.

Se requieren parlantes y auriculares, desktop y mobile, DevTools cerrado y comparación de grabación fuente con navegador. No se declara resuelto el audio por aprobar tests unitarios. Las métricas y resultados se registran en el estudio de caso después de ejecutarlos.

Los ensayos técnicos del 2026-09-12 con Scribe simulado observaron cierres del gate en 15 y 24 ms, máximo un elemento desmuteado, una receipt por intervención y audio después del nuevo ruteo. Se ejercitó tanto la elección de otro avatar como la del mismo sobre un connector nuevo. Ambos cumplieron once comprobaciones técnicas dirigidas, pero sus oráculos experimentales quedaron inconclusos: no se convierte esa evidencia parcial en aceptación formal ni en validación de eco/micrófono real. Un primer intento devolvió HTTP 500 y se conserva con causa sin confirmar. Los IDs y resultados están en la [evidencia del checkpoint](../evidence/2026-09-12-group-human-barge-in.md).

Las receipts reales conservaron borradores e incertidumbre, sin fragmento informado ni mensaje assistant interrumpido porque no llegó una corrección provider observada. La actualización del historial con ese fragmento está cubierta por pruebas automatizadas; no se presenta como comprobada con el proveedor en esos dos ensayos.

No existe identificación biométrica ni garantía de fade-out exacto. El reemplazo del connector prioriza aislamiento de episodios y agrega latencia de reconexión y costo operativo. Los dos ensayos técnicos midieron 7,5–8,4 segundos desde el parcial inyectado hasta la primera energía de la respuesta nueva, incluyendo reemplazo, ruteo y generación: ese costo sigue pendiente de optimización y evaluación física, no se presenta como objetivo de naturalidad. La corrección provider puede llegar tarde, perderse al detener la sesión anterior y no certifica el último sample audible del navegador. La expresividad de `eleven_v3_conversational` y `filterBackgroundAudio` se probarán aparte; cambiar un modelo no corrige una orden que no llegó al Agent. Lip-sync, presets de voz, SDK y diagnósticos técnicos visibles no forman parte del incremento del 2026-09-12.

## Fuentes

- [Guía operativa grupal](../../integrations/group-calls-elevenlabs-liveavatar.md)
- [Evidencia del cierre natural de voz](../evidence/2026-09-09-group-speech-completion.md)
- [Evidencia de interrupción humana y migración local](../evidence/2026-09-12-group-human-barge-in.md)
- [SDK npm](https://www.npmjs.com/package/@heygen/liveavatar-web-sdk) y [tarball 0.0.18](https://registry.npmjs.org/@heygen/liveavatar-web-sdk/-/liveavatar-web-sdk-0.0.18.tgz)
- [ElevenLabsAgentSession del commit publicado](https://github.com/heygen-com/liveavatar-web-sdk/blob/5faad721ef991bd7ddba9dcbc9827d5426f7b9ca/packages/js-sdk/src/LiveAvatarSession/ElevenLabsAgentSession.ts)
- [Tipos del protocolo publicado](https://github.com/heygen-com/liveavatar-web-sdk/blob/5faad721ef991bd7ddba9dcbc9827d5426f7b9ca/packages/js-sdk/src/LiveAvatarSession/events.ts)
- [LiveAvatar ElevenLabs Agent Connector](https://docs.liveavatar.com/docs/lite-mode/connectors/elevenlabs-agent)
- [ElevenLabs: eventos y correcciones](https://elevenlabs.io/docs/eleven-agents/customization/events/client-events)
- [ElevenLabs: contexto y mensajes](https://elevenlabs.io/docs/eleven-agents/customization/events/client-to-server-events)
- [Scribe Realtime](https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime)

## Preguntas futuras

Quedan para evaluaciones independientes el soporte multicliente, el fallback manual accesible, la utilidad del filtrado de fondo y una eventual integración que permita acreditar mejor la reproducción efectiva. La compatibilidad de `agent_response_complete` con el worker LiveAvatar debe medirse antes de usarla como condición de avance.

## Revisión de continuidad — 2026-09-13

La conexión sana permanece abierta después de un corte. Las fuentes retiradas se conservan durante la vida del connector; el nuevo start debe tener fuente nueva antes de abrir su audio. Un end sin fuente o de otra respuesta no confirma el turno actual. Las correcciones con identidad o texto original permanecen asociadas al turno anterior; cuando no hay atribución suficiente se descartan sin inventar historial. La barrera natural de continuaciones sigue vigente.

ACK, retry y nueva ronda comparten el lock de sesión. La resolución guarda evidencia reportada por el cliente autenticado en el JSON existente; no crea una migración, no reactiva un participante ni modifica mensajes. Un retry de receipt liberada no reemplaza conexiones activas. Si el ACK se perdió y luego falla realmente ese attempt, la recuperación exige el ID exacto y ambos estados persistidos `errored`.

La [evidencia del incremento](../evidence/2026-09-13-group-interruption-reuse.md) distingue implementación, pruebas deterministas y QA real pendiente. Los tiempos medidos el 2026-09-12 corresponden al diseño anterior o al probe aislado; no son mediciones de esta revisión.
