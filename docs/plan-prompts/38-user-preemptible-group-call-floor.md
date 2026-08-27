# 38 - Floor grupal preemptivo exclusivo del usuario

## Estado

Implementado con alcance reducido el 2026-08-25 después de QA real. Se conserva el barge-in por voz; se retiró la persistencia causal del fragmento audible y el state machine asociado.

## Objetivo

Permitir que la persona interrumpa por voz una ronda grupal en curso sin habilitar interrupciones entre avatares ni duplicar entradas de audio.

## Problema

El floor estricto del plan 37 eliminó la superposición entre avatares, pero también descartaba la voz humana mientras una ronda estaba activa. La persona debía esperar incluso ante una respuesta larga, incorrecta o basada en una intención que quería corregir.

El alcance inicial intentó además persistir el fragmento audible del avatar, reconciliar una corrección tardía del provider y coordinar ACK, transcript committed y una gracia temporal antes del nuevo ruteo. En QA real esa coordinación entre audio gate, callbacks del provider, persistencia, timers y floor produjo regresiones críticas: avatares simultáneos y streams que quedaban en silencio. Para priorizar una llamada estable, el plan se redujo al corte y reenrutado mínimos.

## Resultado esperado

- Scribe sigue siendo la única entrada humana y los micrófonos de todos los connectors LiveAvatar permanecen muteados.
- El primer transcript parcial significativo mutea inmediatamente todos los medios, interrumpe sólo al owner capturado y cancela la ronda completa en el backend.
- Si el transcript humano committed llega antes del ACK, se bufferiza. Después de confirmar la cancelación se abre exactamente una nueva ronda con ese texto.
- El gate permanece cerrado hasta que la respuesta fresca de ese nuevo `/turns` autoriza otro owner.
- Los eventos propios de los avatares no pueden preemptar el floor ni afectar una ronda posterior.
- La interfaz explica que se puede hablar para interrumpir y el control de micrófono sigue disponible durante el turno del avatar.

## Alcance

- Detección del corte mediante `PARTIAL_TRANSCRIPT` significativo, con exclusión de backchannels aislados.
- Mute local inmediato e `interrupt()` del SDK sólo sobre el owner actual.
- Supresión con `session.interrupt()` de cada saludo automático de startup, sin tratarlo como barge-in humano.
- Cancelación autoritativa e idempotente de la ronda completa mediante una receipt mínima sin contenido, y liberación del floor en el backend.
- Buffer mínimo del `COMMITTED_TRANSCRIPT` hasta el ACK y envío de un único turno humano nuevo.
- El POST de cancelación sale directo después del mute/`interrupt()`, fuera de la cola de orquestación; un latch reúne ACK y commit, y sólo el nuevo `/turns` entra en la cola causal de eventos que afectan el floor.
- Estado de UI y pruebas de lifecycle e integración para el flujo reducido.

Quedan fuera de alcance la persistencia del fragmento audible, `agent_response_correction` como dependencia del barge-in, mensajes de historial con metadata `interrupted`, timers de gracia, recovery/retry manual o automático específico de interrupciones, identificación biométrica, un micrófono por connector, interrupciones entre avatares, el fallback manual compartido, una sala LiveKit común y VAD o WebAudio adicional a Scribe.

## Alcance original retirado

La versión aceptada el 2026-08-24 proponía enriquecer la receipt con contenido y coordinarla con captura de `AVATAR_TRANSCRIPTION`, corrección tardía, una gracia de un segundo, persistencia causal del fragmento y un estado de recovery dedicado. Esas piezas no forman parte de la implementación vigente. Sólo se conserva una receipt sin texto para deduplicar la cancelación; el resto queda en [ADR 0023](../thesis/decision-records/0023-user-preemptible-group-call-floor.md) como hipótesis evaluada y descartada tras QA.

## Invariantes

- Como máximo un avatar puede ser audible.
- Cada startup cue se corta en el provider y mantiene el gate en `null`; mutearlo sin interrumpirlo no es suficiente.
- Sólo la voz capturada por el micrófono único y transcripta por Scribe puede originar un barge-in humano.
- Interrumpir cancela toda la ronda vigente, no sólo al avatar que estaba hablando.
- El transcript committed no abre una nueva ronda hasta que el backend confirma que la anterior fue cancelada y el floor quedó libre.
- Cada intervención committed se enruta una sola vez.
- Sólo una directiva fresca del nuevo `/turns` puede volver a abrir el gate.
- La respuesta parcial interrumpida no se persiste ni se incorpora al contexto siguiente.
- Reintentos con el mismo `sourceEventId` son idempotentes y una receipt vieja nunca cancela una ronda posterior.
- Si el floor avanzó dentro de la misma ronda, el cliente procesa la directiva del ACK y corta al owner nuevo antes de confirmar la cancelación.
- Cualquier `speak_started` tardío mientras el corte está pendiente se suprime localmente sin otro POST ni mutación de floor.
- Correcciones o callbacks tardíos del turno interrumpido se rechazan por lease inválido y no crean mensajes.
- Eventos tardíos o propios del provider no pueden originar otra preempción humana.

## Aceptación

Durante una respuesta grupal, decir “pará”, “esperá” o “sí, pero esperá” corta una sola vez al owner actual, cancela a los participantes restantes, libera el floor y enruta una sola vez la intervención completa cuando Scribe la confirma. Decir únicamente “sí”, “ajá”, “ok”, “dale”, “claro”, “mmm” o “eh” no interrumpe. El gate permanece cerrado hasta la directiva fresca de la ronda nueva. El flujo no crea un mensaje parcial del avatar ni espera correcciones o timers de gracia, y una ronda posterior mantiene un único hablante audible.

## Decisión asociada

- [ADR 0023: Floor grupal preemptivo exclusivo del usuario](../thesis/decision-records/0023-user-preemptible-group-call-floor.md)
