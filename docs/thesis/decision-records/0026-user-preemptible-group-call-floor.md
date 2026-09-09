# Floor grupal preemptivo exclusivo del usuario

## Estado

accepted

Decisión de producto y reconstrucción aceptada; **implementación fase 1 EN VALIDACIÓN al 2026-09-09**. Este estado no afirma que las interrupciones estén habilitadas ni validadas. La base operativa conserva [ADR 0018](0018-atomic-elevenlabs-group-agents.md) y [ADR 0019](0019-strict-floor-independent-liveavatar-group-sessions.md); no se los marca como sustituidos por una implementación que aún debe superar QA.

## Fecha y plan relacionado

Decisión original: 2026-08-24. Enmiendas históricas: 2026-08-25, 2026-08-27 y 2026-08-28. Reconstrucción: 2026-09-08. Ajuste acotado del cierre natural: 2026-09-09.

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

La [comparación con providers del 2026-09-08](../evidence/2026-09-08-group-provider-command-contract.md) reprodujo el fallo de envío con `group-turn:...` y obtuvo recepción más audio con la API pública `0.0.18`, la base `0.0.17` sin ID y un UUID manual. No se infiere de la comparación la semántica interna del validador del worker. La aplicación real con STT simulado completó los tres turnos, pero la medición detectó energía del stream con el gate muteado y continuaciones suprimidas. Queda validado el contrato de comandos; **no se acepta todavía la reproducción completa ni se habilitan interrupciones**. Se mantiene el checkpoint de fase 1 hasta resolver ese límite.

No se habilita barge-in, no se cambia TTS y no se incorpora el antiguo reducer acústico antes de aceptar esa base. El documento operativo distingue este estado del flujo objetivo que sigue.

### Cierre natural de voz en fase 1

Se incorpora una barrera de cierre de **1.000 ms** sobre el floor existente, sin introducir otro floor ni un reducer acústico. El valor responde a continuaciones observadas aproximadamente **638–642 ms** después de un `speak_ended`; es una heurística de estabilización del canal de control, no un ACK de reproducción ni una garantía sobre el último sample audible. La [evidencia del ajuste de cierre](../evidence/2026-09-09-group-speech-completion.md) conserva el detalle de la observación y el estado de su validación.

- Un `speak_ended` crea un candidato, pero todavía no confirma el fin al backend. Mientras espera, la autorización local sigue en `speaking`, el owner permanece audible y el backend conserva su turno y lease.
- Un nuevo start del owner invalida ese candidato **antes** del dedupe lógico del turno. La continuación no genera otra confirmación de inicio ni un `interrupt()`; los duplicados del mismo evento de control no reinician el plazo.
- Al vencer el plazo, la finalización se encola. Dentro de la cola se vuelven a comprobar la instancia, la autorización y la vigencia del candidato; sólo entonces se consume una vez, se cierra el audio, se pasa a `committing` y se confirma el end. Un start recibido mientras la cola espera un ACK anterior invalida incluso ese candidato ya encolado.
- El saludo de startup permanece muteado y usa su propia barrera. Se conserva el límite de preparación existente como mecanismo de seguridad.
- Las fuentes de habla ya finalizadas se recuerdan de forma acotada en cada instancia y sus eventos tardíos se ignoran, sin impedir la reentrega idempotente del end vigente si falló su confirmación. Esto no exige que `source_event_id` sea el UUID del comando ni descarta por defecto los eventos que no lo traigan.
- El gate mutea primero todos los no-owners y abre al owner al final; reaplicar el mismo owner no lo mutea transitoriamente. Release, timeout, falla del owner, reemplazo de instancia y cierre invalidan candidatos; el cleanup elimina timers y listeners.

La barrera no renueva indefinidamente la lease ni demuestra que un connector interrumpido pueda reutilizarse. Puede agregar una pausa al cambio de interlocutor y no garantiza absorber toda continuación tardía. Este ajuste no incorpora WebAudio, métricas de reproducción en producto, nuevos presets TTS ni barge-in. El checkpoint del 2026-09-09 pasó tres rondas deterministas con providers (nueve respuestas, cero PCM bloqueado observado); otro ensayo largo agotó el tiempo del harness y se conserva como no aprobado. La fase 1 sigue **EN VALIDACIÓN** para QA físico, Scribe real y condiciones degradadas; estos resultados no habilitan interrupciones.

### Interrupción humana objetivo

- Scribe es la única entrada humana. Una frase significativa durante la respuesta detiene perceptiblemente el audio y origina la cancelación autenticada de la ronda anclada al turno esperado.
- El corte y la cancelación no esperan `agent_response_correction`, persistencia de fragmentos ni timers de gracia textual. El committed puede llegar antes o después del ACK y se conserva para un solo nuevo ruteo.
- La cancelación cancela la cola restante de esa ronda. Un avance A→B en la misma ronda también se cancela; un evento anterior no modifica una ronda posterior.
- Un evento provider `interruption` es evidencia del provider, no autoridad para cancelar una ronda por sí mismo. La reutilización del connector depende de un contrato verificado; `interrupt(): void` no es ACK.
- Los backchannels, ecos y duplicados deben cubrirse mediante pruebas reales y regresiones. Los valores de 300/750 ms del intento anterior no son garantías del provider ni defaults adoptados sin medición.

### Contexto de la respuesta interrumpida

Se mantendrán separados el borrador generado, el fragmento informado por el provider y el estado pendiente o de exposición desconocida. El orquestador y el próximo avatar recibirán esa distinción antes de elaborar la respuesta al nuevo pedido.

`agent_response` completo es un borrador: llega al comienzo de la reproducción. Una `agent_response_correction` atribuida al turno puede aportar su fragmento truncado. La transcripción LiveAvatar también es evidencia de texto del Agent, no una medición exacta de lo oído. No se inferirá el fragmento por duración, conteo de caracteres ni movimiento de boca.

Si falta una corrección confiable, se conserva el borrador como generado y se marca como desconocida su exposición; no se convierte el texto completo en un mensaje ya pronunciado. Sólo se calcula una parte pendiente exacta cuando el fragmento puede relacionarse de forma inequívoca con el borrador; de lo contrario esa parte también conserva incertidumbre. Una corrección tardía se atribuye al turno original y actualiza su evidencia, sin reabrirlo ni cancelar una ronda nueva. La ausencia de corrección no debe bloquear el corte o la cancelación.

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
    C->>C: cortar audio del owner
    C->>B: cancelar ronda esperada
    par cancelación autoritativa
        B->>B: cancelar ronda y cola
        B-->>C: confirmación
    and entrada humana
        S-->>C: transcript committed
    and evidencia de respuesta
        C-->>B: borrador y fragmento provider si existe
    end
    Note over C,B: el corte no espera corrección; faltantes quedan desconocidos
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

La fase 1 exige llamadas normales con tres avatares, respuestas breves y largas, secuencia de turnos y recepción de mensajes en ElevenLabs. Sólo después se validará la interrupción y el contexto con parciales duplicados, commit antes/después del ACK, carrera A→B, eventos tardíos, cierre y cambio de epoch.

Se requieren parlantes y auriculares, desktop y mobile, DevTools cerrado y comparación de grabación fuente con navegador. No se declara resuelto el audio por aprobar tests unitarios. Las métricas y resultados se registran en el estudio de caso después de ejecutarlos.

No existe identificación biométrica ni garantía de fade-out exacto. La corrección provider puede llegar tarde y no certifica el último sample audible del navegador. La expresividad de `eleven_v3_conversational` y `filterBackgroundAudio` se probarán aparte; cambiar un modelo no corrige una orden que no llegó al Agent.

## Fuentes

- [Guía operativa grupal](../../integrations/group-calls-elevenlabs-liveavatar.md)
- [Evidencia del cierre natural de voz](../evidence/2026-09-09-group-speech-completion.md)
- [SDK npm](https://www.npmjs.com/package/@heygen/liveavatar-web-sdk) y [tarball 0.0.18](https://registry.npmjs.org/@heygen/liveavatar-web-sdk/-/liveavatar-web-sdk-0.0.18.tgz)
- [ElevenLabsAgentSession del commit publicado](https://github.com/heygen-com/liveavatar-web-sdk/blob/5faad721ef991bd7ddba9dcbc9827d5426f7b9ca/packages/js-sdk/src/LiveAvatarSession/ElevenLabsAgentSession.ts)
- [Tipos del protocolo publicado](https://github.com/heygen-com/liveavatar-web-sdk/blob/5faad721ef991bd7ddba9dcbc9827d5426f7b9ca/packages/js-sdk/src/LiveAvatarSession/events.ts)
- [LiveAvatar ElevenLabs Agent Connector](https://docs.liveavatar.com/docs/lite-mode/connectors/elevenlabs-agent)
- [ElevenLabs: eventos y correcciones](https://elevenlabs.io/docs/eleven-agents/customization/events/client-events)
- [ElevenLabs: contexto y mensajes](https://elevenlabs.io/docs/eleven-agents/customization/events/client-to-server-events)
- [Scribe Realtime](https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime)

## Preguntas futuras

Quedan para evaluaciones independientes el soporte multicliente, el fallback manual accesible, la utilidad del filtrado de fondo y una eventual integración que permita acreditar mejor la reproducción efectiva. La compatibilidad de `agent_response_complete` con el worker LiveAvatar debe medirse antes de usarla como condición de avance.
